const {assertOfflineCommandEnvironment}=require('./offlineCommandAuthority.cjs');
// Shared command handler. No HTTP export, grant issuer or production entry.
const {createHash} = require('node:crypto');
const {fingerprint} = require('./offlineCustomerCommands.cjs');
const CONTRACT = Object.freeze({
  'cashflow.income.create': {source:'payments',action:'create_income'},
  'cashflow.income.update': {source:'payments',action:'edit_income_voucher'},
  'cashflow.expense.create': {source:'expenses',action:'create_expense'},
  'cashflow.expense.update': {source:'expenses',action:'edit_expense_voucher'},
});
const fail = (code, message) => {throw Object.assign(Error(message), {code});};
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const revision = body => body?.offlineCashflowRevision ?? 0;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function inputFor(source, input, domain, create) {
  const allowed = source === 'payments' ? ['amount','date','note','customerId','method'] : ['amount','date','note','category'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) fail('invalid-argument','Unsupported cashflow fields');
  if (!['number','string'].includes(typeof input.amount)) fail('invalid-argument','Amount required');
  const amount = domain.parseLooseMoneyValue(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(amount)) fail('invalid-argument','Positive safe whole VND amount required');
  if (!DAY.test(input.date || '') || !Number.isFinite(Date.parse(input.date + 'T00:00:00Z'))
    || new Date(input.date + 'T00:00:00Z').toISOString().slice(0,10) !== input.date) fail('invalid-argument','Valid financial day required');
  if (typeof input.note !== 'string' || input.note.length > 2000) fail('invalid-argument','Invalid note');
  const result = {amount,date:input.date,note:source === 'payments' ? domain.capitalizeFirst(input.note) : domain.normalizeLeadingLabel(input.note || 'Khoản chi')};
  if (source === 'payments') {
    if (!id(input.customerId) || input.method !== 'Tiền mặt') fail('unsupported-operation','Only manual customer cash reports supported');
    result.customerId = input.customerId;result.method = input.method;
  } else {
    if (typeof input.category !== 'string' || !input.category.trim() || input.category.length > 200) fail('invalid-argument','Expense category required');
    result.category = domain.normalizeExpenseCategoryLabel(input.category);
    if (!create) result.note = domain.normalizeLeadingLabel(input.note || result.category || 'Khoản chi');
  }
  return result;
}
function assertSimple(source, live, employeeId, domain) {
  if (!live || live.isArchived || live.empId !== employeeId) fail('unsupported-operation','Only own manual vouchers are editable');
  const linked = ['assetId','relatedDeliveryReportId','sourceOrderId','orderId','matchedOrderId','sourceBankTransactionId',
    'paymentProvider','sourceSystem','paymentIntent','isPaymentIntent','isCustomerDebtPaymentIntent'];
  if (linked.some(key => live[key]) || (source === 'expenses' && live.customerId)) fail('unsupported-operation','Linked/compound cashflow requires original workflow');
  if (source === 'payments') {
    if (live.sourceType !== 'employee_reported_income' || live.approvalStatus !== domain.CASHFLOW_APPROVAL_STATUS.pending
      || live.handoverStatus !== 'pending' || live.requiresApproval !== true) fail('unsupported-operation','Only pending manual income reports are editable');
  } else if (!['employee_reported_expense','manual_accounting_expense'].includes(live.sourceType)
    || ![domain.CASHFLOW_APPROVAL_STATUS.pending,domain.CASHFLOW_APPROVAL_STATUS.approved].includes(live.approvalStatus)) {
    fail('unsupported-operation','Unsupported expense workflow');
  }
  if (!Number.isSafeInteger(revision(live)) || revision(live) < 0) fail('invalid-argument','Invalid cashflow revision');
}

