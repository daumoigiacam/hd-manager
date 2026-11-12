import {createOfflineCommandRepository} from './offlineCommandRepository.js';

export const CASHFLOW_COMMANDS = Object.freeze({
  payments: Object.freeze({create:'cashflow.income.create',update:'cashflow.income.update'}),
  expenses: Object.freeze({create:'cashflow.expense.create',update:'cashflow.expense.update'}),
});
export function canonicalCashflow(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalCashflow).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonicalCashflow(value[key])).join(',') + '}';
}
const fail = message => {throw Error(message);};
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const columns = ['tenant_id','principal_id','source','id','intent_json','command_id','server_json','receipt_json'];
const pick = (source,doc) => Object.fromEntries((source === 'payments' ? ['amount','date','note','customerId','method'] : ['amount','date','note','category'])
  .map(key => [key,doc[key] ?? (key === 'method' ? 'Tiền mặt' : '')]));
export function assertManualCashflow(source,doc,employeeId) {
  if (!CASHFLOW_COMMANDS[source] || !doc || doc.isArchived || doc.empId !== employeeId) fail('Chỉ sửa phiếu thủ công do chính nhân viên lập.');
  if (['assetId','relatedDeliveryReportId','sourceOrderId','orderId','matchedOrderId','sourceBankTransactionId','paymentProvider','sourceSystem',
    'paymentIntent','isPaymentIntent','isCustomerDebtPaymentIntent'].some(key => doc[key]) || source === 'expenses' && doc.customerId) fail('Phiếu liên kết cần quy trình gốc.');
  if (source === 'payments' && (doc.sourceType !== 'employee_reported_income' || doc.approvalStatus !== 'pending_handover' || doc.requiresApproval !== true || doc.handoverStatus !== 'pending')) fail('Chỉ sửa báo thu thủ công đang chờ xác nhận.');
  if (source === 'expenses' && (!['employee_reported_expense','manual_accounting_expense'].includes(doc.sourceType) || !['pending_handover','approved'].includes(doc.approvalStatus))) fail('Phiếu chi này cần quy trình gốc.');
}
function validateInput(source,input) {
  if (!CASHFLOW_COMMANDS[source] || !input || typeof input !== 'object' || Array.isArray(input)) fail('Dữ liệu phiếu không hợp lệ.');
  const keys = source === 'payments' ? ['amount','date','note','customerId','method'] : ['amount','date','note','category'];
  if (Object.keys(input).some(key => !keys.includes(key)) || !Number.isSafeInteger(input.amount) || input.amount <= 0
    || typeof input.note !== 'string' || input.note.length > 2000 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '')
    || !Number.isFinite(Date.parse(input.date + 'T00:00:00Z')) || new Date(input.date + 'T00:00:00Z').toISOString().slice(0,10) !== input.date) fail('Nhập ngày hợp lệ và số tiền nguyên VND lớn hơn 0.');
  if (source === 'payments' && (!validId(input.customerId) || input.method !== 'Tiền mặt')) fail('Báo thu chỉ hỗ trợ khách hàng hợp lệ và tiền mặt.');
  if (source === 'expenses' && (typeof input.category !== 'string' || !input.category.trim() || input.category.length > 200)) fail('Nhập khoản chi.');
}

