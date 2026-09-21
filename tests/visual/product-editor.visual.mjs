import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_PRODUCT_EDITOR_URL || 'http://127.0.0.1:5179/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = process.env.HD_MANAGER_PRODUCT_EDITOR_OUTPUT || 'test-results/product-editor';
const claims = {
  uid: 'emp_admin',
  identityId: 'emp_admin',
  appUserId: 'emp_admin',
  companyId: 'comp_preview',
  companyName: 'Công ty HD Preview',
  accountType: 'employee',
  role: 'super_admin',
  name: 'Quản trị Demo',
  phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });

try {
  for (const viewport of [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1366, height: 768 },
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.addInitScript(token => { window.__initial_auth_token = token; }, authToken);
    const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
    assert.equal(response?.status(), 200, `${viewport.name}: local preview must return HTTP 200`);
    await page.waitForSelector('[data-hd-shell="enterprise"]', { timeout: 20000 });
    await page.waitForTimeout(1200);

    if (viewport.width < 600) {
      await page.locator('[data-hd-navigation="bottom"]').getByRole('button', { name: 'Thêm', exact: true }).click();
      await page.getByRole('button', { name: 'Kho sản phẩm', exact: true }).click();
    } else {
      await page.locator('[data-hd-navigation="sidebar"]').getByRole('button', { name: 'Sản phẩm', exact: true }).click();
    }
    await page.locator('.hd-product-list').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(400);

    const productChrome = await page.locator('.premium-products-module').evaluate((module) => {
      const tabs = Array.from(module.querySelectorAll('[role="tab"]'));
      const header = document.querySelector('.hd-app-header');
      const searchButton = header?.querySelector('button[aria-label="Tìm kiếm"]');
      const filterButton = header?.querySelector('button[aria-label="Bộ lọc"]');
      return {
        tabCount: tabs.length,
        tabWidths: tabs.map(tab => tab.getBoundingClientRect().width),
        title: header?.querySelector('.hd-header-title')?.textContent?.trim() || '',
        titleColor: header?.querySelector('.hd-header-title') ? getComputedStyle(header.querySelector('.hd-header-title')).color : '',
        searchBorderWidth: searchButton ? getComputedStyle(searchButton).borderTopWidth : '',
        filterBorderWidth: filterButton ? getComputedStyle(filterButton).borderTopWidth : '',
        notificationCount: header?.querySelectorAll('button[aria-label="Thông báo"]').length || 0,
      };
    });

    assert.equal(productChrome.tabCount, 3, `${viewport.name}: product module must expose three aligned tabs`);
    assert(productChrome.tabWidths.every(width => Math.abs(width - productChrome.tabWidths[0]) <= 1), `${viewport.name}: product tabs must have equal width`);
    assert.equal(productChrome.title, 'Kho SP', `${viewport.name}: product header must use the Kho SP title`);
    assert.equal(productChrome.titleColor, 'rgb(255, 255, 255)', `${viewport.name}: product header title must remain white`);
    assert.equal(productChrome.searchBorderWidth, '0px', `${viewport.name}: product search icon must not have a border`);
    assert.equal(productChrome.filterBorderWidth, '0px', `${viewport.name}: product filter icon must not have a border`);
    assert.equal(productChrome.notificationCount, 0, `${viewport.name}: product header must not show notifications`);

    const productListLayout = await page.locator('.hd-product-list').evaluate((list) => {
      const primary = list.querySelector('.hd-product-list__primary');
      const name = primary?.querySelector('.hd-product-list__name');
      const meta = primary?.querySelector('.hd-product-list__meta');
      const image = primary?.querySelector('.hd-product-list__image');
      const shortName = primary?.querySelector('.hd-product-list__short-name');
      const price = primary?.querySelector('.hd-product-list__price');
      const primaryRect = primary?.getBoundingClientRect();
      const centerY = element => {
        const rect = element?.getBoundingClientRect();
        return rect ? rect.top + rect.height / 2 : 0;
      };
      return {
        overflowY: getComputedStyle(list).overflowY,
        scrollBehavior: getComputedStyle(list).scrollBehavior,
        gridTemplateColumns: primary ? getComputedStyle(primary).gridTemplateColumns : '',
        itemCount: list.querySelectorAll('.hd-product-list__item').length,
        primaryCenterY: primaryRect ? primaryRect.top + primaryRect.height / 2 : 0,
        imageCenterY: centerY(image),
        shortNameCenterY: centerY(shortName),
        priceCenterY: centerY(price),
        nameBottom: name?.getBoundingClientRect().bottom || 0,
        metaTop: meta?.getBoundingClientRect().top || 0,
      };
    });

    assert(productListLayout.itemCount > 0, `${viewport.name}: product list must render rows`);
    assert.equal(productListLayout.overflowY, 'auto', `${viewport.name}: product list must support its own vertical scroll`);
    assert.equal(productListLayout.scrollBehavior, 'smooth', `${viewport.name}: product list scrolling must be smooth`);
    assert(productListLayout.gridTemplateColumns.split(' ').length >= 5, `${viewport.name}: image, name, short name, price and action must share one row`);
    assert(Math.abs(productListLayout.imageCenterY - productListLayout.primaryCenterY) <= 1, `${viewport.name}: image must align on the primary row`);
    assert(Math.abs(productListLayout.shortNameCenterY - productListLayout.primaryCenterY) <= 1, `${viewport.name}: short name must align on the primary row`);
    assert(Math.abs(productListLayout.priceCenterY - productListLayout.primaryCenterY) <= 1, `${viewport.name}: price must align on the primary row`);
    assert(productListLayout.metaTop >= productListLayout.nameBottom - 1, `${viewport.name}: attributes and unit must sit below the product name`);

    const longListLayout = await page.locator('.hd-product-list').evaluate((list) => {
      const sourceRows = Array.from(list.querySelectorAll('.hd-product-list__item'));
      const clones = [];
      let cloneIndex = 0;

      while (list.querySelectorAll('.hd-product-list__item').length < 37 && sourceRows.length > 0) {
        const clone = sourceRows[cloneIndex % sourceRows.length].cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        list.appendChild(clone);
        clones.push(clone);
        cloneIndex += 1;
      }

      const rows = Array.from(list.querySelectorAll('.hd-product-list__item'));
      const rowHeights = rows.map(row => row.getBoundingClientRect().height);
      const paintedRows = rows.filter((row) => {
        const primary = row.querySelector('.hd-product-list__primary');
        const name = row.querySelector('.hd-product-list__name');
        if (!primary || !name) return false;
        const primaryRect = primary.getBoundingClientRect();
        const nameStyle = getComputedStyle(name);
        return primaryRect.height >= 50 && nameStyle.display !== 'none' && nameStyle.visibility !== 'hidden';
      }).length;
      const contentVisibility = rows[0] ? getComputedStyle(rows[0]).contentVisibility : '';
      const scrollable = list.scrollHeight > list.clientHeight;
      const previousScrollBehavior = list.style.scrollBehavior;
      list.style.scrollBehavior = 'auto';
      list.scrollTop = Math.min(240, Math.max(0, list.scrollHeight - list.clientHeight));
      const scrolled = list.scrollTop > 0;

      clones.forEach(clone => clone.remove());
      list.scrollTop = 0;
      list.style.scrollBehavior = previousScrollBehavior;

      return {
        contentVisibility,
        itemCount: rows.length,
        minRowHeight: Math.min(...rowHeights),
        paintedRows,
        scrollable,
        scrolled,
      };
    });

    assert.equal(longListLayout.itemCount, 37, `${viewport.name}: long-list probe must render 37 rows`);
    assert.equal(longListLayout.contentVisibility, 'visible', `${viewport.name}: product rows must not use browser paint skipping`);
    assert(longListLayout.minRowHeight >= 50, `${viewport.name}: long product rows must keep their readable height (${JSON.stringify(longListLayout)})`);
    assert.equal(longListLayout.paintedRows, 37, `${viewport.name}: every long-list row must retain visible content`);
    assert(longListLayout.scrollable, `${viewport.name}: a 37-product list must be scrollable`);
    assert(longListLayout.scrolled, `${viewport.name}: a 37-product list must accept vertical scrolling`);
    await page.screenshot({ path: `${outputDir}/${viewport.name}-list.png`, fullPage: false });

    await page.getByRole('tab', { name: 'Tồn kho', exact: true }).click();
    await page.locator('.hd-product-list').waitFor({ state: 'visible', timeout: 10000 });
    const inventoryState = await page.locator('.hd-product-list').evaluate((list) => {
      const rows = Array.from(list.querySelectorAll('.hd-product-list__item'));
      const remainingQuantities = rows.map((row) => {
        const value = row.querySelector('.hd-product-list__inventory > div:last-child p:last-child')?.textContent || '';
        const normalized = value.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
        return Number(normalized);
      });
      return {
        rowCount: rows.length,
        remainingQuantities,
        emptyMessage: list.textContent?.trim() || '',
      };
    });
    if (inventoryState.rowCount === 0) {
      assert.match(inventoryState.emptyMessage, /Chưa có sản phẩm còn tồn kho/, `${viewport.name}: empty inventory must explain that no stock remains`);
    } else {
      assert(inventoryState.remainingQuantities.every(quantity => quantity > 0), `${viewport.name}: inventory tab must show only products with remaining stock`);
    }

    await page.getByRole('tab', { name: 'Nhóm hàng', exact: true }).click();
    await page.locator('.hd-product-groups').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await page.getByText('Tạo nhóm hàng', { exact: true }).count(), 0, `${viewport.name}: group management must not show the legacy creation panel`);
    const addGroupButton = page.getByRole('button', { name: 'Thêm nhóm hàng', exact: true });
    assert.equal(await addGroupButton.count(), 1, `${viewport.name}: group list must provide a single inline add button`);
    await addGroupButton.click();
    await page.getByLabel('Tên nhóm hàng mới', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('tab', { name: 'Sản phẩm', exact: true }).click();
    await page.locator('.hd-product-list').waitFor({ state: 'visible', timeout: 10000 });

    await page.getByRole('button', { name: 'Thêm sản phẩm', exact: true }).click();
    await page.locator('.hd-product-editor').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(350);
    await page.getByLabel('Tên sản phẩm', { exact: true }).fill('Sản phẩm mẫu');
    await page.getByLabel('Giá bán', { exact: true }).fill('40000');

    const formStructure = await page.locator('.hd-product-editor__body').evaluate((body) => {
      const getRow = (name) => body.querySelector(`.hd-product-editor__row--${name}`);
      const rowColumns = (name) => {
        const row = getRow(name);
        return row ? getComputedStyle(row).gridTemplateColumns : '';
      };
      const pairWidths = (name) => {
        const row = getRow(name);
        if (!row) return [];
        return Array.from(row.querySelectorAll(':scope > .hd-product-editor__field, :scope > .hd-product-editor__scan-button, :scope > .hd-product-editor__image-picker'))
          .map(element => element.getBoundingClientRect().width);
      };
      const fieldHeights = Array.from(body.querySelectorAll('.hd-product-editor__field, .hd-product-editor__scan-button, .hd-product-editor__image-picker'))
        .map(element => element.getBoundingClientRect().height);
      return {
        barcodeHasScanAction: Boolean(getRow('barcode')?.querySelector('.hd-product-editor__scan-button')),
        scanButtonBorderStyle: getRow('barcode')?.querySelector('.hd-product-editor__scan-button')
          ? getComputedStyle(getRow('barcode').querySelector('.hd-product-editor__scan-button')).borderStyle
          : '',
        barcodeColumns: rowColumns('barcode'),
        imagePickerSharesNameRow: Boolean(getRow('name-image')?.querySelector('.hd-product-editor__image-picker')),
        shortCategoryColumns: rowColumns('short-category'),
        unitAttributesColumns: rowColumns('unit-attributes'),
        priceColumns: rowColumns('prices'),
        floatingFieldCount: body.querySelectorAll('.hd-product-editor__field > .hd-product-editor__field-control > .hd-product-editor__field-label').length,
        outsideFieldLabels: body.querySelectorAll('.hd-product-editor__row > div > label').length,
        placeholderCount: body.querySelectorAll('input[placeholder]').length,
        pairWidths: ['barcode', 'name-image', 'short-category', 'unit-attributes', 'prices', 'inventory'].map(pairWidths),
        fieldHeights,
        pairedLabelTopDeltas: ['short-category', 'unit-attributes', 'prices', 'inventory'].map(name => {
          const labels = Array.from(getRow(name)?.querySelectorAll(':scope > .hd-product-editor__field .hd-product-editor__field-label') || []);
          return labels.length === 2 ? Math.abs(labels[0].getBoundingClientRect().top - labels[1].getBoundingClientRect().top) : 0;
        }),
        titleTypography: (() => {
          const title = document.querySelector('.hd-product-editor__header h3');
          if (!title) return {};
          const style = getComputedStyle(title);
          return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, letterSpacing: style.letterSpacing };
        })(),
        labelTypography: (() => {
          const label = body.querySelector('.hd-product-editor__field-label');
          if (!label) return {};
          const style = getComputedStyle(label);
          return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, letterSpacing: style.letterSpacing };
        })(),
        inputTypography: (() => {
          const input = body.querySelector('.hd-product-editor__field-input');
          if (!input) return {};
          const style = getComputedStyle(input);
          return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color, letterSpacing: style.letterSpacing };
        })(),
        allInputTypography: Array.from(body.querySelectorAll('.hd-product-editor__field-input')).map(input => {
          const style = getComputedStyle(input);
          return { fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
        }),
        enteredName: body.querySelector('input[aria-label="Tên sản phẩm"]')?.value || '',
        enteredPrice: body.querySelector('input[aria-label="Giá bán"]')?.value || '',
        hasDiscountPromotion: body.textContent?.includes('Giảm giá / khuyến mãi') || false,
        hasCameraCaptureInput: Boolean(body.querySelector('input[capture]')),
      };
    });

    assert(formStructure.barcodeHasScanAction, `${viewport.name}: barcode must share a row with Quét ảnh/QR`);
    assert.equal(formStructure.scanButtonBorderStyle, 'solid', `${viewport.name}: scan action must use the same visible field frame`);
    assert.notEqual(formStructure.barcodeColumns, 'none', `${viewport.name}: barcode row must be a grid`);
    assert(formStructure.imagePickerSharesNameRow, `${viewport.name}: image picker must share the product-name row`);
    assert.notEqual(formStructure.shortCategoryColumns, 'none', `${viewport.name}: short name and group must share a row`);
    assert.notEqual(formStructure.unitAttributesColumns, 'none', `${viewport.name}: unit and attributes must share a row`);
    assert.notEqual(formStructure.priceColumns, 'none', `${viewport.name}: cost and sale prices must share a row`);
    assert(formStructure.floatingFieldCount >= 9, `${viewport.name}: compact field titles must render inside inputs`);
    assert.equal(formStructure.outsideFieldLabels, 0, `${viewport.name}: field titles must not consume a separate row`);
    assert.equal(formStructure.placeholderCount, 0, `${viewport.name}: compact fields must not repeat descriptions as placeholders`);
    for (const widths of formStructure.pairWidths) {
      if (widths.length !== 2) continue;
      assert(Math.abs(widths[0] - widths[1]) <= 1, `${viewport.name}: every paired field must have equal width`);
    }
    assert(Math.max(...formStructure.fieldHeights) - Math.min(...formStructure.fieldHeights) <= 1, `${viewport.name}: every field must have equal height`);
    assert(formStructure.pairedLabelTopDeltas.every(delta => delta <= 1), `${viewport.name}: paired field labels must share the same baseline`);
    assert.equal(formStructure.titleTypography.fontSize, '24px', `${viewport.name}: editor title must use the recommended 24px mobile heading size`);
    assert.match(formStructure.titleTypography.fontFamily, /Times New Roman|Liberation Serif|Georgia|serif/i, `${viewport.name}: editor title must use the approved serif heading stack`);
    assert.equal(formStructure.titleTypography.color, 'rgb(196, 122, 74)', `${viewport.name}: editor title must use the readable platinum-orange heading color`);
    assert(['normal', '0px'].includes(formStructure.titleTypography.letterSpacing), `${viewport.name}: editor title must not use negative letter spacing`);
    assert.equal(formStructure.labelTypography.fontSize, '13px', `${viewport.name}: compact field titles must use the selected 13px size`);
    assert.match(formStructure.labelTypography.fontFamily, /Inter|sans-serif/i, `${viewport.name}: field captions must use the product body sans-serif stack`);
    assert(['normal', '0px'].includes(formStructure.labelTypography.letterSpacing), `${viewport.name}: field captions must not use negative letter spacing`);
    assert.equal(formStructure.inputTypography.fontSize, formStructure.labelTypography.fontSize, `${viewport.name}: field values and field titles must use the same size`);
    assert.equal(formStructure.inputTypography.fontFamily, formStructure.labelTypography.fontFamily, `${viewport.name}: field values and field titles must use the same font`);
    assert.equal(formStructure.inputTypography.fontWeight, formStructure.labelTypography.fontWeight, `${viewport.name}: field values and field titles must use the same weight`);
    assert.match(formStructure.inputTypography.fontFamily, /Inter|sans-serif/i, `${viewport.name}: field values must use the product body sans-serif stack`);
    assert.equal(formStructure.inputTypography.color, 'rgb(17, 17, 17)', `${viewport.name}: field values must use clean black text`);
    assert(['normal', '0px'].includes(formStructure.inputTypography.letterSpacing), `${viewport.name}: field values must not use negative letter spacing`);
    assert(formStructure.allInputTypography.every(style => style.fontSize === formStructure.labelTypography.fontSize), `${viewport.name}: every text and numeric input must match the field-title size`);
    assert(formStructure.allInputTypography.every(style => style.fontFamily === formStructure.labelTypography.fontFamily), `${viewport.name}: every text and numeric input must match the field-title font`);
    assert(formStructure.allInputTypography.every(style => style.fontWeight === formStructure.labelTypography.fontWeight), `${viewport.name}: every text and numeric input must match the field-title weight`);
    assert(formStructure.allInputTypography.every(style => style.color === 'rgb(17, 17, 17)'), `${viewport.name}: every text and numeric input must render in black`);
    assert.equal(formStructure.enteredName, 'Sản Phẩm Mẫu', `${viewport.name}: entered product text must render in the tested field`);
    assert.equal(formStructure.enteredPrice, '40.000', `${viewport.name}: entered product price must render with its formatted numeric value`);
    assert.equal(formStructure.hasDiscountPromotion, false, `${viewport.name}: discount/promotion field must not be shown`);
    assert.equal(formStructure.hasCameraCaptureInput, false, `${viewport.name}: product barcode scan must not expose camera capture`);
    assert.equal(await page.locator('.hd-product-editor').getByRole('button', { name: /chụp/i }).count(), 0, `${viewport.name}: product editor must not show a capture button`);

    const layout = await page.locator('.hd-product-editor').evaluate((editor) => {
      const header = editor.querySelector('.hd-product-editor__header');
      const actions = editor.querySelector('.hd-product-editor__actions');
      const layer = editor.closest('.hd-product-editor-layer');
      const editorRect = editor.getBoundingClientRect();
      const actionRect = actions?.getBoundingClientRect();
      const layerRect = layer?.getBoundingClientRect();
      const editorStyle = getComputedStyle(editor);
      const topElement = document.elementFromPoint(window.innerWidth / 2, 24);
      const bottomElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 20);
      const ancestors = [];
      let node = layer?.parentElement;
      while (node) {
        const style = getComputedStyle(node);
        ancestors.push({
          tag: node.tagName,
          className: `${node.className || ''}`.slice(0, 180),
          contain: style.contain,
          transform: style.transform,
          position: style.position,
          overflow: style.overflow,
        });
        node = node.parentElement;
      }
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        editorLeft: editorRect.left,
        editorTop: editorRect.top,
        editorRight: editorRect.right,
        editorBottom: editorRect.bottom,
        layerTop: layerRect?.top || 0,
        layerBottom: layerRect?.bottom || 0,
        scrollY: window.scrollY,
        actionsBottom: actionRect?.bottom || 0,
        headerBackground: header ? getComputedStyle(header).backgroundColor : '',
        editorTransform: editorStyle.transform,
        editorAnimationName: editorStyle.animationName,
        editorAnimationPlayState: editorStyle.animationPlayState,
        actionVisible: Boolean(actionRect && actionRect.height > 0),
        headerTitle: header?.querySelector('h3')?.textContent?.trim() || '',
        editorOwnsTopEdge: topElement?.closest('.hd-product-editor') === editor,
        editorOwnsBottomEdge: bottomElement?.closest('.hd-product-editor') === editor,
        ancestors,
      };
    });
    console.log(`${viewport.name} layout`, layout);

    assert.equal(layout.documentScrollWidth, layout.viewportWidth, `${viewport.name}: editor must not overflow horizontally`);
    assert(layout.editorLeft >= 0 && layout.editorRight <= layout.viewportWidth + 1, `${viewport.name}: editor must remain inside viewport`);
    assert(layout.editorBottom <= layout.viewportHeight + 1, `${viewport.name}: editor must remain inside viewport height`);
    assert(layout.actionVisible && layout.actionsBottom <= layout.viewportHeight + 1, `${viewport.name}: save actions must remain visible`);
    assert.equal(layout.headerBackground, 'rgb(255, 255, 255)', `${viewport.name}: product editor header must use a clean white surface`);
    assert.equal(layout.headerTitle, 'Tạo sản phẩm', `${viewport.name}: editor title must stay visible`);
    if (viewport.name === 'mobile') {
      assert(layout.editorOwnsTopEdge, 'mobile: product editor must cover the app header');
      assert(layout.editorOwnsBottomEdge, 'mobile: product editor actions must cover the bottom navigation');
    }
    assert.deepEqual(pageErrors, [], `${viewport.name}: product editor must render without page errors`);

    await page.screenshot({ path: `${outputDir}/${viewport.name}.png`, fullPage: false });

    await page.locator('.hd-product-editor').getByRole('button', { name: 'Quay lại', exact: true }).click();
    await page.locator('.hd-product-editor').waitFor({ state: 'hidden', timeout: 10000 });
    await page.locator('.hd-product-list__primary').first().click();
    await page.locator('.hd-product-editor').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(350);
    const editTitle = page.locator('.hd-product-editor__header h3');
    assert.equal((await editTitle.textContent())?.trim(), 'Sửa sản phẩm', `${viewport.name}: existing products must reuse the redesigned editor`);
    assert.equal(await editTitle.evaluate(element => getComputedStyle(element).fontSize), '24px', `${viewport.name}: edit mode must preserve the same title typography`);
    assert.equal(await page.locator('.hd-product-editor__field').first().evaluate(element => element.getBoundingClientRect().height), 64, `${viewport.name}: edit mode must preserve equal 64px controls`);
    await page.screenshot({ path: `${outputDir}/${viewport.name}-edit.png`, fullPage: false });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('PASS product editor visual QA: create/edit typography, equal controls, aligned fields, fixed actions.');
