import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runInteractionActionCases({ page, navigate, measure, failures, viewport, output }) {
  const run = async (module, task) => {
    if (process.env.HD_AUDIT_ACTION_MODULES && !process.env.HD_AUDIT_ACTION_MODULES.split(',').includes(module)) return;
    try { await task(); }
    catch (error) {
      failures.push({ viewport, module, action: 'extended_cases', error: error.message });
      console.log(`EXTENDED FAIL ${module}: ${error.message.slice(0, 300)}`);
      await writeFile(path.join(output, `${viewport}-${module}-failure.txt`), await page.locator('body').innerText());
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
      const dismiss = page.getByRole('button', { name: /^(Đóng|Hủy|Quay lại)$/ }).last();
      if (await dismiss.isVisible()) await dismiss.click({ timeout: 1000 }).catch(() => {});
    }
  };
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
  await run('order_requests', async () => {
    await navigate('order_requests');
    for (let i = 1; i <= 5; i++) {
      await measure('order_requests', 'open_create', () => page.getByRole('button', { name: 'LÊN ĐƠN' }).click(), { selector: '.hd-order-request-modal-panel' }, i);
      const form = page.getByRole('dialog');
      await form.getByPlaceholder('Chọn hoặc tìm khách hàng').fill('Cửa hàng Lan Anh');
      await form.getByRole('option', { name: /Cửa hàng Lan Anh/ }).click();
      await form.getByRole('button', { name: 'Tiếp tục' }).click();
      await form.getByRole('button', { name: '-- Chọn sp --' }).click();
      await form.getByPlaceholder('Tìm sản phẩm trong danh mục').fill('Sản phẩm 0000');
      await form.getByRole('button', { name: /Sản phẩm 0000/ }).last().click();
      await form.getByPlaceholder('Số lượng').fill(String(i + 3));
      await measure('order_requests', 'save_create', () => form.getByRole('button', { name: 'Lưu đơn', exact: true }).click(), { selector: '.hd-order-request-modal-panel', mode: 'hidden' }, i);
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
  });
  await run('price_quotes', async () => {
    await navigate('price_quotes');
    const main = page.locator('main[data-hd-module="price_quotes"]');
    await main.getByRole('combobox').selectOption('p_perf_0');
    await main.getByRole('button', { name: 'Chọn tất cả', exact: true }).click();
    for (let i = 1; i <= 5; i++) {
      const value = 51000 + i;
      await main.getByPlaceholder('VD: 68.000').fill(String(value));
      await measure('price_quotes', 'apply_price', () => main.getByRole('button', { name: 'Áp dụng giá mới', exact: true }).click(), { selector: 'main[data-hd-module="price_quotes"]', mode: 'text', value: new Intl.NumberFormat('vi-VN').format(value) }, i);
      await page.waitForFunction(value => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).customers.c_preview_01.priceOverrides.p_perf_0.price === value, value);
      await main.getByText(/^Đã áp giá/).first().waitFor();
    }
    await page.screenshot({ path: path.join(output, `${viewport}-quote-saved.png`) });
  });
}
