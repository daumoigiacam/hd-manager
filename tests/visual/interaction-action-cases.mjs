import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export const PRODUCT_COVERAGE_FIXTURE_VERSION = 2;
export const PRODUCT_COVERAGE_FIXTURES = Object.freeze([
  { marker: 'Alpine', name: 'Audit Coverage Product Alpine', category: 'Audit Coverage Alpine', shortName: 'ACALP' },
  { marker: 'Beacon', name: 'Audit Coverage Product Beacon', category: 'Audit Coverage Beacon', shortName: 'ACBEA' },
  { marker: 'Cobalt', name: 'Audit Coverage Product Cobalt', category: 'Audit Coverage Cobalt', shortName: 'ACCOB' },
].map(Object.freeze));

export function expectedCoverageSearchNames(products, coverage) {
  const normalize = value => `${value ?? ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd').replace(/\u0110/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const marker = coverage.marker.toLowerCase();
  assert.match(marker, /^[a-z]{5,}$/);
  // A unique alphabetic prefix proves singleton membership without using the production ranker.
  // Include every searchable product field; UUID digits cannot satisfy these markers.
  const matches = Object.values(products).filter(product => {
    if (product.isArchived) return false;
    const initials = normalize(product.name || product.productName).split(' ').map(token => token[0] || '').join('');
    const fields = [product.name, product.productName, product.shortName, product.productShortName,
      product.alias, product.abbreviation, initials, product.code, product.sku, product.barcode, product.id,
      product.category, product.mainGroup, product.unit, product.attributes, product.productAttributes,
      product.variants, product.attributeOptions];
    return fields.flat().some(value => normalize(value).split(' ').some(token => token.startsWith(marker)));
  });
  assert.deepEqual(matches.map(product => product.name), [coverage.name], `Coverage marker ${coverage.marker} must identify exactly one active row across all searchable fields`);
  assert.equal(matches[0].companyId, 'comp_preview');
  return matches.map(product => product.name);
}

export async function waitForExactSearchResults(page, selector, values) {
  await page.waitForFunction(({ selector, values }) => {
    const labels = [...document.querySelectorAll(selector)]
      .filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .map(node => node.textContent.trim());
    return labels.length === values.length && labels.every((label, index) => label === values[index]);
  }, { selector, values });
}

export async function measureSearchReadiness({ page, measure, module, action, input, query, selector, values, iteration }) {
  assert.notEqual(await page.locator(input).inputValue(), query, 'Readiness measurement must change the input value, not refill a preselected label');
  const alreadyReady = await page.locator(selector).evaluateAll((nodes, values) => {
    const labels = nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')
      .map(node => node.textContent.trim());
    return labels.length === values.length && labels.every((label, index) => label === values[index]);
  }, values);
  assert.equal(alreadyReady, false, 'Readiness measurement must start with a different, settled result set');
  return measure(module, `${action}_result_ready_v1`, () => page.locator(input).fill(query), {
    selector, mode: 'exact-list', values,
    inputPaint: { selector: input, value: query, action: `${action}_input_paint_v1` },
  }, iteration);
}

export async function runInteractionActionCases({ page, navigate, measure, failures, viewport, output, clickCommand = locator => locator.click(), deliveryFixtures = [], inventoryHistoryFixture = null }) {
  const run = async (module, task) => {
    if (process.env.HD_AUDIT_ACTION_MODULES && !process.env.HD_AUDIT_ACTION_MODULES.split(',').includes(module)) return;
    try { await task(); }
    catch (error) {
      failures.push({ viewport, module, action: 'extended_cases', error: error.message, stack: error.stack });
      console.log(`EXTENDED FAIL ${module}: ${error.message.slice(0, 300)}`);
      await writeFile(path.join(output, `${viewport}-${module}-failure.txt`), await page.locator('body').innerText());
      await writeFile(path.join(output, `${viewport}-${module}-store.json`), await page.evaluate(() => JSON.stringify(window.__readPreviewStore())));
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
  if (process.env.HD_AUDIT_ORDER_SEARCH === '1') await run('orders', async () => {
    await navigate('orders');
    const selector = 'main[data-hd-module="orders"] .premium-data-list > .hd-render-contained h3';
    await page.locator(selector).first().waitFor();
    const expected = await page.locator(selector).allTextContents();
    assert.ok(expected.length > 0 && expected.length <= 50);
    const broadExpected = await page.evaluate(() => {
      const db = window.__readPreviewStore();
      return Object.values(db.orders).filter(row => row.id.startsWith('o_perf_'))
        .sort((a, b) => b.id.localeCompare(a.id)).slice(0, 50).map(row => db.customers[row.customerId].name);
    });
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).first().click();
    const input = '[placeholder="Tìm đơn hàng..."]';
    await page.locator(input).waitFor();
    for (let iteration = 1; iteration <= 3; iteration++) {
      await page.locator(input).fill('zzzznomatch');
      await page.getByText('Không tìm thấy đơn phù hợp', { exact: true }).waitFor();
      await measureSearchReadiness({ page, measure, module: 'orders', action: 'broad_search', input,
        query: 'khach', selector, values: broadExpected, iteration });
      assert.ok(await page.locator(selector).count() <= 50);
      await page.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
      await waitForExactSearchResults(page, selector, expected.map(value => value.trim()));
    }
    await page.screenshot({ path: path.join(output, `${viewport}-orders-search.png`) });
  });
  if (inventoryHistoryFixture) {
    await run('warehouse_import', async () => {
      const history = inventoryHistoryFixture;
      await navigate('warehouse_import');
      const main = page.locator('main[data-hd-module="warehouse_import"]');
      const readDocuments = () => {
        const db = window.__readPreviewStore();
        return Object.fromEntries(['warehouseImports', 'warehouseDispatches', 'warehouseStockCounts', 'orderRequests', 'products']
          .map(key => [key, db[key] || {}]));
      };
      const documents = await page.evaluate(readDocuments);
      assert.equal(Object.keys(documents.warehouseDispatches).length, 4300);
      assert.equal(Object.keys(documents.orderRequests).length, 4500);
      assert.equal(Object.keys(documents.warehouseImports).filter(id => id.startsWith('import_history_')).length, 62);
      assert.equal(Object.keys(documents.products).filter(id => id.startsWith('p_perf_')).length, 600);
      assert.equal(Object.keys(documents.warehouseStockCounts).length, 0, 'History oracle has no counted-stock baseline');
      const dates = new Set();
      for (const dispatch of Object.values(documents.warehouseDispatches)) {
        const request = documents.orderRequests[dispatch.sourceOrderRequestId];
        assert.equal(dispatch.companyId, 'comp_preview');
        assert.equal(dispatch.quantity, 5);
        assert.equal(dispatch.quantityUnit, 'Kg');
        assert.equal(dispatch.weightKg, 5);
        assert.equal(request.date, dispatch.date);
        assert.equal(request.customerId, dispatch.customerId);
        assert.equal(request.items[0].productId, dispatch.productId);
        dates.add(dispatch.date);
      }
      assert.deepEqual([...dates].sort(), history.dates);
      const format = value => new Intl.NumberFormat('vi-VN').format(value);
      const stockSection = 'main[data-hd-module="warehouse_import"] section:has(input[aria-label="Chọn ngày đối chiếu tồn kho"])';
      const stockValues = `${stockSection} div.grid.w-full > span`;
      const expectedValues = expected => expected.groups.flatMap(group => group.measures.flatMap(row => [
        row.unit, `Nhập ${format(row.imported)}`, `Xuất ${format(row.exported)}`, 'Kiểm -', `Tồn ${format(row.remaining)}`,
      ]));
      const current = history.expectedStock.at(-1);
      const findGroup = (expected, name) => {
        const group = expected.groups.find(row => row.name === name);
        assert.ok(group, `Missing history oracle group ${name}`);
        return group;
      };
      const findMeasure = (group, unit) => {
        const measure = group.measures.find(row => row.unit === unit);
        assert.ok(measure, `Missing history oracle measure ${group.name}/${unit}`);
        return measure;
      };
      const stockButton = main.locator('.premium-data-toolbar').getByRole('button', { name: /^Tồn\s+\d+$/ });
      const importButton = main.locator('.premium-data-toolbar').getByRole('button', { name: /^Nhập\s+\d+$/ });
      for (let i = 1; i <= 5; i++) {
        await measure('warehouse_import', 'history_open_stock_v1', () => stockButton.click(),
          { selector: stockValues, mode: 'exact-list', values: expectedValues(current) }, i);
        if (i < 5) await importButton.click();
      }
      const dateInput = main.getByLabel('Chọn ngày đối chiếu tồn kho', { exact: true });
      assert.equal(await dateInput.inputValue(), history.currentDate);
      const observed = [];
      const capture = async (expected, expectedDate = expected.date) => {
        await waitForExactSearchResults(page, stockValues, expectedValues(expected));
        assert.equal(await dateInput.inputValue(), expectedDate);
        const renderedGroups = await page.locator(`${stockSection} button[aria-label^="Ẩn nhóm "]`)
          .evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label').slice('Ẩn nhóm '.length)));
        assert.deepEqual(renderedGroups, expected.groups.map(group => group.name), 'Stock group order must match the independent original-behavior oracle');
        const groups = [];
        for (const group of expected.groups) {
          const measures = [];
          for (const row of group.measures) {
            const selector = `${stockSection} div:has(> button[aria-label=${JSON.stringify(`Ẩn chỉ số ${row.unit} của ${group.name}`)}]) > span`;
            const labels = await page.locator(selector).allTextContents();
            assert.deepEqual(labels.map(label => label.trim()), [row.unit, `Nhập ${format(row.imported)}`, `Xuất ${format(row.exported)}`, 'Kiểm -', `Tồn ${format(row.remaining)}`]);
            measures.push({ ...row, labels });
          }
          groups.push({ name: group.name, measures });
        }
        return { date: await dateInput.inputValue(), groups };
      };
      observed.push(await capture(current, history.currentDate));
      // Each consecutive date changes the cumulative totals, not just the input's painted value.
      for (const [index, expected] of history.expectedStock.entries()) {
        assert.notEqual(await dateInput.inputValue(), expected.date);
        await measure('warehouse_import', 'history_date_result_ready_v1', () => dateInput.fill(expected.date),
          { selector: stockValues, mode: 'exact-list', values: expectedValues(expected) }, index + 1);
        observed.push(await capture(expected));
      }
      assert.ok(history.expectedStock.every(expected => findMeasure(findGroup(expected, 'Hàng thử'), 'Kg').remaining < 0), 'Fixture must exercise negative kg stock on every historical date');
      const beforeMonth = new Date(`${history.month}-01T00:00:00Z`);
      beforeMonth.setUTCDate(0);
      const emptyDate = beforeMonth.toISOString().slice(0, 10);
      await measure('warehouse_import', 'history_empty_date_v1', () => dateInput.fill(emptyDate),
        { selector: stockSection, mode: 'text', value: 'Chưa có dữ liệu nhập kho hoặc xuất kho thực tế để đối chiếu tồn kho.' }, 1);
      assert.equal(await page.locator(stockValues).count(), 0);
      await measure('warehouse_import', 'history_current_date_v1', () => dateInput.fill(history.currentDate),
        { selector: stockValues, mode: 'exact-list', values: expectedValues(current) }, 1);
      observed.push(await capture(current, history.currentDate));
      const checklist = main.locator('section').filter({ has: page.getByText('Kiểm kho thực tế', { exact: true }) });
      assert.equal(await checklist.count(), 1);
      const modal = 'main[data-hd-module="warehouse_import"] div:has(> div > button[aria-label="Đóng sửa tồn thực tế"])';
      const choices = [['Hàng thử', 'Con'], ['Audit history control', 'Con'], ['Audit history control', 'Kg']]
        .map(([name, unit]) => {
          const group = findGroup(current, name);
          const row = findMeasure(group, unit);
          assert.ok(row.remaining > 0, 'Only positive stock measures have real checklist drill-down controls');
          return { group, row };
        });
      for (const [index, { group, row }] of choices.entries()) {
        const card = checklist.locator('div.w-full').filter({ has: page.getByText(group.name, { exact: true }) });
        assert.equal(await card.count(), 1);
        assert.equal(await card.getByRole('button', { name: `Tồn ${format(row.remaining)} ${row.unit}`, exact: true }).count(), 1);
        await measure('warehouse_import', 'history_open_group_unit_v1', () => card.getByRole('button', { name: `Tồn ${format(row.remaining)} ${row.unit}`, exact: true }).click(),
          { selector: `${modal} h3, ${modal} h3 + p`, mode: 'exact-list', values: [group.name, `Theo hệ thống: ${format(row.remaining)} ${row.unit}`] }, index + 1);
        assert.equal(Number(await page.locator(modal).getByLabel(`Tồn thực tế (${row.unit})`, { exact: true }).inputValue()), row.remaining);
        await page.locator(modal).getByRole('button', { name: 'Đóng sửa tồn thực tế', exact: true }).click();
      }
      assert.deepEqual(await page.evaluate(readDocuments), documents, 'Read-only date and group/unit controls must not mutate documents');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-hd-shell="enterprise"]').waitFor();
      await navigate('warehouse_import');
      await stockButton.click();
      await capture(current, history.currentDate);
      assert.deepEqual(await page.evaluate(readDocuments), documents, 'Full history fixture must survive reload without reseeding or data loss');
      await writeFile(path.join(output, `${viewport}-inventory-history-acceptance-v1.json`), JSON.stringify({
        scope: 'Isolated preview, real stock tab/date/group-unit controls; no inventory writes',
        month: history.month, counts: history.counts, observations: observed,
        negativeKg: 'PASS', emptyDate: emptyDate, currentDate: history.currentDate,
        sourceLinks: 'PASS', groupUnitDrilldown: 'PASS', documentsUnchanged: 'PASS', reloadRecovery: 'PASS',
        unavailable: history.unavailable,
        monthlyCalculation: 'UNAVAILABLE: no reachable monthly report control; no timing sample fabricated',
      }, null, 2));
    });
    return;
  }
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
    if (process.env.HD_AUDIT_CORE_SMOOTHNESS === '1') {
      const selector = 'main[data-hd-module="orders"] .premium-data-list > .hd-render-contained';
      const target = (await cards.filter({ hasText: 'HDIEW01' }).textContent()).trim();
      const other = (await cards.filter({ hasText: 'HDIEW02' }).textContent()).trim();
      await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      const input = 'input[placeholder="Tìm đơn hàng..."]';
      await measureSearchReadiness({ page, measure, module: 'orders', action: 'search_cold', input,
        query: 'HDIEW02', selector, values: [other], iteration: 1 });
      for (let i = 1; i <= 5; i++) {
        await page.locator(input).fill('HDIEW02');
        await waitForExactSearchResults(page, selector, [other]);
        await measureSearchReadiness({ page, measure, module: 'orders', action: 'search', input,
          query: 'HDIEW01', selector, values: [target], iteration: i });
      }
      await page.locator(input).fill('');
      await page.waitForFunction(selector => document.querySelectorAll(selector).length === 50, selector);
      await page.locator(input).blur();
    }
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
    // The preceding legacy edit saves p_perf_0 through the name formatter.
    const searchPrimeProduct = await page.evaluate(() => window.__readPreviewStore().products.p_perf_1);
    assert.equal(searchPrimeProduct?.id, 'p_perf_1');
    assert.equal(searchPrimeProduct.companyId, 'comp_preview');
    assert.equal(searchPrimeProduct.name, 'Sản phẩm 0001');
    assert.equal(searchPrimeProduct.isArchived, false);
    if (process.env.HD_AUDIT_PRODUCT_LEGACY_PRECONDITION === '1') {
      const editedProduct = await page.evaluate(() => window.__readPreviewStore().products.p_perf_0);
      assert.equal(editedProduct?.shortName, 'P5', 'Focused readiness acceptance must include all five preceding legacy edits');
      assert.equal(editedProduct.name, 'Sản Phẩm 0000');
    }
    for (let i = 1; i <= 5; i++) {
      const name = `Audit Product ${i}`;
      await measure('products', 'open_create', () => page.locator('main').getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click(), { selector: '[role="dialog"][aria-label="Tạo sản phẩm"]' }, i);
      const form = page.getByRole('dialog', { name: 'Tạo sản phẩm' });
      await form.getByRole('textbox', { name: 'Tên sản phẩm', exact: true }).fill(name);
      await form.getByLabel('Nhóm hàng', { exact: true }).fill('Audit');
      await form.getByRole('textbox', { name: 'Giá bán', exact: true }).fill('50000');
      await measure('products', 'save_create', () => form.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[role="dialog"][aria-label="Tạo sản phẩm"]', mode: 'hidden' }, i);
      await page.waitForFunction(name => Object.values(window.__readPreviewStore().products).filter(row => row.name === name).length === 1, name);
      if (!await page.getByPlaceholder('Tìm sản phẩm...').isVisible()) {
        await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      }
      await measure('products', 'search', () => page.getByPlaceholder('Tìm sản phẩm...').fill(name), { selector: '.hd-product-list', mode: 'text', value: name }, i);
      const names = '.hd-product-list__item .hd-product-list__name';
      await waitForExactSearchResults(page, names, [name]);
      assert.equal(await page.locator('.hd-product-list__item').count(), 1, 'search must cover the entire dataset, including newly created records');
      // Keep the historical search sample unchanged; supplemental pairs use a nonmatching precondition.
      await page.getByPlaceholder('Tìm sản phẩm...').fill(searchPrimeProduct.name);
      await waitForExactSearchResults(page, names, [searchPrimeProduct.name]);
      await measureSearchReadiness({ page, measure, module: 'products', action: 'search',
        input: 'input[placeholder="Tìm sản phẩm..."]', query: name, selector: names, values: [name], iteration: i });
      await measure('products', 'delete', () => page.getByRole('button', { name: `Xóa sản phẩm ${name}`, exact: true }).click(), { selector: '.hd-product-list__item', mode: 'hidden' }, i);
      await page.waitForFunction(name => Object.values(window.__readPreviewStore().products).some(row => row.name === name && row.isArchived), name);
      await page.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
    }
    const pager = page.getByRole('navigation', { name: 'Phân trang sản phẩm' });
    if (await pager.count()) {
      assert.ok(await page.locator('.hd-product-list__item').count() <= 50);
      await pager.getByRole('combobox', { name: 'Chọn trang' }).selectOption('12');
      await page.waitForFunction(() => document.querySelectorAll('.hd-product-list__item').length === 2);
      assert.equal(await page.locator('.hd-product-list__item').count(), 2);
      await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      await page.getByPlaceholder('Tìm sản phẩm...').fill(searchPrimeProduct.name);
      await waitForExactSearchResults(page, '.hd-product-list__item .hd-product-list__name', [searchPrimeProduct.name]);
      assert.equal(await page.locator('.hd-product-list__item').count(), 1, 'filter must reset the rendered page');
      await page.getByPlaceholder('Tìm sản phẩm...').fill('');
      await page.locator('.hd-app-header').getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
      await page.waitForFunction(() => !document.documentElement.classList.contains('hd-keyboard-open'));
    }
    if (process.env.HD_AUDIT_MASTER_FIXTURES === '1') {
      const receipts = [];
      const readProducts = () => window.__readPreviewStore().products;
      for (const [index, coverage] of PRODUCT_COVERAGE_FIXTURES.entries()) {
        const i = index + 1;
        const { name, category, shortName } = coverage;
        await measure('products', 'coverage_create_open_v1', () => page.locator('main').getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click(),
          { selector: '[role="dialog"][aria-label="Tạo sản phẩm"]' }, i);
        const create = page.getByRole('dialog', { name: 'Tạo sản phẩm' });
        await create.getByRole('textbox', { name: 'Tên sản phẩm', exact: true }).fill(name);
        await create.getByLabel('Nhóm hàng', { exact: true }).fill(category);
        await create.getByRole('textbox', { name: 'Giá bán', exact: true }).fill('61000');
        await measure('products', 'coverage_create_save_v1', () => create.getByRole('button', { name: 'Lưu', exact: true }).click(),
          { selector: '[role="dialog"][aria-label="Tạo sản phẩm"]', mode: 'hidden' }, i);
        await page.waitForFunction(name => Object.values(window.__readPreviewStore().products).filter(row => row.name === name).length === 1, name);
        const expectedNames = expectedCoverageSearchNames(await page.evaluate(readProducts), coverage);
        if (!await page.getByPlaceholder('Tìm sản phẩm...').isVisible()) await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
        await page.getByPlaceholder('Tìm sản phẩm...').fill(name);
        await waitForExactSearchResults(page, '.hd-product-list__name', expectedNames);
        await measure('products', 'coverage_edit_open_v1', () => page.locator('.hd-product-list__primary').click(),
          { selector: '[role="dialog"][aria-label="Sửa sản phẩm"]' }, i);
        const edit = page.getByRole('dialog', { name: 'Sửa sản phẩm' });
        await edit.getByRole('textbox', { name: 'Viết tắt', exact: true }).fill(shortName);
        await edit.getByRole('textbox', { name: 'Giá bán', exact: true }).fill(String(62000 + i));
        await measure('products', 'coverage_edit_save_v1', () => edit.getByRole('button', { name: 'Lưu', exact: true }).click(),
          { selector: '[role="dialog"][aria-label="Sửa sản phẩm"]', mode: 'hidden' }, i);
        await page.waitForFunction(({ name, shortName, i }) => Object.values(window.__readPreviewStore().products)
          .some(row => row.name === name && row.shortName === shortName && row.sellingPrice === 62000 + i), { name, shortName, i });
        const matches = Object.values(await page.evaluate(readProducts)).filter(row => row.name === name);
        assert.equal(matches.length, 1);
        assert.equal(matches[0].companyId, 'comp_preview');
        assert.equal(matches[0].category, category);
        receipts.push(matches[0]);
        await waitForExactSearchResults(page, '.hd-product-list__name', expectedCoverageSearchNames(await page.evaluate(readProducts), coverage));
        await page.locator('.hd-product-list__short-name').filter({ hasText: shortName }).waitFor();
        await page.locator('.hd-product-list__primary').click();
        assert.equal(await edit.getByRole('textbox', { name: 'Viết tắt', exact: true }).inputValue(), shortName);
        assert.equal(Number((await edit.getByRole('textbox', { name: 'Giá bán', exact: true }).inputValue()).replace(/\D/g, '')), 62000 + i);
        await edit.getByRole('button', { name: 'Quay lại', exact: true }).click();
      }
      // Recovery and real category controls are acceptance checks, outside save latency.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-hd-shell="enterprise"]').waitFor();
      await navigate('products');
      if (await page.getByPlaceholder('Tìm sản phẩm...').isVisible()) await page.getByPlaceholder('Tìm sản phẩm...').fill('');
      await page.waitForFunction(() => document.querySelectorAll('.hd-product-list__item').length === 50);
      const recovered = await page.evaluate(readProducts);
      for (const receipt of receipts) assert.deepEqual(recovered[receipt.id], receipt, 'Edited product must survive reload unchanged');
      await page.locator('.hd-app-header').getByRole('button', { name: 'Bộ lọc', exact: true }).last().click();
      const main = page.locator('main[data-hd-module="products"]');
      // This visual label is not programmatically associated with its native select.
      const categorySelect = main.locator('label').filter({ hasText: /^Lọc theo nhóm$/ }).locator('..').getByRole('combobox');
      for (let i = 1; i <= receipts.length; i++) {
        await measure('products', 'coverage_filter_category_v1', () => categorySelect.selectOption(receipts[i - 1].category),
          { selector: '.hd-product-list__name', mode: 'exact-list', values: [receipts[i - 1].name] }, i);
      }
      await main.getByRole('button', { name: 'Xóa bộ lọc', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.hd-product-list__item').length === 50);
      assert.equal(await categorySelect.inputValue(), 'Tất cả');
      for (const receipt of receipts) assert.deepEqual((await page.evaluate(readProducts))[receipt.id], receipt, 'Filtering must not mutate records');
      await writeFile(path.join(output, `${viewport}-product-edit-filter-acceptance.json`), JSON.stringify({
        scope: 'Isolated full preview fixture; real UI create/edit/filter, not backend authorization acceptance',
        fixtureVersion: PRODUCT_COVERAGE_FIXTURE_VERSION, fixtures: PRODUCT_COVERAGE_FIXTURES,
        expectedOrderedSearchResults: PRODUCT_COVERAGE_FIXTURES.map(coverage => expectedCoverageSearchNames(recovered, coverage)),
        documentIds: receipts.map(row => row.id), reopen: 'PASS', reloadRecovery: 'PASS', categoryFilter: 'PASS', reset: 'PASS',
      }, null, 2));
    }
  });
  await run('employees', async () => {
    await navigate('employees');
    for (let i = 1; i <= 5; i++) {
      const card = page.getByRole('button', { name: /^Mở hồ sơ Ngọc Anh(?: \d+)?$/ });
      await measure('employees', 'open_edit', () => card.click(), { selector: '[role="dialog"][aria-label^="Hồ sơ nhân sự"]' }, i);
      const profile = page.getByRole('dialog', { name: /^Hồ sơ nhân sự/ });
      const field = profile.getByPlaceholder('Tên nhân sự');
      const value = `Ngọc Anh ${i}`;
      await measure('employees', 'input_name', () => field.fill(value), { selector: '[role="dialog"] input[placeholder="Tên nhân sự"]', mode: 'value', value }, i);
      await measure('employees', 'save_edit', () => profile.getByRole('button', { name: 'Lưu', exact: true }).click(), { selector: '[role="dialog"][aria-label^="Hồ sơ nhân sự"]', mode: 'hidden' }, i);
      await page.waitForFunction(value => window.__readPreviewStore().employees.emp_sales_01.name === value, value);
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
      await page.waitForFunction(name => Object.values(window.__readPreviewStore().customers).filter(row => row.name === name).length === 1, name);
      if (!await page.getByPlaceholder('Tìm khách hàng, nhà cung cấp...').isVisible()) await page.locator('.hd-app-header').getByRole('button', { name: 'Tìm kiếm', exact: true }).last().click();
      await page.getByPlaceholder('Tìm khách hàng, nhà cung cấp...').fill(name);
      await main.locator('[data-customer-card]').filter({ hasText: name }).click();
      await main.getByRole('button', { name, exact: true }).click();
      const edit = main.locator('[data-customer-edit-form]');
      await edit.getByRole('textbox', { name: 'Tên khách hàng', exact: true }).fill(`${name} Updated`);
      await measure('customers', 'save_edit', () => edit.getByRole('button', { name: 'Lưu thông tin khách hàng', exact: true }).click(), { selector: '[data-customer-edit-form]', mode: 'text', value: 'Đã lưu tạm thông tin khách hàng.' }, i);
      await page.waitForFunction(name => Object.values(window.__readPreviewStore().customers).some(row => row.name === `${name} Updated`), name);
      await measure('customers', 'delete', () => main.getByRole('button', { name: 'Xóa khách hàng', exact: true }).click(), { selector: '.premium-customer-detail', mode: 'hidden' }, i);
      await page.waitForFunction(name => !Object.values(window.__readPreviewStore().customers).some(row => row.name === `${name} Updated` && !row.isArchived), name);
    }
  });
  await run('order_requests', async () => {
    await navigate('order_requests');
    const iterations = Number(process.env.HD_AUDIT_REQUEST_ITERATIONS || 5);
    assert.ok(Number.isInteger(iterations) && iterations >= 5 && iterations <= 50);
    for (let i = 1; i <= iterations; i++) {
      await measure('order_requests', 'open_create', () => clickCommand(page.getByRole('button', { name: 'LÊN ĐƠN' })), { selector: '.hd-order-request-modal-panel' }, i);
      const form = page.getByRole('dialog');
      if (process.env.HD_AUDIT_CORE_SOURCE_INPUTS === '1') {
        await form.getByPlaceholder('Chọn hoặc tìm khách hàng').focus();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await measure('order_requests', 'input_one_customer', () => form.getByPlaceholder('Chọn hoặc tìm khách hàng').pressSequentially('C'),
          { selector: 'input[placeholder="Chọn hoặc tìm khách hàng"]', mode: 'value', value: 'C' }, i);
      }
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
      if (process.env.HD_AUDIT_CORE_SOURCE_INPUTS === '1') {
        await form.getByPlaceholder('Tìm sản phẩm trong danh mục').focus();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await measure('order_requests', 'input_one_product', () => form.getByPlaceholder('Tìm sản phẩm trong danh mục').pressSequentially('S'),
          { selector: 'input[placeholder="Tìm sản phẩm trong danh mục"]', mode: 'value', value: 'S' }, i);
      }
      await form.getByPlaceholder('Tìm sản phẩm trong danh mục').fill('Sản phẩm 0000');
      await clickCommand(form.getByRole('button', { name: /Sản phẩm 0000/i }).last());
      if (process.env.HD_AUDIT_CORE_SOURCE_INPUTS === '1') {
        await form.getByPlaceholder('Số lượng').fill('');
        await measure('order_requests', 'input_one_quantity', () => form.getByPlaceholder('Số lượng').pressSequentially(String(i + 3)),
          { selector: 'input[placeholder="Số lượng"]', mode: 'value', value: String(i + 3) }, i);
      } else await form.getByPlaceholder('Số lượng').fill(String(i + 3));
      await measure('order_requests', 'save_create', () => clickCommand(form.getByRole('button', { name: 'Lưu đơn', exact: true })), { selector: '.hd-order-request-modal-panel', mode: 'hidden' }, i);
      await page.waitForFunction(quantity => Object.values(window.__readPreviewStore().orderRequests).filter(row => row.customerId === 'c_preview_01' && row.items?.[0]?.quantity === quantity).length === 1, i + 3);
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
      await page.waitForFunction(value => Object.values(window.__readPreviewStore().payments).some(row => row.note === value), value);
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
      await page.waitForFunction(note => Object.values(window.__readPreviewStore().expenses).filter(row => row.note === note).length === 1, note);
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
      await page.waitForFunction(value => window.__readPreviewStore().customers.c_preview_01.priceOverrides.p_perf_0.price === value, value);
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
        const rules = window.__readPreviewStore().pricingRules.pricing_engine_rules;
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
        const db = window.__readPreviewStore();
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
        const db = window.__readPreviewStore();
        const logs = Object.values(db.assetCostLogs || {}).filter(row => row.note === note);
        return logs.length === 1 && Object.values(db.expenses || {}).filter(row => row.id === logs[0].expenseId && row.amount === 200000).length === 1;
      }, note);
    }
  });
  await run('delivery_reports', async () => {
    await navigate('delivery_reports');
    const main = page.locator('main[data-hd-module="delivery_reports"]');
    const form = main.locator('form').filter({ has: page.getByPlaceholder('Chọn hoặc tìm khách hàng') });
    const masterFixtures = process.env.HD_AUDIT_MASTER_FIXTURES === '1';
    if (masterFixtures) assert.equal(deliveryFixtures.length, 3, 'Master delivery cases require three dedicated linked fixtures');
    const receipts = [];
    const readLinkedReceipt = ({ customerId, dispatchId }) => {
      const db = window.__readPreviewStore();
      const reports = Object.values(db.deliveryReports || {}).filter(row => row.customerId === customerId || row.dispatchId === dispatchId);
      const reportIds = new Set(reports.map(row => row.id));
      const payments = Object.values(db.payments || {}).filter(row => reportIds.has(row.relatedDeliveryReportId));
      const expenses = Object.values(db.expenses || {}).filter(row => reportIds.has(row.relatedDeliveryReportId));
      return reports.length && payments.length && expenses.length ? { reports, payments, expenses } : null;
    };
    for (let i = 1; i <= 3; i++) {
      const delivery = masterFixtures ? deliveryFixtures[i - 1] : null;
      if (delivery) {
        const linked = await page.evaluate(({ customerId }) => {
          const db = window.__readPreviewStore();
          return { dispatches: Object.values(db.warehouseDispatches || {}).filter(row => row.customerId === customerId),
            requests: Object.values(db.orderRequests || {}).filter(row => row.customerId === customerId),
            reports: Object.values(db.deliveryReports || {}).filter(row => row.customerId === customerId) };
        }, delivery);
        assert.equal(linked.dispatches.length, 1);
        assert.equal(linked.requests.length, 1);
        assert.equal(linked.reports.length, 0, 'Each iteration must create a fresh report');
        assert.equal(linked.dispatches[0].id, delivery.dispatchId);
        assert.equal(linked.dispatches[0].companyId, delivery.companyId);
        assert.equal(linked.dispatches[0].productId, delivery.productId);
        assert.equal(linked.dispatches[0].sourceOrderRequestId, delivery.requestId);
        assert.equal(linked.dispatches[0].date, delivery.date);
        assert.equal(linked.requests[0].id, delivery.requestId);
        assert.equal(linked.requests[0].date, delivery.date);
        assert.equal(linked.requests[0].companyId, delivery.companyId);
        assert.equal(linked.requests[0].items[0].productId, delivery.productId);
        await form.getByPlaceholder('Chọn hoặc tìm khách hàng').fill(delivery.customerName);
        await form.getByRole('button', { name: `${delivery.customerName} ${delivery.phone}`, exact: true }).click();
        const price = form.locator('output[aria-label^="Giá bán "]');
        await price.waitFor();
        assert.equal(await price.count(), 1);
        assert.equal(await price.locator('..').getByText(delivery.productName, { exact: true }).count(), 1);
        assert.equal(await form.getByPlaceholder('Loại hàng', { exact: true }).count(), 0);
        assert.equal(await form.getByPlaceholder('Kg', { exact: true }).count(), 1);
        assert.equal(Number(await form.getByPlaceholder('Kg', { exact: true }).inputValue()), delivery.weightKg);
        assert.equal(Number(await form.getByRole('textbox', { name: 'Số lượng Kg', exact: true }).inputValue()), delivery.quantity);
        assert.equal(Number((await price.textContent()).replace(/\D/g, '')), delivery.unitPrice);
        assert.ok((await price.getAttribute('aria-label')).endsWith('theo Kg'));
      } else {
        await form.getByPlaceholder('Chọn hoặc tìm khách hàng').fill('Khách hàng 1');
        await form.getByRole('button', { name: /^Khách hàng 1\s+0900/ }).click();
        await form.getByPlaceholder('Loại hàng', { exact: true }).first().fill('Sản phẩm 0000');
      }
      await form.getByPlaceholder('Kg', { exact: true }).first().fill(String(10 + i));
      await form.getByRole('button', { name: /^Thu(?:\s|$)/ }).click();
      assert.equal(await form.getByRole('button', { name: /^Thu(?:\s|$)/ }).getAttribute('aria-expanded'), 'true');
      await form.getByPlaceholder(/^(Tiền thu|Gợi ý )/).fill(String(20000 + i));
      await form.getByRole('button', { name: 'Chi', exact: true }).click();
      assert.equal(await form.getByRole('button', { name: 'Chi', exact: true }).getAttribute('aria-expanded'), 'true');
      await form.getByPlaceholder('Số tiền', { exact: true }).fill(String(3000 + i));
      await form.getByPlaceholder('Loại chi', { exact: true }).fill('Chi giao hàng');
      await form.getByPlaceholder('Ghi chú ngắn', { exact: true }).fill(`Audit delivery ${i}`);
      await measure('delivery_reports', 'save_report_cashflow_double_tap', () => form.getByRole('button', { name: 'Báo cáo', exact: true }).dblclick(), { selector: 'main[data-hd-module="delivery_reports"]', mode: 'text', value: 'Đã lưu tạm báo cáo và các chứng từ liên quan' }, i);
      if (delivery) {
        await page.waitForFunction(readLinkedReceipt, delivery);
        const receipt = await page.evaluate(readLinkedReceipt, delivery);
        assert.equal(receipt.reports.length, 1, 'Double click must persist one linked report');
        assert.equal(receipt.payments.length, 1, 'Report must have one linked payment');
        assert.equal(receipt.expenses.length, 1, 'Report must have one linked expense');
        const [report] = receipt.reports;
        const [payment] = receipt.payments;
        const [expense] = receipt.expenses;
        assert.equal(report.companyId, delivery.companyId);
        assert.equal(report.customerId, delivery.customerId);
        assert.equal(report.dispatchId, delivery.dispatchId);
        assert.equal(report.productId, delivery.productId);
        assert.equal(report.date, delivery.date);
        assert.equal(report.expectedWeightKg, delivery.weightKg);
        assert.equal(report.actualWeightKg, 10 + i);
        assert.equal(report.billingUnit, 'Kg');
        assert.equal(report.billingQuantity, 10 + i);
        assert.equal(report.unitPrice, delivery.unitPrice);
        assert.equal(report.collectedAmount, 20000 + i);
        assert.equal(report.deliveryExpenseAmount, 3000 + i);
        assert.match(report.clientMutationId, /^[A-Za-z0-9_-]+$/);
        assert.equal(payment.companyId, delivery.companyId);
        assert.equal(payment.customerId, delivery.customerId);
        assert.equal(payment.dispatchId, delivery.dispatchId);
        assert.equal(payment.relatedDeliveryReportId, report.id);
        assert.equal(payment.amount, 20000 + i);
        assert.equal(expense.companyId, delivery.companyId);
        assert.equal(expense.dispatchId, delivery.dispatchId);
        assert.equal(expense.relatedDeliveryReportId, report.id);
        assert.equal(report.expenseId, expense.id);
        assert.equal(expense.amount, 3000 + i);
        assert.equal(expense.note, `Audit delivery ${i}`);
        receipts.push({ delivery, receipt });
      } else await page.waitForFunction(i => {
        const db = window.__readPreviewStore();
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
    await page.waitForFunction(() => Object.values(window.__readPreviewStore().expenses).filter(row => row.note === 'Audit standalone delivery' && row.amount === 4004).length === 1);
    if (masterFixtures) {
      // Recovery acceptance runs after all measured saves, outside their latency.
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('[data-hd-shell="enterprise"]').waitFor();
      await navigate('delivery_reports');
      for (const { delivery, receipt } of receipts) {
        assert.deepEqual(await page.evaluate(readLinkedReceipt, delivery), receipt, 'Linked delivery documents must survive reload unchanged');
      }
      await page.waitForFunction(() => Object.values(window.__readPreviewStore().expenses || {}).filter(row => row.note === 'Audit standalone delivery' && row.amount === 4004).length === 1);
    }
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
        const db = window.__readPreviewStore();
        return Object.values(db.payments || {}).filter(row => row.customerId === 'c_perf_0' && row.amount === amount).length === 1;
      }, amount);
    }
  });
}
