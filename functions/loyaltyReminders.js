const timestamp = value => value?.toMillis ? value.toMillis() : Date.parse(value || '') || 0;

async function sendLoyaltyReminders({ db, appId, date, pathBuilder }) {
  const points = await db.collection(pathBuilder(appId, 'customer_points')).where('pendingRewardDate', '==', date).get();
  for (const doc of points.docs) {
    const row = doc.data();
    if (!(row.pendingRewardPoints > 0) || !row.companyId || !row.customerId) continue;
    const checkedAt = timestamp(row.pendingRewardCheckedAt);
    if (!checkedAt) continue;
    const [company, customer, orders, payments] = await Promise.all([
      db.doc(`${pathBuilder(appId, 'companies')}/${row.companyId}`).get(),
      db.doc(`${pathBuilder(appId, 'customers')}/${row.customerId}`).get(),
      db.collection(pathBuilder(appId, 'orders')).where('companyId', '==', row.companyId).where('customerId', '==', row.customerId).get(),
      db.collection(pathBuilder(appId, 'payments')).where('companyId', '==', row.companyId).where('customerId', '==', row.customerId).get(),
    ]);
    const companyData = company.data() || {};
    const customerData = customer.data() || {};
    if (!company.exists || !customer.exists || customerData.companyId !== row.companyId || customerData.isArchived) continue;
    const override = customerData.customerLoyaltyEnabledOverride ?? customerData.loyaltyEnabledOverride;
    if ([false, 'false', 'disabled'].includes(override)) continue;
    if (!companyData.customerLoyaltyEnabled && ![true, 'true', 'enabled'].includes(override)) continue;
    // Never send a reward amount after its inputs changed since the eligibility check.
    if ([company, customer, ...orders.docs, ...payments.docs].some(item => timestamp(item.data()?.updatedAt || item.data()?.createdAt) > checkedAt)) continue;
    const id = `loyalty_payment_${row.companyId}_${row.customerId}_${date}`;
    const ref = db.doc(`${pathBuilder(appId, 'notifications')}/${id}`);
    await db.runTransaction(async transaction => {
      if ((await transaction.get(ref)).exists) return;
      const now = new Date().toISOString();
      transaction.set(ref, {
        id, companyId: row.companyId, customerId: row.customerId, targetCustomerId: row.customerId,
        recipientType: 'customer', type: 'loyalty_payment_reminder', category: 'payment',
        title: 'Thanh toán để nhận tích điểm',
        message: `Hãy thanh toán để nhận số tiền ${Number(row.pendingRewardMoney).toLocaleString('vi-VN')} đ tương đương ${Number(row.pendingRewardPoints).toLocaleString('vi-VN')} tích điểm.`,
        status: 'unread', readStatus: 'unread', tab: 'debt', date, createdAt: now, updatedAt: now, isArchived: false,
      });
    });
  }
}
module.exports = { sendLoyaltyReminders };
