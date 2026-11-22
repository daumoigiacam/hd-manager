const own = (value, key) => Object.hasOwn(value, key);
const idValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const fail = (message, code = 'customer-loan/invalid') => { throw Object.assign(new Error(message), { code }); };
const record = value => value && Object.getPrototypeOf(value) === Object.prototype;
const clone = value => JSON.parse(JSON.stringify(value));
export const customerLoanFingerprint = value => value === null || typeof value !== 'object'
  ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(customerLoanFingerprint).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${customerLoanFingerprint(value[key])}`).join(',')}}`;

export function parseCustomerLoanQuantity(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'string') {
    value = value.trim();
    if (!value) return 0;
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) fail('Số lượng và số kg phải là số hợp lệ, không âm.');
    value = Number(value.replace(',', '.'));
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    fail('Số lượng và số kg phải là số hữu hạn, không âm.');
  }
  return value;
}

export function validateCustomerLoanState(loan) {
  if (!record(loan) || (loan.returns !== undefined && !Array.isArray(loan.returns))) fail('Phiếu vay hoặc danh sách trả không hợp lệ.');
  const quantity = parseCustomerLoanQuantity(loan.quantity), weightKg = parseCustomerLoanQuantity(loan.weightKg);
  if (quantity <= 0 && weightKg <= 0) fail('Vui lòng nhập số lượng hoặc số kg khách vay.');
  const seen = new Set();
  let returnedQuantity = 0, returnedWeightKg = 0;
  for (const entry of loan.returns || []) {
    if (!record(entry) || !idValid(entry.id) || seen.has(entry.id)) fail('Mã lần trả bị thiếu hoặc trùng; cần đối soát phiếu vay.');
    seen.add(entry.id);
    const returned = parseCustomerLoanQuantity(entry.quantity), weight = parseCustomerLoanQuantity(entry.weightKg);
    if (returned <= 0 && weight <= 0) fail('Vui lòng nhập số lượng hoặc số kg khách trả.');
    returnedQuantity += returned;
    returnedWeightKg += weight;
  }
  const close = (borrowed, returned) => Math.abs(borrowed - returned) <= Number.EPSILON * Math.max(1, borrowed, returned) * 8;
  for (const [borrowed, returned] of [[quantity, returnedQuantity], [weightKg, returnedWeightKg]]) {
    if (!Number.isFinite(returned) || (borrowed === 0 && returned > 0) || (returned > borrowed && !close(borrowed, returned))) {
      fail('Số trả vượt số đã vay hoặc có đơn vị chưa được theo dõi trên phiếu vay.');
    }
  }
  return {
    quantity, weightKg, returnedQuantity, returnedWeightKg,
    isClosed: (quantity === 0 || close(quantity, returnedQuantity)) && (weightKg === 0 || close(weightKg, returnedWeightKg)),
  };
}

const snapshotFields = ['id', 'companyId', 'customerId', 'productName', 'itemName', 'quantity', 'unit', 'weightKg',
  'loanDate', 'dueDate', 'note', 'returns', 'status', 'closedAt', 'isArchived', 'updatedAt', 'updatedByEmpId', 'lastCustomerLoanCommand'];
export function customerLoanSnapshot(loan) {
  if (!record(loan) || !idValid(loan.id) || !idValid(loan.companyId) || !idValid(loan.customerId)) fail('Thiếu bản gốc phiếu vay đã mở.');
  return clone(Object.fromEntries(snapshotFields.map(field => [field, loan[field] ?? null])));
}

const date = (value, optional = false) => {
  if (optional && value === '') return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) fail('Ngày vay/trả không hợp lệ.');
  return value;
};
const text = value => {
  if (typeof value !== 'string') fail('Thông tin phiếu vay không hợp lệ.');
  return value.trim();
};
const editableFields = ['productName', 'quantity', 'unit', 'weightKg', 'loanDate', 'dueDate', 'note'];
const normalizeFields = input => {
  const fields = { ...input };
  for (const key of ['quantity', 'weightKg']) if (own(fields, key)) fields[key] = parseCustomerLoanQuantity(fields[key]);
  for (const key of ['productName', 'unit', 'note']) if (own(fields, key)) fields[key] = text(fields[key]);
  if (own(fields, 'productName') && !fields.productName) fail('Vui lòng nhập hàng hóa khách vay.');
  if (own(fields, 'unit') && !fields.unit) fail('Vui lòng nhập đơn vị vay.');
  if (own(fields, 'loanDate')) fields.loanDate = date(fields.loanDate);
  if (own(fields, 'dueDate')) fields.dueDate = date(fields.dueDate, true);
  return fields;
};

export function prepareCustomerLoanCreate(customerId, input) {
  if (!record(input) || !idValid(customerId) || !idValid(input.clientMutationId)
    || Object.keys(input).some(key => ![...editableFields, 'clientMutationId'].includes(key))) fail('Thông tin hoặc mã tạo phiếu vay không hợp lệ.');
  const fields = normalizeFields({ productName: '', quantity: 0, weightKg: 0, unit: 'Kg', dueDate: '', note: '', ...input });
  delete fields.clientMutationId;
  validateCustomerLoanState(fields);
  return { kind: 'create', id: `cl_${input.clientMutationId}`, mutationId: input.clientMutationId, customerId, fields };
}

