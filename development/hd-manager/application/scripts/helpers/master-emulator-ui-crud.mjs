import assert from 'node:assert/strict';

const PROJECT = 'demo-hd-manager-local';
const APP_ID = 'hd-manager-local';
const APP_ORIGIN = 'http://127.0.0.1:5214';
const STEP_TIMEOUT = 20000;
const POLL_TIMEOUT = 30000;

function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

export function buildMasterUiCrudFixtures(runId, companyId, empId) {
  requireCondition(typeof runId === 'string' && /^[a-f0-9]{32}$/.test(runId), 'crud-invalid-run-id');
  requireCondition(typeof companyId === 'string' && /^[A-Za-z0-9_-]+$/.test(companyId), 'crud-invalid-company');
  requireCondition(typeof empId === 'string' && /^[A-Za-z0-9_-]+$/.test(empId), 'crud-invalid-employee');
  const suffix = BigInt(`0x${runId.slice(0, 12)}`).toString();
  return {
    uiCustomerId: `ui-${runId}-0`, probeProductId: `probe-${runId}-0`,
    salesId: `crud-sales-${runId}`, importId: `wi_master_crud_${runId}`,
    product: { name: `Crud Product ${suffix}`, shortName: 'MCRUD', category: 'Crud Group',
      unit: 'Con', purchaseUnit: 'Kg', stockQuantity: 10, stockUnit: 'Con', costPrice: 12000, sellingPrice: 25000 },
    customer: { name: `Crud Customer ${suffix}`, phone: `08${String(BigInt(`0x${runId.slice(0, 12)}`) % 100000000n).padStart(8, '0')}`,
      address: 'Local Crud Address', customerGroup: 'Crud Group', customerHonorific: '', debtLimitMode: 'no_debt',
      debtLimitAmount: 0, openingDebtAmount: 0, openingPayableAmount: 0 },
    dispatch: { companyId, customerId: `ui-${runId}-0`, productId: `probe-${runId}-0`,
      empId, createdByEmpId: empId, quantity: 2, quantityCount: 2, pieceCount: 2,
      actualQuantity: 2, quantityUnit: 'Con', actualUnit: 'Con', weightKg: 3.75, actualWeightKg: 3.75,
      weightEntries: [1.25, 2.5], billingUnit: 'Kg', pricingUnit: 'Kg', billingQuantity: 3.75,
      unitPrice: 10000, price: 10000, amount: 37500, pricingAmount: 37500, lineTotal: 37500,
      billingSnapshotValid: true, billingSnapshotVersion: 1, isArchived: false,
      isOutsideOrderRequest: true, createdWithoutOrderRequest: true, sourceOrderRequestMissing: true },
  };
}

export function assertMasterUiCrudContext({ page, owner }) {
  const url = new URL(page.url());
  requireCondition(url.origin === APP_ORIGIN && !url.username && !url.password, 'crud-foreign-ui');
  requireCondition(owner?.app?.options?.projectId === PROJECT, 'crud-foreign-project');
  requireCondition(owner.auth?.app === owner.app && owner.db?.app === owner.app, 'crud-mixed-sdk-apps');
  const emulator = owner.auth.emulatorConfig;
  requireCondition(emulator?.host === '127.0.0.1' && emulator.port === 9199 && emulator.protocol === 'http', 'crud-foreign-auth');
  // Fail closed on SDK settings changes; never infer an emulator from project name alone.
  const settings = owner.db._getSettings?.();
  requireCondition(settings?.host === '127.0.0.1:8185' && settings.ssl === false, 'crud-foreign-firestore');
  requireCondition(owner.auth.currentUser && owner.claims?.accountType === 'employee'
    && ['super_admin', 'owner'].includes(owner.claims.role), 'crud-owner-required');
}

export function assertMasterDispatchPayload(data, expected) {
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(data[key], value, `crud-dispatch-${key}`);
  requireCondition(typeof data.id === 'string' && /^wd_[A-Za-z0-9_-]+$/.test(data.id), 'crud-invalid-dispatch-id');
  requireCondition(typeof data.clientMutationId === 'string' && data.clientMutationId.startsWith('wd_'), 'crud-missing-client-command');
  for (const key of ['createdAt', 'updatedAt']) requireCondition(Number.isFinite(Date.parse(data[key])), `crud-invalid-${key}`);
}

