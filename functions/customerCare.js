const { createHash } = require('crypto');
const { isOfficialPayment } = require('./customerDebtPayment');
const text = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim().toLowerCase();
const millis = value => value?.toMillis ? value.toMillis() : typeof value === 'number' ? value : Date.parse(value || '') || 0;
const day = value => {
  const time = millis(value);
  return time ? new Date(time + 7 * 3600000).toISOString().slice(0, 10) : '';
};
const customerIdOf = row => row?.customerId || row?.customer_id || row?.customer?.id || '';
const activeOrder = row => row && !row.isArchived && !row.isCancelled && ![row.status, row.deliveryStatus, row.orderStatus, row.reviewStatus].some(value => ['cancelled', 'canceled', 'deleted', 'huy', 'da huy'].includes(text(value)));
const delivered = row => activeOrder(row) && (row.isDelivered === true || row.delivered === true || ['delivered', 'completed', 'complete', 'da giao', 'hoan thanh'].includes(text(row.deliveryStatus ?? row.fulfillmentStatus ?? row.status)));
const paid = row => row && !row.isArchived && Number(row.amount ?? row.paymentAmount) > 0 && isOfficialPayment(row);
const employeeIdOf = row => row.empId || row.assignedEmployeeId || row.salesEmpId || row.managerEmpId || row.employeeId || row.responsibleEmployeeId || '';

function eventRules(collection, before, after) {
  if (collection === 'payments') return paid(after) && !paid(before) ? ['payment'] : [];
  if (collection !== 'orders' || !activeOrder(after)) return [];
  return [...(!before ? ['first_order'] : []), ...(delivered(after) && !delivered(before) ? ['delivered'] : [])];
}

function calendarEvents(customer, orders, rules, now) {
  const today = day(now);
  const events = [];
  const birthday = String(customer.birthday || customer.dateOfBirth || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(birthday) && birthday.slice(5) === today.slice(5)) events.push(['birthday', today]);
  if (Array.isArray(rules.holiday?.holidayDates) && rules.holiday.holidayDates.includes(today)) events.push(['holiday', today]);
  const latest = orders.filter(activeOrder).sort((a, b) => millis(b.date || b.createdAt) - millis(a.date || a.createdAt))[0];
  const base = latest?.date || latest?.createdAt || customer.createdAt;
  const elapsed = day(base) ? (Date.parse(today) - Date.parse(day(base))) / 86400000 : -1;
  if (elapsed >= Math.max(1, Number(rules.inactive?.inactiveDays) || 7)) events.push(['inactive', latest?.id || `new_${day(base)}`]);
  return events;
}