export async function createOfflineCashflowRepository(options) {
  const {database,session,authorize,digest,projectId,development,now=Date.now,employeeId} = options;
  if (development !== true || !/^demo-[a-z0-9-]+$/.test(projectId || '') || !validId(employeeId)) fail('Giao thức thu chi chỉ dành cho Development đã xác thực.');
  const scope = Object.freeze({...session.scope}), keys = [scope.tenantId,scope.principalId];
  // Verified lifecycle scope intentionally has four keys; project authority is
  // verified from the signed grant below, never guessed from session shape.
  const current = () => {if (!session.isCurrent(scope)) fail('Phiên Thu chi đã thay đổi.');};
  const access = async kind => {
    current();
    // Reuse the existing signature verifier. No new signer or cached role.
    const verify = kind === 'read' ? authorize : (options.authorizeWrite || authorize);
    const grant = await verify({scope,kind:'home.read'});
    current();
    if (!grant || grant.projectId !== projectId || Object.entries(scope).some(([key,value]) => grant[key] !== value)
      || !Number.isFinite(grant.expiresAtMs) || now() >= grant.expiresAtMs
      || grant.appSession?.user?.id !== employeeId || grant.appSession?.sourceProfile === 'native-isolation-v1'
      || !['home.read','home.cashflow.read',...(kind === 'read' ? [] : [kind])].every(cap => grant.capabilities?.includes(cap))) fail('Thiếu quyền Thu chi có chữ ký còn hiệu lực.');
    return grant;
  };
  const tx = work => database.transaction(async db => {await access('read');const result=await work(db);await access('read');return result;});
  await access('read');
  await tx(db => db.run(`CREATE TABLE IF NOT EXISTS offline_cashflow_v1 (
    tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,source TEXT NOT NULL,id TEXT NOT NULL,
    intent_json TEXT NOT NULL,command_id TEXT NOT NULL,server_json TEXT,receipt_json TEXT,
    PRIMARY KEY(tenant_id,principal_id,source,id))`));
  const ownRow = async (db,source,id) => (await db.query(`SELECT o.*,c.state FROM offline_cashflow_v1 o
    JOIN local_commands c ON c.tenant_id=o.tenant_id AND c.principal_id=o.principal_id AND c.command_id=o.command_id
    WHERE o.tenant_id=? AND o.principal_id=? AND o.source=? AND o.id=?`,[...keys,source,id]))[0];
  async function fullSource(db,source,id) {
    const row = (await db.query(`SELECT r.body FROM offline_home_feed_records_v1 r
      JOIN offline_home_head_v1 h ON h.tenant_id=r.tenant_id AND h.principal_id=r.principal_id AND h.generation=r.generation
      JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.generation=h.generation AND c.revision=h.revision
      WHERE r.tenant_id=? AND r.principal_id=? AND h.revision=? AND r.source=? AND r.id=?
      AND COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1')='legacy-v1'
      AND json_extract(h.snapshot_json,'$.feedGeneration')=h.generation
      AND c.applied_seq=json_extract(h.snapshot_json,'$.feedSeq') AND c.reported_seq=c.applied_seq
      AND r.seq<=c.applied_seq LIMIT 1`,[...keys,scope.permissionRevision,source,id]))[0];
    if (!row) throw Object.assign(Error('Chưa có bản nguồn hoàn tất của phiếu. Không dùng bản xem trước để sửa.'),{code:'source-unavailable'});
    const body=JSON.parse(row.body);
    if (body.companyId !== scope.tenantId || body.id !== id) fail('Phiếu nguồn sai công ty.');
    return body;
  }
  async function base(db,source,id) {
    const overlay=await ownRow(db,source,id);
    if (overlay && overlay.state !== 'SYNCED') fail('Phiếu đang chờ đồng bộ hoặc cần xử lý xung đột.');
    // Prefer the complete authoritative feed after a later external edit. A
    // just-accepted receipt is usable until that feed catches its revision up.
    let feed;
    try {feed=await fullSource(db,source,id);} catch (error) {if (!overlay?.server_json || error.code !== 'source-unavailable') throw error;}
    const accepted=overlay?.server_json ? JSON.parse(overlay.server_json) : null;
    return !feed || (accepted?.offlineCashflowRevision ?? -1) > (feed.offlineCashflowRevision ?? 0) ? accepted : feed;
  }
  const sourceOf = kind => Object.keys(CASHFLOW_COMMANDS).find(source => Object.values(CASHFLOW_COMMANDS[source]).includes(kind));
  const commands=createOfflineCommandRepository({...options,authorize:request => access(request.kind),
    async onEnqueue(db,command) {
      const source=sourceOf(command.kind);if (!source) fail('Lệnh không thuộc Thu chi.');
      await access(command.kind);
      validateInput(source,command.payload.input);
      const previous=await ownRow(db,source,command.entityId), create=command.kind.endsWith('.create');
      let server=null;
      if (create) {if (previous) fail('Mã phiếu đã tồn tại.');}
      else if (command.payload.resolvesConflictId) {
        const receipt=previous?.receipt_json && JSON.parse(previous.receipt_json);
        if (previous?.state !== 'CONFLICT_REQUIRES_REVIEW' || previous.command_id !== command.payload.resolvesConflictId
          || receipt.currentFingerprint !== command.payload.baseFingerprint || receipt.currentRevision !== command.payload.baseRevision) fail('Bản xung đột đã thay đổi.');
        server=receipt.currentDocument;assertManualCashflow(source,server,employeeId);
      } else {
        server=await base(db,source,command.entityId);assertManualCashflow(source,server,employeeId);
        if (await digest(canonicalCashflow(server)) !== command.payload.baseFingerprint || (server.offlineCashflowRevision ?? 0) !== command.payload.baseRevision) fail('Phiếu nguồn đã đổi. Bản nhập được giữ; hãy kiểm tra lại.');
      }
      await db.run(`INSERT INTO offline_cashflow_v1 (${columns.join(',')}) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(tenant_id,principal_id,source,id) DO UPDATE SET intent_json=excluded.intent_json,command_id=excluded.command_id,server_json=excluded.server_json,receipt_json=NULL`,
      [...keys,source,command.entityId,JSON.stringify(command.payload.input),command.commandId,server ? JSON.stringify(server) : null,null]);
      await options.beforeEnqueueCommit?.(db,command);
      await access(command.kind);
    },
    async onReceipt(db,{commandId,entityId,receipt}) {
      await access('read');
      const source=sourceOf(receipt.kind);if (!source || receipt.entityId !== entityId) fail('Sai loại biên nhận Thu chi.');
      const row=await ownRow(db,source,entityId);
      if (!row || row.command_id !== commandId) fail('Biên nhận không khớp phiếu Thu chi.');
      if (receipt.outcome === 'accepted') {
        const body=receipt.document, expected=JSON.parse(row.intent_json);
        if (!body || body.id !== entityId || body.companyId !== scope.tenantId || body.empId !== employeeId
          || body.amount !== expected.amount || body.date !== expected.date
          || body.offlineCashflowRevision !== receipt.baseRevision + 1 || receipt.revision !== body.offlineCashflowRevision
          || source === 'payments' && body.customerId !== expected.customerId
          || await digest(canonicalCashflow(body)) !== receipt.fingerprint) fail('Biên nhận Thu chi không xác thực đúng ý định.');
        assertManualCashflow(source,body,employeeId);
      }
      if (receipt.outcome === 'conflict' && receipt.currentDocument && (receipt.currentDocument.companyId !== scope.tenantId
        || receipt.currentDocument.id !== entityId || await digest(canonicalCashflow(receipt.currentDocument)) !== receipt.currentFingerprint)) fail('Bản xung đột sai nguồn.');
      if (receipt.outcome === 'conflict' && receipt.currentDocument && (receipt.currentRevision !== (receipt.currentDocument.offlineCashflowRevision ?? 0)
        || !Number.isSafeInteger(receipt.currentRevision) || receipt.currentRevision < 0)) fail('Phiên bản xung đột không hợp lệ.');
      await db.run('UPDATE offline_cashflow_v1 SET server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND source=? AND id=?',
        [receipt.outcome === 'accepted' ? JSON.stringify(receipt.document) : row.server_json,JSON.stringify(receipt),...keys,source,entityId]);
      await options.beforeReceiptCommit?.(db,{commandId,entityId});
      await access('read');
    },
  });
  const decode = row => ({source:row.source,id:row.id,input:JSON.parse(row.intent_json),commandId:row.command_id,
    state:row.state,serverConfirmed:row.state === 'SYNCED',receipt:row.receipt_json ? JSON.parse(row.receipt_json) : null});
  return Object.freeze({protocol:'offline-cashflow-v1',projectId,
    async create(source,input,id) {
      input={...input};
      validateInput(source,input);if (!validId(id)) fail('Mã phiếu không hợp lệ.');await access(CASHFLOW_COMMANDS[source].create);
      const previous=await tx(db => ownRow(db,source,id));
      if (previous) {
        if (canonicalCashflow(JSON.parse(previous.intent_json)) !== canonicalCashflow(input)) fail('Mã phiếu đã dùng cho nội dung khác.');
        return {commandId:previous.command_id,state:previous.state,localDurable:true,serverConfirmed:previous.state === 'SYNCED'};
      }
      return {...await commands.enqueue({kind:CASHFLOW_COMMANDS[source].create,entityId:id,baseRevision:0,payload:{input,baseRevision:0}}),localDurable:true};
    },
    async prepareEdit(source,id) {
      if (!CASHFLOW_COMMANDS[source] || !validId(id)) fail('Phiếu không hợp lệ.');await access(CASHFLOW_COMMANDS[source].update);
      return tx(async db => {const doc=await base(db,source,id);assertManualCashflow(source,doc,employeeId);
        return {source,id,input:pick(source,doc),baseRevision:doc.offlineCashflowRevision ?? 0,baseFingerprint:await digest(canonicalCashflow(doc))};});
    },
    async update(proof,input) {
      proof={...proof};input={...input};
      validateInput(proof.source,input);
      if (!validId(proof.id) || !/^[a-f0-9]{64}$/.test(proof.baseFingerprint || '')) fail('Bản gốc của phiếu không hợp lệ.');
      return {...await commands.enqueue({kind:CASHFLOW_COMMANDS[proof.source].update,entityId:proof.id,baseRevision:proof.baseRevision,
        payload:{input,baseRevision:proof.baseRevision,baseFingerprint:proof.baseFingerprint}}),localDurable:true};
    },
    async resolveConflict(source,id,input,expected) {
      input={...input};expected=expected&&{...expected};
      validateInput(source,input);await access(CASHFLOW_COMMANDS[source].update);
      const row=await tx(db => ownRow(db,source,id)), receipt=row?.receipt_json && JSON.parse(row.receipt_json);
      if (row?.state !== 'CONFLICT_REQUIRES_REVIEW' || !receipt.currentDocument) fail('Cần kiểm tra bản máy chủ trước khi gửi lại.');
      if (!expected || expected.commandId !== row.command_id || expected.currentFingerprint !== receipt.currentFingerprint
        || expected.currentRevision !== receipt.currentRevision) fail('Bản xung đột đã thay đổi. Bản nhập được giữ; cần xem lại bản máy chủ mới.');
      return {...await commands.enqueue({kind:CASHFLOW_COMMANDS[source].update,entityId:id,baseRevision:receipt.currentRevision,
        payload:{input,baseRevision:receipt.currentRevision,baseFingerprint:receipt.currentFingerprint,resolvesConflictId:row.command_id}}),localDurable:true};
    },
    async page({limit=40}={}) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('Giới hạn phiếu không hợp lệ.');await access('read');
      return tx(async db => (await db.query(`SELECT o.*,c.state FROM offline_cashflow_v1 o JOIN local_commands c
        ON c.tenant_id=o.tenant_id AND c.principal_id=o.principal_id AND c.command_id=o.command_id
        WHERE o.tenant_id=? AND o.principal_id=? ORDER BY c.created_at DESC,c.command_id DESC LIMIT ?`,[...keys,limit])).map(decode));
    },
    async applyReceipt(candidate,command,receipt) {
      if (!sourceOf(command.kind) || receipt.kind !== command.kind || receipt.baseRevision !== command.baseRevision) fail('Sai biên nhận Thu chi.');
      return commands.applyReceipt(candidate,command,receipt);
    },
  });
}