export function prepareCustomerLoanEdit(loanId, patch, expectedLoan) {
  const expected = customerLoanSnapshot(expectedLoan);
  if (expected.id !== loanId || !record(patch) || !idValid(patch.clientMutationId)
    || Object.keys(patch).some(key => ![...editableFields, 'returns', 'status', 'closedAt', 'clientMutationId'].includes(key))) {
    fail('Thiếu bản gốc hoặc mã thao tác cập nhật phiếu vay.');
  }
  if (expected.isArchived) fail('Phiếu vay đã được ẩn.');
  const fields = normalizeFields(Object.fromEntries(editableFields.filter(key => own(patch, key)).map(key => [key, patch[key]])));
  let addedReturn = null;
  if (own(patch, 'returns')) {
    if (Object.keys(fields).length || !Array.isArray(patch.returns)) fail('Ghi trả và sửa thông tin vay phải là hai thao tác riêng.');
    const prior = expected.returns || [];
    if (patch.returns.length !== prior.length + 1 || prior.some((entry, index) => customerLoanFingerprint(entry) !== customerLoanFingerprint(patch.returns[index]))) {
      fail('Không được ghi đè hoặc xóa lịch sử trả hàng.', 'customer-loan/conflict');
    }
    const entry = patch.returns.at(-1);
    if (!record(entry) || !idValid(entry.id)
      || Object.keys(entry).some(key => !['id', 'quantity', 'weightKg', 'returnDate', 'note', 'createdAt', 'createdByEmpId'].includes(key))) fail('Thông tin lần trả không hợp lệ.');
    addedReturn = { ...entry, quantity: parseCustomerLoanQuantity(entry.quantity), weightKg: parseCustomerLoanQuantity(entry.weightKg), returnDate: date(entry.returnDate), note: text(entry.note || '') };
    fields.returns = [...prior, addedReturn];
  }
  const next = { ...expected, ...fields, returns: fields.returns || expected.returns || [] };
  const balance = validateCustomerLoanState(next);
  if (addedReturn) {
    if ((parseCustomerLoanQuantity(expected.quantity) === 0 && addedReturn.quantity > 0)
      || (parseCustomerLoanQuantity(expected.weightKg) === 0 && addedReturn.weightKg > 0)) fail('Không được trả theo đơn vị chưa theo dõi trên phiếu vay.');
  }
  return { kind: 'edit', id: loanId, mutationId: patch.clientMutationId, customerId: expected.customerId, expected, fields, addedReturn, isClosed: balance.isClosed };
}

const markerMatches = (value, marker) => value?.id === marker.id && value?.fingerprint === marker.fingerprint;

export async function commitCustomerLoan({ intent, fingerprint, companyId, employeeId, customerName = '', now,
  transaction, reference, customerReference }) {
  if (!idValid(companyId) || !idValid(intent.mutationId) || typeof fingerprint !== 'string' || !fingerprint) fail('Phiên hoặc mã thao tác vay/trả không hợp lệ.');
  const command = { id: intent.mutationId, fingerprint };
  return transaction(async tx => {
    const [customerSnapshot, loanSnapshot] = await Promise.all([tx.get(customerReference), tx.get(reference)]);
    const customer = customerSnapshot.exists() ? customerSnapshot.data() : null;
    const live = loanSnapshot.exists() ? { ...loanSnapshot.data(), id: intent.id } : null;
    if (!customer || customer.companyId !== companyId || customer.isArchived
      || (live && (live.companyId !== companyId || live.customerId !== intent.customerId))) fail('Khách hàng hoặc phiếu vay không thuộc công ty hiện tại.', 'permission-denied');
    if (live && (markerMatches(live.lastCustomerLoanCommand, command)
      || (intent.kind === 'create' && markerMatches(live.customerLoanCreateCommand, command))
      || (intent.addedReturn && (live.returns || []).some(entry => entry.id === intent.addedReturn.id && markerMatches(entry.customerLoanCommand, command))))) {
      return { loan: live, duplicate: true };
    }
    let payload;
    if (intent.kind === 'create') {
      if (live) fail('Mã phiếu vay đã được sử dụng; không tạo bản trùng.', 'customer-loan/conflict');
      payload = { ...intent.fields, id: intent.id, companyId, customerId: intent.customerId, customerName,
        returns: [], status: 'open', closedAt: '', isArchived: false, createdAt: now, updatedAt: now,
        createdByEmpId: employeeId, customerLoanCreateCommand: command, lastCustomerLoanCommand: command };
    } else {
      if (!live || live.isArchived || customerLoanFingerprint(customerLoanSnapshot(live)) !== customerLoanFingerprint(intent.expected)) {
        fail('Phiếu vay vừa được người khác sửa. Giữ bản nhập và tải lại phiếu trước khi lưu.', 'customer-loan/conflict');
      }
      payload = { ...intent.fields, status: intent.isClosed ? 'closed' : 'open',
        closedAt: intent.isClosed ? (live.closedAt || now) : '', updatedAt: now, updatedByEmpId: employeeId, lastCustomerLoanCommand: command };
      if (intent.addedReturn) payload.returns = [...(live.returns || []), { ...intent.addedReturn, customerLoanCommand: command }];
      validateCustomerLoanState({ ...live, ...payload });
    }
    tx.set(reference, payload, intent.kind === 'create' ? {} : { merge: true });
    return { loan: { ...live, ...payload, id: intent.id }, duplicate: false };
  });
}
