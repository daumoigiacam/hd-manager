import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runInteractionActionCases({ page, navigate, measure, failures, viewport, output, clickCommand = locator => locator.click() }) {
  const run = async (module, task) => {
    if (process.env.HD_AUDIT_ACTION_MODULES && !process.env.HD_AUDIT_ACTION_MODULES.split(',').includes(module)) return;
    try { await task(); }
    catch (error) {
      failures.push({ viewport, module, action: 'extended_cases', error: error.message, stack: error.stack });
      console.log(`EXTENDED FAIL ${module}: ${error.message.slice(0, 300)}`);
      await writeFile(path.join(output, `${viewport}-${module}-failure.txt`), await page.locator('body').innerText());
      await writeFile(path.join(output, `${viewport}-${module}-store.json`), await page.evaluate(() => localStorage.getItem('hd-manager-local-db-v2-clean-preview')));
      await page.screenshot({ path: path.join(output, `${viewport}-${module}-failure.png`) });
      const layout = await page.evaluate(() => {
        const node = document.querySelector('[role="dialog"]');
        const parents = [];
        for (let parent = node; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent);
          parents.push({ className: parent.className, rect: parent.getBoundingClientRect().toJSON(), position: style.position, transform: style.transform, filter: style.filter, contain: style.contain, overflow: style.overflow });
        }
        return { parents, innerHeight, innerWidth, scrollY, visualHeight: visualViewport.height, visualTop: visualViewport.offsetTop, visualScale: visualViewport.scale, rootStyle: document.documentElement.getAttribute('style') };
      });
      await writeFile(path.join(output, `${viewport}-${module}-layout.json`), JSON.stringify(layout, null, 2));
      if (process.env.HD_AUDIT_TRACE_EVENTS === '1') await writeFile(path.join(output, `${viewport}-${module}-events.json`), JSON.stringify(await page.evaluate(() => window.__hdAuditEvents), null, 2));
      const dismiss = page.getByRole('button', { name: /^(Đóng|Hủy|Quay lại)$/ }).last();
      if (await dismiss.isVisible()) await dismiss.click({ timeout: 1000 }).catch(() => {});
    }
  };
  await run('orders', async () => {
    await navigate('orders');
    const baseline = process.env.HD_AUDIT_LIST_BASELINE === '1';
    const cards = page.locator('main[data-hd-module="orders"] .premium-data-list > .hd-render-contained');
    if (baseline) await page.waitForFunction(() => document.querySelectorAll('main[data-hd-module="orders"] .premium-data-list > .hd-render-contained').length >= 1800, null, { timeout: 60000 });
    else await page.getByRole('navigation', { name: 'Phân trang đơn hàng' }).waitFor();
    const snapshot = await page.locator('main[data-hd-module="orders"]').evaluate(main => ({
      cardCount: main.querySelectorAll('.premium-data-list > .hd-render-contained').length,
      domNodeCount: main.querySelectorAll('*').length,
      summary: main.querySelector('[aria-label="Doanh thu ngày"]')?.textContent,
    }));
    await writeFile(path.join(output, `${viewport}-order-list.json`), JSON.stringify(snapshot, null, 2));
    assert.ok(baseline ? snapshot.cardCount >= 1800 : snapshot.cardCount === 50);
    if (!baseline) {
      const pager = page.getByRole('navigation', { name: 'Phân trang đơn hàng' });
      const total = Number((await pager.locator('span').innerText()).split('/').at(-1).trim());
      assert.ok(total >= 1800, 'pagination must retain the full order history');
      const lastPage = Math.ceil(total / 50) - 1;
      await measure('orders', 'page_last', () => pager.getByRole('combobox', { name: 'Chọn trang' }).selectOption(String(lastPage)), { selector: '[aria-label="Phân trang đơn hàng"]', mode: 'text', value: `${lastPage * 50 + 1}` }, 1);
      assert.equal(await cards.count(), total - lastPage * 50);
    }
  });
  await run('products', async () => {
    await navigate('products');
    for (let i = 1; i <= 5; i++) {
      const name = `Audit Product ${i}`;
      await measure('products', 'open_create', () => page.locator('main').getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click(), { selector: '[role="dialog"][aria-label="Tạo sản phẩm"]' }, i);
      const form = page.getByRole('dialog', { name: 'Tạo sản phẩm' });
      await form.getByRole('textbox', { name: 'Tên sản phẩm', exact: true }).fill(name);
      await form.getByLabel('Nhóm hàng', { exact: true }).fill('Audit');
      await form.getByRole('textbox', { name: 'Giá bán', exact: true }).fill('50000');
      await measure('products', 'save_create', () => form.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[role="dialog"][aria-label="Tạo sản phẩm"]', mode: 'hidden' }, i);
      await page.waitForFunction(name => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).products).filter(row => row.name === name).length === 1, name);
      if (!await page.getByPlaceholder('Tìm sản phẩm...').isVisible()) {
        await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      }
      await measure('products', 'search', () => page.getByPlaceholder('Tìm sản phẩm...').fill(name), { selector: '.hd-product-list', mode: 'text', value: name }, i);
      assert.equal(await page.locator('.hd-product-list__item').count(), 1, 'search must cover the entire dataset, including newly created records');
      await measure('products', 'delete', () => page.getByRole('button', { name: `Xóa sản phẩm ${name}`, exact: true }).click(), { selector: '.hd-product-list__item', mode: 'hidden' }, i);
      await page.waitForFunction(name => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).products).some(row => row.name === name && row.isArchived), name);
      await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
    }
    const pager = page.getByRole('navigation', { name: 'Phân trang sản phẩm' });
    if (await pager.count()) {
      assert.ok(await page.locator('.hd-product-list__item').count() <= 50);
      await pager.getByRole('combobox', { name: 'Chọn trang' }).selectOption('12');
      assert.equal(await page.locator('.hd-product-list__item').count(), 2);
      await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      await page.getByPlaceholder('Tìm sản phẩm...').fill('Sản phẩm 0000');
      assert.equal(await page.locator('.hd-product-list__item').count(), 1, 'filter must reset the rendered page');
      await page.getByPlaceholder('Tìm sản phẩm...').fill('');
      await page.locator('.hd-app-header').getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
      await page.waitForFunction(() => !document.documentElement.classList.contains('hd-keyboard-open'));
    }
  });
  await run('employees', async () => {
    await navigate('employees');
    for (let i = 1; i <= 5; i++) {
      const card = page.locator('main div[role="button"][tabindex="0"]').filter({ hasText: /Ngọc Anh/ }).first();
      await measure('employees', 'open_edit', () => card.click(), { selector: '[role="dialog"][aria-label^="Hồ sơ nhân sự"]' }, i);
      const profile = page.getByRole('dialog', { name: /^Hồ sơ nhân sự/ });
      const field = profile.getByPlaceholder('Tên nhân sự');
      const value = `Ngọc Anh ${i}`;
      await measure('employees', 'input_name', () => field.fill(value), { selector: '[role="dialog"] input[placeholder="Tên nhân sự"]', mode: 'value', value }, i);
      await measure('employees', 'save_edit', () => profile.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[role="dialog"][aria-label^="Hồ sơ nhân sự"]', mode: 'hidden' }, i);
      await page.waitForFunction(value => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).employees.emp_sales_01.name === value, value);
    }
  });
  await run('customers', async () => {
    await navigate('customers');
    const main = page.locator('main[data-hd-module="customers"]');
    const pager = page.getByRole('navigation', { name: 'Phân trang khách hàng' });
    if (await pager.count()) {
      const summary = await main.locator('.hd-customer-summary-grid').textContent();
      await pager.getByRole('button', { name: 'Trang sau' }).click();
      assert.equal(await main.locator('.hd-customer-summary-grid').textContent(), summary);
      assert.equal(await main.locator('[data-customer-card]').count(), 50);
    }
    for (let i = 1; i <= 3; i++) {
      const name = `Audit Customer ${i}`;
      const moduleActions = main.getByRole('button', { name: 'Mở thao tác khách hàng', exact: true });
      if (await moduleActions.isVisible()) {
        await moduleActions.click();
        await main.getByRole('button', { name: 'Tạo khách hàng', exact: true }).click();
      } else {
        await page.locator('.hd-contextual-fab-trigger').click();
        const menu = page.getByRole('menu', { name: 'Thao tác nhanh' });
        if (await menu.isVisible()) await menu.getByRole('menuitem', { name: 'Thêm khách hàng', exact: true }).click();
      }
      const create = main.locator('.hd-customer-create-view');
      await create.getByRole('textbox', { name: 'Tên khách hoặc công ty', exact: true }).fill(name);
      await create.getByRole('textbox', { name: 'Số điện thoại khách hàng', exact: true }).fill(`0999${String(i).padStart(6, '0')}`);
      await create.getByRole('combobox', { name: 'Nhân viên phụ trách', exact: true }).selectOption('emp_sales_01');
      await measure('customers', 'save_create_double_tap', () => create.getByRole('button', { name: 'Lưu khách hàng', exact: true }).dblclick(), { selector: '.hd-customer-create-view', mode: 'hidden' }, i);
      await page.waitForFunction(name => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).customers).filter(row => row.name === name).length === 1, name);
      if (!await page.getByPlaceholder('Tìm khách hàng, nhà cung cấp...').isVisible()) await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      await page.getByPlaceholder('Tìm khách hàng, nhà cung cấp...').fill(name);
      await main.locator('[data-customer-card]').filter({ hasText: name }).click();
      await main.getByRole('button', { name, exact: true }).click();
      const edit = main.locator('[data-customer-edit-form]');
      await edit.getByRole('textbox', { name: 'Tên khách hàng', exact: true }).fill(`${name} Updated`);
      await measure('customers', 'save_edit', () => edit.getByRole('button', { name: 'Lưu thông tin khách hàng', exact: true }).click(), { selector: '[data-customer-edit-form]', mode: 'text', value: 'Đã lưu tạm thông tin khách hàng.' }, i);
      await page.waitForFunction(name => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).customers).some(row => row.name === `${name} Updated`), name);
      await measure('customers', 'delete', () => main.getByRole('button', { name: 'Xóa khách hàng', exact: true }).click(), { selector: '.premium-customer-detail', mode: 'hidden' }, i);
      await page.waitForFunction(name => !Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).customers).some(row => row.name === `${name} Updated` && !row.isArchived), name);
    }
  });
  await run('order_requests', async () => {
    await navigate('order_requests');
    const iterations = Number(process.env.HD_AUDIT_REQUEST_ITERATIONS || 5);
    assert.ok(Number.isInteger(iterations) && iterations >= 5 && iterations <= 50);
    for (let i = 1; i <= iterations; i++) {
      await measure('order_requests', 'open_create', () => clickCommand(page.getByRole('button', { name: 'LÊN ĐƠN' })), { selector: '.hd-order-request-modal-panel' }, i);
      const form = page.getByRole('dialog');
      await form.getByPlaceholder('Chọn hoặc tìm khách hàng').fill('Cửa hàng Lan Anh');
      const customer = form.getByRole('option', { name: /Cửa hàng Lan Anh/ });
      if (process.env.HD_AUDIT_TRACE_EVENTS === '1') await customer.evaluate(node => {
        window.__hdAuditEvents.push({ type: 'before-customer-choice', time: performance.now(),
          targetBounds: node.getBoundingClientRect().toJSON(), visualHeight: visualViewport.height,
          innerHeight, modalHeight: document.documentElement.style.getPropertyValue('--hd-modal-viewport-height') });
      });
      await clickCommand(customer);
      await form.locator('.hd-order-request-customer-search.border-emerald-300').waitFor();
      await clickCommand(form.getByRole('button', { name: 'Tiếp tục' }));
      await clickCommand(form.getByRole('button', { name: '-- Chọn sp --' }));
      await form.getByPlaceholder('Tìm sản phẩm trong danh mục').fill('Sản phẩm 0000');
      await clickCommand(form.getByRole('button', { name: /Sản phẩm 0000/i }).last());
      await form.getByPlaceholder('Số lượng').fill(String(i + 3));
      await measure('order_requests', 'save_create', () => clickCommand(form.getByRole('button', { name: 'Lưu đơn', exact: true })), { selector: '.hd-order-request-modal-panel', mode: 'hidden' }, i);
      await page.waitForFunction(quantity => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).orderRequests).filter(row => row.customerId === 'c_preview_01' && row.items?.[0]?.quantity === quantity).length === 1, i + 3);
    }
  });
  await run('finance', async () => {
    await navigate('finance');
    const summary = page.locator('main[data-hd-module="finance"] .finance-summary-metrics');
    const total = await summary.innerText();
    const income = Number((await summary.locator('strong').first().innerText()).replace(/\D/g, ''));
    assert.ok(income >= 900 * 50000, 'summary must include payments beyond the visible page');
    const pager = page.getByRole('navigation', { name: 'Phân trang thu chi' });
    if (await pager.count()) {
      await pager.getByRole('button', { name: 'Trang sau' }).click();
      assert.equal(await summary.innerText(), total, 'changing pages must not change financial totals');
      await pager.getByRole('button', { name: 'Trang trước' }).click();
    }
    for (let i = 1; i <= 5; i++) {
      const row = page.locator('main[data-hd-module="finance"] div[role="button"][tabindex="0"]').first();
      await measure('finance', 'open_edit', () => row.click(), { selector: 'input[placeholder="Ghi chú"]' }, i);
      const input = page.getByPlaceholder('Ghi chú', { exact: true });
      const form = page.locator('form').filter({ has: input });
      const value = `Audit ${i}`;
      await measure('finance', 'input_note', () => input.fill(value), { selector: 'input[placeholder="Ghi chú"]', mode: 'value', value }, i);
      await measure('finance', 'save_edit', () => form.getByRole('button', { name: /Lưu/ }).click(), { selector: 'input[placeholder="Ghi chú"]', mode: 'hidden' }, i);
      await page.waitForFunction(value => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).payments).some(row => row.note === value), value);
    }
    for (let i = 1; i <= 3; i++) {
      await mainExpenseMenu();
      const input = page.getByPlaceholder('Nội dung chi', { exact: true });
      const form = page.locator('form').filter({ has: input });
      const note = `Audit expense ${i}`;
      await form.getByPlaceholder('Nhập hoặc chọn loại chi phí', { exact: true }).fill('Chi phí thử');
      await form.getByPlaceholder('Số tiền', { exact: true }).fill(String(12000 + i));
      await input.fill(note);
      await measure('finance', 'save_expense_double_tap', () => form.getByRole('button', { name: 'Lưu khoản chi', exact: true }).dblclick(), { selector: 'input[placeholder="Nội dung chi"]', mode: 'hidden' }, i);
      await page.waitForFunction(note => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).expenses).filter(row => row.note === note).length === 1, note);
    }
    async function mainExpenseMenu() {
      const menu = page.getByRole('button', { name: 'Mở thao tác thu chi', exact: true });
      if (await menu.isVisible()) {
        await menu.click();
        await page.getByRole('button', { name: 'Khoản chi', exact: true }).click();
      } else {
        await page.locator('.hd-contextual-fab-trigger').click();
        await page.getByRole('menuitem', { name: /Khoản chi/ }).click();
      }
    }
  });
  await run('price_quotes', async () => {
    await navigate('price_quotes');
    const main = page.locator('main[data-hd-module="price_quotes"]');
    await main.getByRole('combobox').selectOption('p_perf_0');
    await main.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    for (let i = 1; i <= 5; i++) {
      const value = 51000 + i;
      await main.getByPlaceholder('VD: 68.000').fill(String(value));
      if (process.env.HD_AUDIT_TRACE_EVENTS === '1') await main.getByRole('button', { name: 'Áp dụng giá mới', exact: true }).evaluate(node => {
        window.__hdAuditEvents.push({ type: 'before-quote-save', time: performance.now(),
          targetBounds: node.getBoundingClientRect().toJSON(), visualHeight: visualViewport.height,
          innerHeight, mainBounds: node.closest('main').getBoundingClientRect().toJSON() });
      });
      await measure('price_quotes', 'apply_price', () => main.getByRole('button', { name: 'Áp dụng giá mới', exact: true }).click(), { selector: 'main[data-hd-module="price_quotes"]', mode: 'text', value: new Intl.NumberFormat('vi-VN').format(value) }, i);
      await page.waitForFunction(value => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).customers.c_preview_01.priceOverrides.p_perf_0.price === value, value);
      await main.getByText(/^Đã (áp giá|lưu tạm giá)/).first().waitFor();
    }
    await page.screenshot({ path: path.join(output, `${viewport}-quote-saved.png`) });
  });
  await run('pricing', async () => {
    await navigate('pricing');
    const main = page.locator('main[data-hd-module="pricing"]');
    const groupKey = await main.getByRole('combobox').first().inputValue();
    for (let iteration = 1; iteration <= 5; iteration++) {
      const price = 32000 + iteration;
      await main.getByPlaceholder('Giá mới/kg', { exact: true }).fill(String(price));
      await measure('pricing', 'save_rules', () => clickCommand(main.getByRole('button', { name: 'Lưu', exact: true })), {
        selector: 'main[data-hd-module="pricing"] button:not(:disabled)', mode: 'text', value: 'Lưu',
        persisted: { collection: 'pricingRules', id: 'pricing_engine_rules', path: ['todayInputPriceOverrides', groupKey, 'pricePerKg'], value: price },
      }, iteration);
      await page.waitForFunction(({ groupKey, price }) => {
        const rules = JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).pricingRules.pricing_engine_rules;
        return Number(rules?.todayInputPriceOverrides?.[groupKey]?.pricePerKg) === price;
      }, { groupKey, price });
      await main.getByText(/Đã lưu (tạm )?hao hụt/).waitFor();
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-hd-shell="enterprise"]').waitFor();
    await navigate('pricing');
    await main.getByRole('combobox').first().selectOption(groupKey);
    assert.equal(Number((await main.getByPlaceholder('Giá mới/kg', { exact: true }).inputValue()).replace(/\D/g, '')), 32005);
  });
  await run('warehouse_import', async () => {
    await navigate('warehouse_import');
    const main = page.locator('main[data-hd-module="warehouse_import"]');
    for (let i = 1; i <= 5; i++) {
      const group = `Audit warehouse ${i}`;
      await main.getByPlaceholder('Nhóm hàng', { exact: true }).fill(group);
      await main.getByPlaceholder('VD 500', { exact: true }).fill('10');
      await main.getByPlaceholder('Giá / Kg', { exact: true }).fill('20000');
      await measure('warehouse_import', 'save_with_expense', () => main.getByRole('button', { name: 'Lưu nhập kho', exact: true }).click(), { selector: 'main[data-hd-module="warehouse_import"]', mode: 'text', value: `nhập kho ${group}` }, i);
      await page.waitForFunction(group => {
        const db = JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview'));
        const imports = Object.values(db.warehouseImports || {}).filter(row => row.groupName === group);
        return imports.length === 1 && Object.values(db.expenses || {}).filter(row => row.sourceWarehouseImportId === imports[0].id && row.amount === 200000).length === 1;
      }, group);
    }
  });
  await run('asset_management', async () => {
    await navigate('asset_management');
    const main = page.locator('main[data-hd-module="asset_management"]');
    await main.getByRole('button', { name: 'Thêm tài sản', exact: true }).click();
    const create = page.getByRole('dialog', { name: 'Thêm tài sản', exact: true });
    await create.getByPlaceholder('VD: Xe tải, máy phát điện').fill('Audit Truck');
    await measure('asset_management', 'save_create', () => create.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[role="dialog"][aria-label="Thêm tài sản"]', mode: 'hidden' }, 1);
    await main.getByRole('button').filter({ hasText: 'Audit Truck' }).first().click();
    await main.getByRole('tab', { name: 'Chi phí', exact: true }).click();
    for (let i = 1; i <= 5; i++) {
      await main.getByRole('button', { name: 'Thêm', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Thêm chi phí', exact: true });
      await form.getByPlaceholder('Số lít', { exact: true }).fill('10');
      await form.getByPlaceholder('Đơn giá', { exact: true }).fill('20000');
      await form.getByPlaceholder('Tổng tiền', { exact: true }).fill('200000');
      const note = `Audit fuel ${i}`;
      await form.getByPlaceholder('Ghi chú', { exact: true }).fill(note);
      await measure('asset_management', 'save_cost_with_expense', () => form.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[role="dialog"][aria-label="Thêm chi phí"]', mode: 'hidden' }, i);
      await page.waitForFunction(note => {
        const db = JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview'));
        const logs = Object.values(db.assetCostLogs || {}).filter(row => row.note === note);
        return logs.length === 1 && Object.values(db.expenses || {}).filter(row => row.id === logs[0].expenseId && row.amount === 200000).length === 1;
      }, note);
    }
  });
  await run('delivery_reports', async () => {
    await navigate('delivery_reports');
    const main = page.locator('main[data-hd-module="delivery_reports"]');
    const form = main.locator('form').filter({ has: page.getByPlaceholder('Chọn hoặc tìm khách hàng') });
    for (let i = 1; i <= 3; i++) {
      await form.getByPlaceholder('Chọn hoặc tìm khách hàng').fill('Khách hàng 1');
      await form.getByRole('button', { name: /^Khách hàng 1\s+0900/ }).click();
      await form.getByPlaceholder('Loại hàng', { exact: true }).first().fill('Sản phẩm 0000');
      await form.getByPlaceholder('Kg', { exact: true }).first().fill(String(10 + i));
      await form.getByRole('button', { name: 'Thu', exact: true }).click();
      assert.equal(await form.getByRole('button', { name: /^Thu(?:\s|$)/ }).getAttribute('aria-expanded'), 'true');
      await form.getByPlaceholder(/^(Tiền thu|Gợi ý )/).fill(String(20000 + i));
      await form.getByRole('button', { name: 'Chi', exact: true }).click();
      assert.equal(await form.getByRole('button', { name: 'Chi', exact: true }).getAttribute('aria-expanded'), 'true');
      await form.getByPlaceholder('Số tiền', { exact: true }).fill(String(3000 + i));
      await form.getByPlaceholder('Loại chi', { exact: true }).fill('Chi giao hàng');
      await form.getByPlaceholder('Ghi chú ngắn', { exact: true }).fill(`Audit delivery ${i}`);
      await measure('delivery_reports', 'save_report_cashflow_double_tap', () => form.getByRole('button', { name: 'Báo cáo', exact: true }).dblclick(), { selector: 'main[data-hd-module="delivery_reports"]', mode: 'text', value: 'Đã lưu tạm báo cáo và các chứng từ liên quan' }, i);
      await page.waitForFunction(i => {
        const db = JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview'));
        const reports = Object.values(db.deliveryReports || {}).filter(row => row.collectedAmount === 20000 + i);
        if (reports.length !== 1) return false;
        const report = reports[0];
        return Object.values(db.payments || {}).filter(row => row.relatedDeliveryReportId === report.id && row.amount === 20000 + i).length === 1
          && Object.values(db.expenses || {}).filter(row => row.relatedDeliveryReportId === report.id && row.amount === 3000 + i && row.note === `Audit delivery ${i}`).length === 1;
      }, i);
    }
    await form.getByRole('button', { name: 'Chi', exact: true }).click();
    await form.getByPlaceholder('Số tiền', { exact: true }).fill('4004');
    await form.getByPlaceholder('Loại chi', { exact: true }).fill('Chi chuyến riêng');
    await form.getByPlaceholder('Ghi chú ngắn', { exact: true }).fill('Audit standalone delivery');
    await measure('delivery_reports', 'save_standalone_expense', () => form.getByRole('button', { name: 'Lưu chi phí riêng', exact: true }).click(), { selector: 'main[data-hd-module="delivery_reports"]', mode: 'text', value: 'Đã lưu tạm chi phí chuyến giao' }, 1);
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).expenses).filter(row => row.note === 'Audit standalone delivery' && row.amount === 4004).length === 1);
  });
  await run('debt', async () => {
    await navigate('debt');
    const main = page.locator('main[data-hd-module="debt"]');
    const pager = page.getByRole('navigation', { name: 'Phân trang công nợ' });
    if (await pager.count()) {
      const before = await main.locator('.premium-debt-module > .grid').textContent();
      await pager.getByRole('button', { name: 'Trang sau' }).click();
      assert.equal(await main.locator('.premium-debt-module > .grid').textContent(), before, 'debt totals must not depend on the displayed page');
      await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      await page.getByPlaceholder('Tìm sổ nợ...').fill('Khách hàng 0');
    }
    await main.getByRole('heading', { name: 'Khách hàng 0', exact: true }).click();
    for (let i = 1; i <= 5; i++) {
      await main.getByRole('button', { name: 'Ghi nhận khoản thu', exact: true }).click();
      const form = page.getByRole('dialog', { name: 'Ghi nhận thanh toán', exact: true });
      const amount = 1100 + i;
      await form.getByPlaceholder('Số tiền (VNĐ)', { exact: true }).fill(String(amount));
      await measure('debt', 'save_payment_double_tap', () => form.getByRole('button', { name: 'Xác nhận thu', exact: true }).dblclick(), { selector: '[role="dialog"][aria-label="Ghi nhận thanh toán"]', mode: 'hidden' }, i);
      await page.waitForFunction(amount => {
        const db = JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview'));
        return Object.values(db.payments || {}).filter(row => row.customerId === 'c_perf_0' && row.amount === amount).length === 1;
      }, amount);
    }
  });
}
