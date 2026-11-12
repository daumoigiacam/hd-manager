import { normalizeProductPricingUnit as unit } from '../services/productPricingUnits.js';

const text = value => String(value ?? '').trim();
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const size = row => text(row?.sizeLabel ?? row?.size ?? row?.weightKg);
const attribute = row => text(row?.attributeLabel ?? row?.productAttribute ?? row?.attribute);
const priceUnit = row => unit(row?.billingUnit || row?.pricingUnit || row?.defaultUnit || '');
const orderUnit = row => unit(row?.orderUnit || row?.defaultOrderUnit || row?.quantityUnit || '');
const price = row => Number(row?.unitPrice ?? row?.price);
const variantId = row => text(row?.configurationId || row?.variantId || row?.id);
const items = order => order?.items?.length ? order.items : (order?.primaryItem ? [order.primaryItem] : []);
const changedDefaults = (row, old) => !old || row.productId !== old.productId || size(row) !== size(old)
  || price(row) !== price(old) || orderUnit(row) !== orderUnit(old);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export async function payloadFingerprint(payload) {
  const { createdAt, updatedAt, syncVersion, syncCommands, customerProductSync, __pendingFirebaseSync, ...content } = payload;
  void createdAt; void updatedAt; void syncVersion; void syncCommands; void customerProductSync; void __pendingFirebaseSync;
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(content))));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export const syncError = message => Object.assign(new Error(message), { code: 'firestore/failed-precondition' });

export function customerConfigScope(customer, branchId = '') {
  if (!branchId) return customer;
  const branch = (customer.branches || customer.customerBranches || []).find(row => text(row.id || row.branchId) === branchId);
  if (!branch) throw syncError('Chi nhánh đã thay đổi. Hãy mở lại đơn trước khi lưu.');
  return branch;
}
export const configMap = scope => object(scope.priceOverrides || scope.customPrices);
export const configScopeFingerprint = customer => JSON.stringify(canonical([
  customer.priceOverrides || null, customer.customPrices || null,
  customer.customerProductIds || [], customer.branches || customer.customerBranches || [],
]));

// Only the three default fields change. Billing unit, attributes and sibling variants are snapshots.
export function planCustomerProductSync(customer, order, previousOrder, { now, actorId }) {
  const branchId = text(order.branchId || order.customerBranchId);
  const scope = customerConfigScope(customer, branchId);
  const mapKey = scope.priceOverrides ? 'priceOverrides' : scope.customPrices ? 'customPrices' : 'priceOverrides';
  const inherited = configMap(customer);
  // Branch maps are stored as a complete configuration scope by the existing UI.
  // Materialize inherited siblings when creating its first override.
  const map = { ...(branchId ? inherited : {}), ...configMap(scope) };
  const groups = new Map();
  const skipped = [];
  const updated = [];
  const before = order.customerId === previousOrder?.customerId
    && text(order.branchId || order.customerBranchId) === text(previousOrder?.branchId || previousOrder?.customerBranchId)
    ? items(previousOrder) : [];
  const changedProducts = new Set(items(order).filter((row, index) => changedDefaults(row, before[index])).map(row => text(row.productId)));
  items(order).forEach((row, index) => {
    const old = before[index];
    const key = text(row.productId);
    if (!changedProducts.has(key)) return;
    if (!key) throw syncError('Thiếu sản phẩm trong dòng đặt hàng.');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, dirty: changedDefaults(row, old) });
  });
  for (const [productId, rows] of groups) {
    const raw = map[productId] ?? inherited[productId];
    const original = typeof raw === 'number' ? { price: raw, unitPrice: raw } : object(raw);
    const next = { ...original };
    const variants = Array.isArray(original.variants) ? original.variants.map(row => ({ ...row })) : [];
    const targets = new Map();
    for (const { row, dirty } of rows) {
      const id = variantId(row);
      const byId = variants.filter(v => text(v.id || v.configurationId) === id && id
        && attribute(v) === attribute(row) && (!priceUnit(v) || priceUnit(v) === priceUnit(row)));
      const byIdentity = variants.filter(v => attribute(v) === attribute(row) && size(v) === size(row)
        && (!priceUnit(v) || priceUnit(v) === priceUnit(row)));
      const match = byId.length === 1 ? byId[0] : byIdentity.length === 1 ? byIdentity[0] : null;
      const root = !variants.length && attribute(original) === attribute(row);
      const key = match ? `id:${text(match.id || match.configurationId)}` : root ? 'root' : `new:${attribute(row)}`;
      const candidate = { row, dirty, match, root, values: [size(row), price(row), orderUnit(row)] };
      if (targets.has(key) && !same(targets.get(key).values, candidate.values)) {
        targets.get(key).ambiguous = true;
      } else if (!targets.has(key)) targets.set(key, candidate);
      else if (dirty) targets.get(key).dirty = true;
    }
    // Without a stable variant, never pick the first/last of conflicting sizes or prices.
    if ([...targets.values()].some(row => row.ambiguous)) {
      skipped.push({ productId, reason: 'ambiguous-variant' });
      continue;
    }
    for (const { row, dirty, match, root } of targets.values()) {
      if (!dirty) continue;
      const current = match || (root ? original : {});
      const billing = priceUnit(current) || priceUnit(original) || priceUnit(row);
      if (!billing || !orderUnit(row) || !Number.isFinite(price(row)) || price(row) < 0
        || (priceUnit(row) && priceUnit(row) !== billing)) {
        throw syncError('Đơn vị tính giá hoặc giá không hợp lệ. Hãy kiểm tra lại cấu hình sản phẩm.');
      }
      if (size(current) === size(row) && price(current) === price(row) && orderUnit(current) === orderUnit(row)) continue;
      const patch = {
        ...current, size: size(row), sizeLabel: size(row), price: price(row), unitPrice: price(row),
        unitPrices: { ...object(current.unitPrices), [billing]: price(row) },
        billingUnit: billing, pricingUnit: billing,
        orderUnit: orderUnit(row), defaultOrderUnit: orderUnit(row),
        orderUnits: [...new Set([...(Array.isArray(current.orderUnits) ? current.orderUnits : []), orderUnit(row)])],
        version: (Number(current.version) || 0) + 1, updatedAt: now, updatedBy: actorId,
      };
      if (match) variants[variants.indexOf(match)] = patch;
      else if (root) Object.assign(next, patch);
      else variants.push({ ...patch, id: `auto:${encodeURIComponent(JSON.stringify([attribute(row), size(row), billing]))}`, attributeLabel: attribute(row) });
      updated.push({ productId, variantId: text(patch.id || (root ? '' : variants.at(-1)?.id)) });
    }
    if (variants.length) next.variants = variants;
    if (!same(next, original)) map[productId] = next;
  }
  if (!updated.length) return { patch: null, updated, skipped };
  const ids = [...new Set([...(scope.customerProductIds?.length ? scope.customerProductIds : customer.customerProductIds || []), ...updated.map(row => row.productId)])];
  const scopedPatch = { [mapKey]: map, customerProductIds: ids };
  const patch = branchId ? {
    [customer.branches ? 'branches' : 'customerBranches']: (customer.branches || customer.customerBranches).map(row =>
      row === scope ? { ...row, ...scopedPatch } : row),
  } : scopedPatch;
  return { patch: { ...patch, productConfigVersion: (Number(customer.productConfigVersion) || 0) + 1,
    updatedAt: now, productConfigUpdatedBy: actorId }, updated, skipped };
}