async function bounded(work, deadline, timeout = STEP_TIMEOUT) {
  const remaining = Math.min(timeout, deadline - Date.now());
  requireCondition(remaining > 0, 'crud-deadline');
  let timer;
  try {
    return await Promise.race([work(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('crud-step-timeout')), remaining);
    })]);
  } finally { clearTimeout(timer); }
}

// Invoke only after the caller's genuine owner-A UI login, with the caller's
// existing local-only browser network guard and real owner-authenticated SDK.
// Opening stock/profile setup is SDK fixture provisioning, not UI CRUD evidence.
export async function exerciseMasterEmulatorUiCrud({ page, nav, owner, firestore, ref, read, runId, check }) {
  assertMasterUiCrudContext({ page, owner });
  for (const callback of [ref, read, check]) requireCondition(typeof callback === 'function', 'crud-missing-callback');
  const fixture = buildMasterUiCrudFixtures(runId, owner.claims.companyId, owner.claims.appUserId);
  const deadline = Date.now() + 180000;
  let stopped = false;
  let productId;
  let customerId;
  let dispatchId;
  let phaseNumber = 0;
  let stepNumber = 0;
  const active = () => {
    requireCondition(!stopped && Date.now() < deadline, 'crud-deadline');
    assertMasterUiCrudContext({ page, owner });
  };
  const step = async work => {
    const number = ++stepNumber;
    try { return await bounded(() => { active(); return work(); }, deadline); }
    catch (error) {
      error.safeCrudStep = `crud-phase-${phaseNumber}-step-${number}`;
      throw error;
    }
  };
  const phase = async (name, work) => {
    phaseNumber++;
    stepNumber = 0;
    try { await check(name, () => bounded(work, deadline, 60000)); }
    catch (error) { stopped = true; throw error; }
  };
  const documentRef = (collection, id) => {
    active();
    const document = ref(owner, collection, id);
    requireCondition(document.firestore === owner.db
      && document.path === `artifacts/${APP_ID}/public/data/${collection}/${id}`, 'crud-foreign-document');
    return document;
  };
  const serverRead = async (collection, id) => {
    documentRef(collection, id);
    return step(() => read(owner, collection, id));
  };
  const matches = async (collection, predicates) => {
    active();
    const source = firestore.collection(owner.db, 'artifacts', APP_ID, 'public', 'data', collection);
    const query = firestore.query(source, firestore.where('companyId', '==', owner.claims.companyId),
      ...predicates.map(([key, value]) => firestore.where(key, '==', value)));
    return step(() => firestore.getDocsFromServer(query));
  };
  const waitFor = async work => {
    const until = Math.min(deadline, Date.now() + POLL_TIMEOUT);
    do {
      const result = await work();
      if (result) return result;
      await step(() => page.waitForTimeout(200));
    } while (Date.now() < until);
    throw new Error('crud-server-or-draft-timeout');
  };
  const exactlyOne = async locator => {
    await step(() => locator.first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT }));
    assert.equal(await step(() => locator.count()), 1, 'crud-ambiguous-ui-control');
    return locator;
  };
  const click = async locator => { await exactlyOne(locator); await step(() => locator.click({ timeout: STEP_TIMEOUT })); };
  const fill = async (locator, value) => { await exactlyOne(locator); await step(() => locator.fill(`${value}`, { timeout: STEP_TIMEOUT })); };
  const select = async (locator, value) => { await exactlyOne(locator); await step(() => locator.selectOption(value, { timeout: STEP_TIMEOUT })); };
  const openModule = async (id, label, inMore = false) => {
    await step(() => nav.waitFor({ timeout: STEP_TIMEOUT }));
    if (inMore) {
      await click(nav.getByRole('button', { name: 'Thêm', exact: true }));
      await click(page.locator(`[data-hd-more-module="${id}"]`));
    } else await click(nav.getByRole('button', { name: label, exact: true }));
    const main = page.locator(`main[data-hd-module="${id}"]`);
    await exactlyOne(main);
    return main;
  };
  const waitCreated = (collection, name) => waitFor(async () => {
    const snapshot = await matches(collection, [['name', name]]);
    requireCondition(snapshot.size <= 1, 'crud-duplicate-created-name');
    return snapshot.size === 1 ? snapshot.docs[0] : null;
  });
  const assertFields = (data, fields) => {
    assert.equal(data.companyId, owner.claims.companyId, 'crud-wrong-tenant');
    assert.equal(data.isArchived, false, 'crud-created-archived');
    for (const [key, value] of Object.entries(fields)) assert.deepEqual(data[key], value, `crud-field-${key}`);
  };

  await phase('Legacy CRUD: local owner claims and authenticated SDK opening fixtures', async () => {
    const claims = (await step(() => owner.auth.currentUser.getIdTokenResult(true))).claims;
    for (const key of ['companyId', 'identityId', 'appUserId', 'accountType', 'role']) assert.equal(claims[key], owner.claims[key]);
    const customer = await serverRead('customers', fixture.uiCustomerId);
    const product = await serverRead('products', fixture.probeProductId);
    requireCondition(customer.exists() && product.exists(), 'crud-missing-owner-a-fixtures');
    for (const [snapshot, id] of [[customer, fixture.uiCustomerId], [product, fixture.probeProductId]]) {
      assert.equal(snapshot.data().companyId, owner.claims.companyId, 'crud-fixture-tenant');
      assert.equal(snapshot.data().id, id, 'crud-fixture-id');
      requireCondition(snapshot.data().name, 'crud-fixture-name-required');
    }
    for (const [collection, id] of [['warehouseImports', fixture.importId], ['employees', fixture.salesId]]) {
      requireCondition(!(await serverRead(collection, id)).exists(), 'crud-fixture-already-exists');
    }
    const now = new Date().toISOString();
    const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const part = kind => dateParts.find(item => item.type === kind).value;
    const date = `${part('year')}-${part('month')}-${part('day')}`;
    await step(() => firestore.setDoc(documentRef('products', fixture.probeProductId), {
      unit: 'Con', actualUnit: 'Con', purchaseUnit: 'Kg', stockUnit: 'Con', stockQuantity: 0,
      shortName: 'MCDISP', productShortName: 'MCDISP',
      price: 10000, sellingPrice: 10000, category: 'Crud Dispatch Group', updatedAt: now,
    }, { merge: true }));
    await step(() => firestore.setDoc(documentRef('customers', fixture.uiCustomerId), {
      customerProductIds: [...new Set([...(customer.data().customerProductIds || []), fixture.probeProductId])],
      priceOverrides: { ...(customer.data().priceOverrides || {}),
        [fixture.probeProductId]: { price: 10000, pricingUnit: 'Kg', orderUnits: ['Con'], defaultOrderUnit: 'Con' } },
      updatedAt: now,
    }, { merge: true }));
    await step(() => firestore.setDoc(documentRef('warehouseImports', fixture.importId), {
      id: fixture.importId, companyId: owner.claims.companyId, empId: owner.claims.appUserId,
      createdByEmpId: owner.claims.appUserId, productId: fixture.probeProductId,
      productName: product.data().name, productNameSnapshot: product.data().name,
      groupName: 'Crud Dispatch Group', quantity: 100, quantityUnit: 'Con', totalKg: 100,
      purchaseUnit: 'Kg', unitPrice: 0, amount: 0, sourceType: 'opening_balance',
      date, isArchived: false, createdAt: now, updatedAt: now,
    }));
    await step(() => firestore.setDoc(documentRef('employees', fixture.salesId), {
      id: fixture.salesId, companyId: owner.claims.companyId, name: 'Crud Sales Profile',
      position: 'Kinh doanh', role: 'employee', isArchived: false, createdAt: now, updatedAt: now,
    }));
    const opening = (await serverRead('warehouseImports', fixture.importId)).data();
    assertFields(opening, { productId: fixture.probeProductId, quantity: 100, quantityUnit: 'Con', totalKg: 100, amount: 0 });
    await step(() => page.reload({ timeout: STEP_TIMEOUT }));
    await step(() => nav.waitFor({ timeout: STEP_TIMEOUT }));
  });

  await phase('Actual product UI create/save: exact field guards and server confirmation', async () => {
    assert.equal((await matches('products', [['name', fixture.product.name]])).size, 0);
    const main = await openModule('products', 'Sản phẩm', true);
    await click(main.getByRole('button', { name: 'Thêm sản phẩm', exact: true }));
    const dialog = await exactlyOne(page.getByRole('dialog', { name: 'Tạo sản phẩm', exact: true }));
    for (const [label, key, type] of [['Tên sản phẩm', 'name', 'text'], ['Viết tắt', 'shortName', 'text'], ['Nhóm hàng', 'category', 'text'],
      ['Đơn vị bán', 'unit', 'text'], ['Đơn vị nhập', 'purchaseUnit', 'text'], ['Giá vốn', 'costPrice', 'tel'], ['Giá bán', 'sellingPrice', 'tel'],
      ['Tồn đầu', 'stockQuantity', 'number'], ['Đơn vị tồn', 'stockUnit', 'text']]) {
      const input = await exactlyOne(dialog.getByLabel(label, { exact: true }));
      assert.equal(await step(() => input.getAttribute('type')), type, 'crud-product-field-type');
      assert.equal(await step(() => input.isEditable()), true, 'crud-product-field-disabled');
      await fill(input, fixture.product[key]);
    }
    await click(dialog.getByRole('button', { name: 'Lưu', exact: true }));
    const saved = await waitCreated('products', fixture.product.name);
    productId = saved.id;
    requireCondition(/^prod_[A-Za-z0-9_-]+$/.test(productId), 'crud-product-ui-id');
    assertFields(saved.data(), fixture.product);
    await step(() => dialog.waitFor({ state: 'hidden', timeout: STEP_TIMEOUT }));
  });
  await phase('Actual product UI reload: same server document remains visible and unchanged', async () => {
    await step(() => page.reload({ timeout: STEP_TIMEOUT }));
    const main = await openModule('products', 'Sản phẩm', true);
    await step(() => main.getByText(fixture.product.name, { exact: true }).first().waitFor({ timeout: STEP_TIMEOUT }));
    assertFields((await serverRead('products', productId)).data(), fixture.product);
    assert.equal((await matches('products', [['name', fixture.product.name]])).size, 1);
  });

  await phase('Actual customer UI create/save: owner-selected sales profile and server confirmation', async () => {
    assert.equal((await matches('customers', [['name', fixture.customer.name]])).size, 0);
    const main = await openModule('customers', 'Khách hàng', true);
    const moduleActions = main.getByRole('button', { name: 'Mở thao tác khách hàng', exact: true });
    if (await step(() => moduleActions.isVisible())) {
      await click(moduleActions);
      await click(main.getByRole('button', { name: 'Tạo khách hàng', exact: true }));
    } else {
      await click(page.locator('.hd-contextual-fab-trigger'));
      const menu = page.getByRole('menu', { name: 'Thao tác nhanh' });
      if (await step(() => menu.isVisible())) {
        await click(menu.getByRole('menuitem', { name: 'Thêm khách hàng', exact: true }));
      }
    }
    const form = await exactlyOne(main.locator('.hd-customer-create-view[aria-label="Tạo khách hàng"]'));
    await select(form.getByRole('combobox', { name: 'Xưng hô khách hàng', exact: true }), '');
    for (const [label, key] of [['Tên khách hoặc công ty', 'name'], ['Số điện thoại khách hàng', 'phone'],
      ['Địa chỉ giao hàng', 'address'], ['Nhóm khách hàng', 'customerGroup']]) await fill(form.getByRole('textbox', { name: label, exact: true }), fixture.customer[key]);
    await select(form.getByRole('combobox', { name: 'Nhân viên phụ trách', exact: true }), fixture.salesId);
    await select(form.getByRole('combobox', { name: 'Hạn mức nợ', exact: true }), 'no_debt');
    await click(form.getByRole('button', { name: 'Lưu khách hàng', exact: true }));
    const saved = await waitCreated('customers', fixture.customer.name);
    customerId = saved.id;
    requireCondition(/^c_[A-Za-z0-9_-]+$/.test(customerId), 'crud-customer-ui-id');
    assertFields(saved.data(), { ...fixture.customer, empId: fixture.salesId });
    await step(() => form.waitFor({ state: 'hidden', timeout: STEP_TIMEOUT }));
  });
  await phase('Actual customer UI reload: same server document and business fields retained', async () => {
    await step(() => page.reload({ timeout: STEP_TIMEOUT }));
    const main = await openModule('customers', 'Khách hàng', true);
    await step(() => main.getByText(fixture.customer.name, { exact: true }).first().waitFor({ timeout: STEP_TIMEOUT }));
    assertFields((await serverRead('customers', customerId)).data(), { ...fixture.customer, empId: fixture.salesId });
    assert.equal((await matches('customers', [['name', fixture.customer.name]])).size, 1);
  });

  await phase('Actual legacy dispatch UI: selections, quantity, two weight entries, save and server confirmation', async () => {
    const customer = (await serverRead('customers', fixture.uiCustomerId)).data();
    const product = (await serverRead('products', fixture.probeProductId)).data();
    const predicates = [['customerId', fixture.uiCustomerId], ['productId', fixture.probeProductId]];
    const previous = await matches('warehouseDispatches', predicates);
    requireCondition(previous.size === 0, 'crud-existing-dispatch-for-fixture');
    const ids = new Set(previous.docs.map(document => document.id));
    const main = await openModule('warehouse_dispatch', 'Xuất kho', true);
    const customerSearch = main.getByRole('textbox', { name: 'Tìm tên khách hàng', exact: true });
    const productSearch = main.getByRole('textbox', { name: 'Tìm loại hàng', exact: true });
    await fill(customerSearch, customer.phone);
    const customerZone = main.locator('[data-search-zone]').filter({
      has: page.getByRole('textbox', { name: 'Tìm tên khách hàng', exact: true }),
    });
    await click(customerZone.getByRole('button').filter({ hasText: customer.phone }));
    await fill(productSearch, product.name);
    const productZone = main.locator('[data-search-zone]').filter({
      has: page.getByRole('textbox', { name: 'Tìm loại hàng', exact: true }),
    });
    await click(productZone.getByRole('button').filter({ hasText: product.name }));
    const quantity = main.getByPlaceholder('Số lượng', { exact: true });
    await fill(quantity, fixture.dispatch.quantity);
    await click(main.getByRole('button', { name: 'Nhập các lần cân kg', exact: true }));
    const modal = await exactlyOne(page.locator('.fixed.inset-0').filter({
      has: page.getByRole('heading', { name: 'Nhập các lần cân', exact: true }),
    }));
    await fill(modal.getByRole('textbox', { name: 'Lần cân 1', exact: true }), fixture.dispatch.weightEntries[0]);
    await fill(modal.getByRole('textbox', { name: 'Lần cân 2', exact: true }), fixture.dispatch.weightEntries[1]);
    await click(modal.getByRole('button', { name: 'Cập nhật', exact: true }));
    await step(() => modal.waitFor({ state: 'hidden', timeout: STEP_TIMEOUT }));
    const driver = main.getByRole('combobox', { name: 'Chọn nhân sự giao hàng', exact: true });
    if (await step(() => driver.count())) await select(driver, '');
    await click(main.getByRole('button', { name: 'Lưu và thêm mới', exact: true }));
    const saved = await waitFor(async () => {
      const snapshot = await matches('warehouseDispatches', predicates);
      const created = snapshot.docs.filter(document => !ids.has(document.id));
      requireCondition(created.length <= 1, 'crud-more-than-one-dispatch');
      return created[0] || null;
    });
    dispatchId = saved.id;
    assert.equal(saved.data().id, dispatchId);
    assertMasterDispatchPayload(saved.data(), fixture.dispatch);
    await waitFor(async () => (await step(() => customerSearch.inputValue())) === ''
      && (await step(() => productSearch.inputValue())) === ''
      && (await step(() => quantity.inputValue())) === '');
    await step(() => main.getByRole('button', { name: 'Nhập các lần cân kg', exact: true })
      .getByText('Số kg', { exact: true }).waitFor({ timeout: STEP_TIMEOUT }));
  });
  await phase('Actual legacy dispatch reload: persisted tenant record and visible dispatch row', async () => {
    await step(() => page.reload({ timeout: STEP_TIMEOUT }));
    const main = await openModule('warehouse_dispatch', 'Xuất kho', true);
    const persisted = await serverRead('warehouseDispatches', dispatchId);
    requireCondition(persisted.exists(), 'crud-dispatch-lost-after-reload');
    assert.equal(persisted.id, dispatchId);
    assertMasterDispatchPayload(persisted.data(), fixture.dispatch);
    const product = (await serverRead('products', fixture.probeProductId)).data();
    const customer = (await serverRead('customers', fixture.uiCustomerId)).data();
    assert.equal(product.shortName, 'MCDISP');
    await step(() => main.locator('tr').filter({ hasText: customer.name }).filter({ hasText: product.shortName })
      .first().waitFor({ timeout: STEP_TIMEOUT }));
  });
  return { scope: 'LEGACY_DIRECT_FIRESTORE_SDK', productId, customerId, dispatchId,
    uiCreatedAndServerVerified: ['products', 'customers', 'warehouseDispatches'],
    fixtureProvisioning: 'Owner-authenticated local SDK public profile/opening import; not UI evidence',
    notCertified: ['Atomic inventory API', 'Materialized inventory balances', 'Retry/idempotency', 'Production workflows'] };
}