function createOfflineCashflowCommandService({db,projectId,appId,environment,authorize,policy,domain,now=Date.now}) {
 assertOfflineCommandEnvironment({db,projectId,appId,environment,authorize});
  if (typeof db?.projectId === 'string' && db.projectId !== projectId) fail('permission-denied','Cashflow adapter project mismatch');
  if (!id(appId) || typeof db?.runTransaction !== 'function' || typeof authorize !== 'function'
    || typeof policy?.hasCompanyRolePermissionAction !== 'function' || typeof policy?.isOwnerAccountUser !== 'function') fail('failed-precondition','Original server role policy required');
  for (const name of ['parseLooseMoneyValue','capitalizeFirst','normalizeLeadingLabel','normalizeExpenseCategoryLabel','isOrderCodeAutoMatchEnabled','isEmployeeDriverPosition']) {
    if (typeof domain?.[name] !== 'function') fail('failed-precondition','Original cashflow domain required: ' + name);
  }
  if (!domain.CASHFLOW_APPROVAL_STATUS?.pending || !domain.CASHFLOW_APPROVAL_STATUS?.approved) fail('failed-precondition','Original approval constants required');
  const ref = (source,key) => {if (!id(key)) fail('invalid-argument','Invalid relation');return db.doc(`artifacts/${appId}/public/data/${source}/${key}`);};
  const relation = async (tx,source,key,tenant) => {
    const saved = await tx.get(ref(source,key));
    if (!saved.exists || saved.data().companyId !== tenant || saved.data().isArchived || saved.data().id && saved.data().id !== key) fail('permission-denied','Cashflow relation denied');
    return saved.data();
  };
  return async function apply(actor, command) {
    const spec = Object.prototype.hasOwnProperty.call(CONTRACT,command?.kind) ? CONTRACT[command.kind] : null;
    if (!spec || !id(actor?.uid) || !id(actor?.tenantId) || !id(command.commandId) || !id(command.entityId)
      || command.idempotencyKey !== command.commandId || !Number.isSafeInteger(command.baseRevision) || command.baseRevision < 0) fail('invalid-argument','Invalid cashflow command');
    const payload = command.payload;
    if (!payload || Object.keys(payload).some(k => !['input','baseFingerprint','baseRevision','resolvesConflictId'].includes(k))
      || payload.baseRevision !== command.baseRevision || JSON.stringify(payload).length > 12000) fail('invalid-argument','Invalid cashflow intent');
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    if (digest !== command.payloadDigest) fail('invalid-argument','Cashflow payload digest mismatch');
    const create = command.kind.endsWith('.create'), input = inputFor(spec.source,payload.input,domain,create);
    if (create && (command.baseRevision !== 0 || payload.baseFingerprint)) fail('invalid-argument','Create must have empty base');
    if (!create && !/^[a-f0-9]{64}$/.test(payload.baseFingerprint || '')) fail('invalid-argument','Full-source fingerprint required');
    const receiptRef = db.doc('offlineCashflowReceipts/' + fingerprint([actor.tenantId,actor.uid,command.commandId]));
    return db.runTransaction(async tx => {
      // MUST transaction-read current identity/company/role and verified server
      // capabilities on EVERY request, including receipt retries. No QA bypass.
      const access = await authorize(tx,actor,{kind:command.kind,capability:command.kind});
      const subject = access?.subject, employee = subject?.employee;
      if (!subject || subject.company?.id !== actor.tenantId || !id(employee?.id)
        || employee.companyId !== actor.tenantId || subject.currentUser?.firebaseUid !== actor.uid
        || subject.currentUser?.id !== employee.id || subject.currentUser?.companyId !== actor.tenantId
        || !Array.isArray(access.capabilities) || !['home.read','home.cashflow.read',command.kind].every(cap => access.capabilities.includes(cap))) fail('permission-denied','Verified cashflow authority required');
      const owner = policy.isOwnerAccountUser(subject.currentUser) === true;
      const role = action => owner || policy.hasCompanyRolePermissionAction(subject,'finance',action) === true;
      if (!(role(spec.action) || !create && role('edit_cashflow'))) fail('permission-denied','Cashflow role action denied');
      if (domain.isEmployeeDriverPosition(employee)) fail('unsupported-operation','Driver cashflow requires original delivery workflow');
      await relation(tx,'employees',employee.id,actor.tenantId);
      const prior = await tx.get(receiptRef);
      if (prior.exists) {
        const r = prior.data();
        if (r.payloadDigest !== digest || r.entityId !== command.entityId || r.kind !== command.kind || r.baseRevision !== command.baseRevision) fail('invalid-argument','Cashflow idempotency key reused');
        return r;
      }
      const voucherRef = ref(spec.source,command.entityId), saved = await tx.get(voucherRef), live = saved.exists ? saved.data() : null;
      if (live && live.companyId !== actor.tenantId) fail('permission-denied','Cashflow tenant denied');
      if (spec.source === 'payments') {
        await relation(tx,'customers',input.customerId,actor.tenantId);
        // Original resolver/ledger effects are unavailable in this bounded
        // module. Refuse enabled order matching rather than silently skip it.
        if (domain.isOrderCodeAutoMatchEnabled(subject.company)) fail('unsupported-operation','Income requires original order-matching workflow');
      }
      if (!create && live) assertSimple(spec.source,live,employee.id,domain);
      const conflict = create ? !!live : !live || revision(live) !== command.baseRevision || fingerprint(live) !== payload.baseFingerprint;
      const receipt = {tenantId:actor.tenantId,principalId:actor.uid,commandId:command.commandId,idempotencyKey:command.idempotencyKey,
        entityId:command.entityId,kind:command.kind,baseRevision:command.baseRevision,payloadDigest:digest,outcome:conflict ? 'conflict' : 'accepted'};
      if (conflict) {
        receipt.reason = create ? 'cashflow-exists' : 'cashflow-changed';
        // Preserve conflicts. Never replace local intent, silently rebase, or
        // disclose another employee's voucher through an ID collision.
        if (live?.empId === employee.id) {receipt.currentDocument=live;receipt.currentFingerprint=fingerprint(live);receipt.currentRevision=revision(live);}
      } else {
        const at = new Date(now()).toISOString();
        const approvedExpense = spec.source === 'expenses' && role('approve_driver_cashflow');
        const document = create ? {...input,id:command.entityId,companyId:actor.tenantId,empId:employee.id,
          sourceType:spec.source === 'payments' ? 'employee_reported_income' : approvedExpense ? 'manual_accounting_expense' : 'employee_reported_expense',
          requiresApproval:!approvedExpense,approvalStatus:approvedExpense ? domain.CASHFLOW_APPROVAL_STATUS.approved : domain.CASHFLOW_APPROVAL_STATUS.pending,
          handoverStatus:approvedExpense ? 'confirmed' : 'pending',createdByRole:employee.position || employee.role || 'staff',
          isArchived:false,createdAt:at,offlineCashflowRevision:1}
          : {...live,...input,updatedAt:at,updatedByEmpId:employee.id,offlineCashflowRevision:revision(live)+1};
        receipt.document=document;receipt.fingerprint=fingerprint(document);receipt.revision=revision(document);
        tx.set(voucherRef,document);
      }
      // Business mutation and authoritative receipt commit in ONE transaction.
      tx.set(receiptRef,receipt);return receipt;
    });
  };
}
module.exports = {createOfflineCashflowCommandService,CONTRACT};