async function sendCareMessage({ db, path, companyId, customerId, ruleId, eventKey, eventAt, sourceRef, validateSource, calendarNow }) {
  const companyRef = db.doc(`${path('companies')}/${companyId}`);
  const customerRef = db.doc(`${path('customers')}/${customerId}`);
  const id = `care_${createHash('sha256').update(JSON.stringify([companyId, customerId, ruleId, eventKey])).digest('hex')}`;
  const messageRef = db.doc(`${path('messages')}/${id}`);
  return db.runTransaction(async tx => {
    const [companyDoc, customerDoc, existing] = await Promise.all([tx.get(companyRef), tx.get(customerRef), tx.get(messageRef)]);
    const company = companyDoc.data();
    const customer = customerDoc.data();
    const rule = company?.customerCareRules?.[ruleId];
    if (existing.exists || !company || company.isArchived || !customer || customer.isArchived || customer.companyId !== companyId || rule?.enabled !== true || !rule.message?.trim()) return false;
    // Do not replay events that happened before a rule was enabled.
    if (!millis(rule.enabledAt) || millis(eventAt) < millis(rule.enabledAt)) return false;
    if (calendarNow) {
      let currentOrders = [];
      if (ruleId === 'inactive') {
        const snapshot = await tx.get(db.collection(path('orders')).where('companyId', '==', companyId).where('customerId', '==', customerId));
        currentOrders = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      }
      if (!calendarEvents(customer, currentOrders, company.customerCareRules, calendarNow).some(([key, value]) => key === ruleId && value === eventKey)) return false;
    }
    if (sourceRef) {
      const current = (await tx.get(sourceRef)).data();
      if (!current || current.companyId !== companyId || customerIdOf(current) !== customerId || !validateSource(current)) return false;
    }
    const assigned = employeeIdOf(customer);
    let senderEmpId = '';
    let senderName = company.displayName || company.name || 'Công ty';
    if (rule.sender === 'assigned_employee') {
      if (!assigned) return false;
      const employee = (await tx.get(db.doc(`${path('employees')}/${assigned}`))).data();
      if (!employee || employee.companyId !== companyId || employee.isArchived || employee.status === 'inactive') return false;
      senderEmpId = assigned;
      senderName = employee.name || employee.fullName || 'Nhân viên';
    }
    const now = Date.now();
    tx.set(messageRef, {
      id, companyId, customerId, conversationId: `customer_${customerId}`, conversationType: 'customer_support',
      type: 'employee_to_customer', senderType: senderEmpId ? 'employee' : 'company', senderEmpId, senderName,
      assignedEmployeeId: assigned, assignmentState: assigned ? 'assigned' : 'unclassified',
      ...(assigned ? { receiverEmpId: assigned, recipientEmpId: assigned, targetEmpId: assigned } : {}),
      text: rule.message.trim().slice(0, 2000), source: 'customer_care_automation', ruleId,
      status: 'unread', createdAt: now, updatedAt: now, isArchived: false,
    });
    return true;
  });
}

async function handleCareEvent({ db, path, collection, before, after, id, eventAt }) {
  const companyId = after?.companyId;
  const customerId = customerIdOf(after);
  if (!companyId || !customerId) return;
  for (const ruleId of eventRules(collection, before, after)) {
    if (ruleId === 'first_order') {
      const orders = await db.collection(path('orders')).where('companyId', '==', companyId).where('customerId', '==', customerId).get();
      const sorted = orders.docs.map(doc => ({ ...doc.data(), id: doc.id })).filter(activeOrder).sort((a, b) => millis(a.createdAt || a.date) - millis(b.createdAt || b.date) || a.id.localeCompare(b.id));
      if (sorted[0]?.id !== id) continue;
    }
    await sendCareMessage({ db, path, companyId, customerId, ruleId, eventKey: ruleId === 'first_order' ? 'first' : id, eventAt,
      sourceRef: db.doc(`${path(collection)}/${id}`), validateSource: ruleId === 'payment' ? paid : ruleId === 'delivered' ? delivered : activeOrder });
  }
}

async function runCalendarCare({ db, path, now = Date.now() }) {
  const companies = await db.collection(path('companies')).get();
  for (const doc of companies.docs) {
    const rules = doc.data().customerCareRules || {};
    if (!['inactive', 'birthday', 'holiday'].some(key => rules[key]?.enabled === true)) continue;
    const [customers, orders] = await Promise.all([
      db.collection(path('customers')).where('companyId', '==', doc.id).get(),
      db.collection(path('orders')).where('companyId', '==', doc.id).get(),
    ]);
    const grouped = new Map();
    for (const orderDoc of orders.docs) {
      const order = { ...orderDoc.data(), id: orderDoc.id };
      const key = customerIdOf(order);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(order);
    }
    for (const customerDoc of customers.docs) {
      const customer = customerDoc.data();
      if (customer.isArchived) continue;
      for (const [ruleId, eventKey] of calendarEvents(customer, grouped.get(customerDoc.id) || [], rules, now)) {
        await sendCareMessage({ db, path, companyId: doc.id, customerId: customerDoc.id, ruleId, eventKey, eventAt: now, calendarNow: now });
      }
    }
  }
}
module.exports = { eventRules, calendarEvents, sendCareMessage, handleCareEvent, runCalendarCare };