export const orderRevision = order => order ? JSON.stringify([order.syncVersion || 0, order.updatedAt || order.createdAt || '', order.isArchived || false]) : null;

export async function commitOrderRequestWithDefaults({ command, companyId, transaction, reference, isOnline = true }) {
  if (!isOnline) throw Object.assign(new Error('Mất kết nối. Bản nháp đang chờ đồng bộ.'), { code: 'firestore/unavailable' });
  if (command.companyId !== companyId || !command.requestId || !command.mutationId
    || !command.payload?.customerId || command.payload.companyId !== companyId) throw syncError('Lệnh lưu không thuộc công ty hiện tại.');
  if (command.fingerprint !== await payloadFingerprint(command.payload)) throw syncError('Nội dung lệnh lưu không khớp mã kiểm tra.');
  return transaction(async tx => {
    const orderRef = reference('orderRequests', command.requestId);
    const customerRef = reference('customers', command.payload.customerId);
    const [orderSnapshot, customerSnapshot] = await Promise.all([tx.get(orderRef), tx.get(customerRef)]);
    const previous = orderSnapshot.exists() ? orderSnapshot.data() : null;
    const customer = customerSnapshot.exists() ? customerSnapshot.data() : null;
    if (!customer || customer.companyId !== companyId || customer.isArchived
      || (previous && previous.companyId !== companyId)) throw syncError('Không tìm thấy khách hàng hoặc đơn thuộc công ty này.');
    const duplicate = (previous?.syncCommands || []).find(row => row.id === command.mutationId);
    if (duplicate) {
      if (duplicate.fingerprint !== command.fingerprint) throw syncError('Mã lưu đã dùng với dữ liệu khác.');
      return { existingDocuments: [
        { collectionName: 'orderRequests', documentId: command.requestId, payload: previous },
        { collectionName: 'customers', documentId: command.payload.customerId, payload: customer },
      ], skipped: previous.customerProductSync?.skipped || [] };
    }
    if (orderRevision(previous) !== command.expectedOrderRevision || previous?.isArchived) throw syncError('Đơn vừa được người khác sửa. Bản nháp vẫn được giữ; hãy mở lại dữ liệu mới.');
    const order = { ...previous, ...command.payload };
    const plan = command.syncDefaults ? planCustomerProductSync(customer, order, previous, command) : { patch: null, updated: [], skipped: [] };
    if (command.syncDefaults && (plan.patch || items(order).some((row, index) => changedDefaults(row, items(previous)[index])))
      && configScopeFingerprint(customer) !== command.expectedCustomerConfig) throw syncError('Cấu hình khách vừa thay đổi. Bản nháp vẫn được giữ; hãy kiểm tra giá mới trước khi lưu.');
    const products = await Promise.all([...new Set(plan.updated.map(row => row.productId))].map(id => tx.get(reference('products', id))));
    if (products.some(snapshot => !snapshot.exists() || snapshot.data().companyId !== companyId || snapshot.data().isArchived)) throw syncError('Sản phẩm đã thay đổi hoặc không thuộc công ty này.');
    const saved = { ...order, syncVersion: (Number(previous?.syncVersion) || 0) + 1,
      syncCommands: [...(previous?.syncCommands || []).slice(-19), { id: command.mutationId, fingerprint: command.fingerprint }],
      customerProductSync: { updated: plan.updated, skipped: plan.skipped },
    };
    delete saved.__pendingFirebaseSync;
    tx.set(orderRef, saved);
    if (plan.patch) tx.update(customerRef, plan.patch);
    return { existingDocuments: [
      { collectionName: 'orderRequests', documentId: command.requestId, payload: saved },
      ...(plan.patch ? [{ collectionName: 'customers', documentId: command.payload.customerId, payload: { ...customer, ...plan.patch } }] : []),
    ], skipped: plan.skipped };
  });
}
