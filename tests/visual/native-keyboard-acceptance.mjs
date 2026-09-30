import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runNativeKeyboardAcceptance({ page, navigate, adb, serial, output }) {
  assert.ok(serial.startsWith('emulator-'), 'This test changes emulator orientation only');
  const shell = (...args) => execFileSync(adb, ['-s', serial, 'shell', ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  const rotation = shell('settings', 'get', 'system', 'user_rotation');
  const automaticRotation = shell('settings', 'get', 'system', 'accelerometer_rotation');
  const samples = [];
  const capture = async name => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
      const dialog = document.querySelector('[role="dialog"], .hd-child-view');
      return {
        width: innerWidth, height: innerHeight, visualHeight: visualViewport.height,
        visualTop: visualViewport.offsetTop, keyboard: document.documentElement.classList.contains('hd-keyboard-open'),
        shell: rect('.mobile-app-shell'), dialog: dialog?.getBoundingClientRect().toJSON(),
        actions: dialog?.querySelector('.hd-modal-actions, .hd-child-view__actions')?.getBoundingClientRect().toJSON(),
        bodyScroll: scrollY, bodyOverflow: getComputedStyle(document.body).overflow,
        documentWidth: document.documentElement.scrollWidth,
        nativeSafeTop: getComputedStyle(document.documentElement).getPropertyValue('--hd-native-safe-top'),
        nativeSafeBottom: getComputedStyle(document.documentElement).getPropertyValue('--hd-native-safe-bottom'),
      };
    });
    const ime = shell('dumpsys', 'input_method').split('\n').filter(line => /mInputShown|mShowRequested|packageName=com\.hdmanager|inputType=|hasVisibleConnection/.test(line)).slice(0, 16);
    samples.push({ name, layout, ime });
    await writeFile(path.join(output, `native-${name}.png`), execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 16 * 1024 * 1024 }));
    return layout;
  };
  try {
    shell('settings', 'put', 'system', 'accelerometer_rotation', '0');
    shell('settings', 'put', 'system', 'user_rotation', '0');
    await page.waitForFunction(() => innerHeight > innerWidth);
    await navigate('products');
    await page.locator('main').getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Tạo sản phẩm' });
    await form.waitFor();
    const initial = await capture('portrait');
    await form.getByRole('textbox', { name: 'Tên sản phẩm', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('hd-keyboard-open'));
    const text = await capture('text-keyboard');
    assert.ok(text.visualHeight < initial.visualHeight - 100, 'Real IME must reduce the visible viewport');
    assert.ok(text.actions.bottom <= text.visualHeight + text.visualTop + 2, 'Actions must clear the actual IME');
    assert.ok(text.dialog.top >= -2, 'Header must remain in the visible viewport');
    assert.ok(Math.abs(text.shell.height - initial.shell.height) <= 2, 'App shell must not jump with IME');
    await form.getByRole('textbox', { name: 'Tên sản phẩm', exact: true }).pressSequentially('Keyboard test');
    await form.getByRole('textbox', { name: 'Giá bán', exact: true }).click();
    const number = await capture('number-keyboard');
    assert.ok(number.actions.bottom <= number.visualHeight + number.visualTop + 2);
    await form.getByRole('textbox', { name: 'Giá bán', exact: true }).pressSequentially('50000');
    shell('input', 'keyevent', 'KEYCODE_BACK');
    await page.waitForFunction(() => !document.documentElement.classList.contains('hd-keyboard-open'));
    const dismissed = await capture('dismissed-keyboard');
    assert.ok(Math.abs(dismissed.actions.bottom - initial.actions.bottom) <= 2, 'Actions must restore after keyboard dismissal');
    assert.ok(Math.abs(dismissed.dialog.top - initial.dialog.top) <= 2, 'Modal header must restore after keyboard dismissal');
    assert.equal(dismissed.bodyScroll, initial.bodyScroll, 'Background must not scroll behind the modal');
    shell('settings', 'put', 'system', 'user_rotation', '1');
    await page.waitForFunction(() => innerWidth > innerHeight);
    const landscape = await capture('landscape');
    assert.ok(landscape.actions.bottom <= landscape.visualHeight + landscape.visualTop + 2);
    assert.ok(landscape.documentWidth <= landscape.width + 1);
    shell('settings', 'put', 'system', 'user_rotation', '0');
    await page.waitForFunction(() => innerHeight > innerWidth);
    const restored = await capture('portrait-restored');
    assert.ok(Math.abs(restored.actions.bottom - initial.actions.bottom) <= 2);
    shell('input', 'keyevent', 'KEYCODE_BACK');
    await form.waitFor({ state: 'hidden' });
    await page.locator('[data-hd-navigation="bottom"]').waitFor();
    await capture('native-back');
    await navigate('customers');
    const openCustomer = async () => {
      const actions = page.getByRole('button', { name: 'Mở thao tác khách hàng', exact: true });
      if (await actions.isVisible()) {
        await actions.click();
        await page.getByRole('button', { name: 'Tạo khách hàng', exact: true }).click();
      } else {
        await page.locator('.hd-contextual-fab-trigger').click();
        await page.getByRole('menuitem', { name: 'Thêm khách hàng', exact: true }).click();
      }
      const view = page.locator('.hd-customer-create-view');
      await view.waitFor();
      return view;
    };
    const customer = await openCustomer();
    await customer.getByRole('combobox', { name: 'Nhân viên phụ trách', exact: true }).selectOption('emp_sales_01');
    const customerInitial = await capture('customer-portrait');
    await customer.getByRole('textbox', { name: 'Tên khách hoặc công ty', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('hd-keyboard-open'));
    await customer.getByRole('textbox', { name: 'Tên khách hoặc công ty', exact: true }).pressSequentially('Native Keyboard Customer');
    const customerText = await capture('customer-text-ime');
    assert.ok(customerText.actions.bottom <= customerText.visualHeight + customerText.visualTop + 2, 'Inline customer save must clear text IME');
    assert.ok(Math.abs(customerText.shell.height - customerInitial.shell.height) <= 2, 'Child forms must not resize the app shell');
    const phone = customer.getByRole('textbox', { name: 'Số điện thoại khách hàng', exact: true });
    await phone.click();
    await phone.pressSequentially('0999888777');
    const customerNumber = await capture('customer-number-ime');
    assert.ok(customerNumber.actions.bottom <= customerNumber.visualHeight + customerNumber.visualTop + 2, 'Inline customer save must clear phone IME');
    await customer.getByRole('button', { name: 'Lưu khách hàng', exact: true }).click();
    await customer.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).customers).filter(row => row.name === 'Native Keyboard Customer').length === 1);
    await page.waitForFunction(() => !document.documentElement.classList.contains('hd-keyboard-open'));
    await capture('customer-saved');
    const cancelledCustomer = await openCustomer();
    await cancelledCustomer.getByRole('textbox', { name: 'Tên khách hoặc công ty', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.classList.contains('hd-keyboard-open'));
    shell('input', 'keyevent', 'KEYCODE_BACK');
    await page.waitForFunction(() => !document.documentElement.classList.contains('hd-keyboard-open'));
    const customerDismissed = await capture('customer-ime-dismissed');
    assert.ok(Math.abs(customerDismissed.actions.bottom - customerInitial.actions.bottom) <= 2, 'Child action bar must restore after IME dismissal');
    await cancelledCustomer.getByRole('button', { name: 'Hủy', exact: true }).click();
    await cancelledCustomer.waitFor({ state: 'hidden' });
    await navigate('order_requests');
    const requests = page.locator('.premium-order-request-module');
    const numberFormat = new Intl.NumberFormat('vi-VN');
    for (let iteration = 1; iteration <= 3; iteration++) {
      const previousPrice = await page.evaluate(() => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).orderRequests.or_save_speed.items[0].unitPrice);
      const nextPrice = previousPrice + 1;
      await requests.getByRole('button', { name: numberFormat.format(previousPrice), exact: true }).first().click();
      const priceForm = page.getByRole('dialog', { name: 'Sửa đơn giá' });
      const priceInput = priceForm.getByRole('textbox').first();
      await priceInput.click();
      await page.waitForFunction(() => document.documentElement.classList.contains('hd-keyboard-open'));
      await priceInput.fill('');
      await priceInput.pressSequentially(String(nextPrice));
      const beforeSave = await capture(`price-ime-${iteration}`);
      assert.ok(beforeSave.actions.bottom <= beforeSave.visualHeight + beforeSave.visualTop + 2, 'Price save must clear the real IME');
      await priceForm.getByRole('button', { name: 'Lưu', exact: true }).click();
      await priceForm.waitFor({ state: 'hidden' });
      await requests.getByRole('button', { name: numberFormat.format(nextPrice), exact: true }).first().waitFor();
      await page.waitForFunction(value => JSON.parse(localStorage.getItem('hd-manager-local-db-v2-clean-preview')).orderRequests.or_save_speed.items[0].unitPrice === value, nextPrice);
      await page.waitForFunction(() => !document.documentElement.classList.contains('hd-keyboard-open'));
      const afterSave = await capture(`price-saved-${iteration}`);
      assert.ok(Math.abs(afterSave.shell.height - initial.shell.height) <= 2, 'Shell must restore after saving with IME open');
    }
    await writeFile(path.join(output, 'native-keyboard.json'), JSON.stringify({ environment: 'Installed acceptance APK, real emulator IME/orientation/Back, isolated fixture', status: 'PASS', samples }, null, 2));
  } catch (error) {
    await capture('keyboard-failure').catch(() => {});
    await writeFile(path.join(output, 'native-keyboard.json'), JSON.stringify({ status: 'FAIL', error: error.message, samples }, null, 2));
    throw error;
  } finally {
    shell('settings', 'put', 'system', 'user_rotation', rotation);
    shell('settings', 'put', 'system', 'accelerometer_rotation', automaticRotation);
  }
}
