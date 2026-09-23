import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_CUSTOMER_CREATE_URL || 'http://127.0.0.1:5179/';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outputDir = process.env.HD_MANAGER_CUSTOMER_CREATE_OUTPUT || 'test-results/customer-create';
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
      await page.getByRole('button', { name: 'Khách hàng', exact: true }).click();
    } else {
      await page.locator('[data-hd-navigation="sidebar"]').getByRole('button', { name: 'Khách hàng', exact: true }).click();
    }

    await page.locator('.premium-customer-module').waitFor({ state: 'visible', timeout: 10000 });
    const appHeader = page.locator('.hd-app-header');
    const headerSearchButton = appHeader.getByRole('button', { name: 'Tìm kiếm', exact: true });
    const headerFilterButton = appHeader.getByRole('button', { name: 'Bộ lọc', exact: true });
    assert.equal(await appHeader.getByRole('button', { name: 'Thông báo', exact: true }).count(), 0, `${viewport.name}: customer header must not show the notification bell`);
    const headerActionBorders = await Promise.all([
      headerSearchButton.evaluate(element => getComputedStyle(element).borderTopWidth),
      headerFilterButton.evaluate(element => getComputedStyle(element).borderTopWidth),
    ]);
    assert.deepEqual(headerActionBorders, ['0px', '0px'], `${viewport.name}: search and filter header actions must be borderless`);
    await headerSearchButton.click();
    const inlineHeaderSearch = appHeader.locator('.hd-header-search-input');
    await inlineHeaderSearch.waitFor({ state: 'visible', timeout: 5000 });
    await inlineHeaderSearch.focus();
    const focusedSearchFrame = await inlineHeaderSearch.evaluate(input => {
      const inputStyle = getComputedStyle(input);
      const surfaceStyle = getComputedStyle(input.parentElement);
      return {
        inputBorderColor: inputStyle.borderTopColor,
        inputOutline: inputStyle.outlineStyle,
        inputShadow: inputStyle.boxShadow,
        surfaceBorderColor: surfaceStyle.borderTopColor,
        surfaceShadow: surfaceStyle.boxShadow,
      };
    });
    assert.equal(focusedSearchFrame.inputBorderColor, 'rgba(0, 0, 0, 0)', `${viewport.name}: focused search input must not gain a border`);
    assert.equal(focusedSearchFrame.inputOutline, 'none', `${viewport.name}: focused search input must not gain an outline`);
    assert.equal(focusedSearchFrame.inputShadow, 'none', `${viewport.name}: focused search input must not gain a shadow`);
    assert.equal(focusedSearchFrame.surfaceBorderColor, 'rgba(0, 0, 0, 0)', `${viewport.name}: focused search surface must not gain a border`);
    assert.equal(focusedSearchFrame.surfaceShadow, 'none', `${viewport.name}: focused search surface must not gain a shadow`);
    assert.equal(await page.locator('.hd-enterprise-app-shell').getAttribute('data-hd-input-focus-mode'), 'pointer', `${viewport.name}: search clicked by pointer must use the quiet focus mode`);
    await page.screenshot({ path: `${outputDir}/search-focus-${viewport.name}.png`, fullPage: false });
    await appHeader.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
    await headerSearchButton.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await inlineHeaderSearch.waitFor({ state: 'visible', timeout: 5000 });
    const keyboardSearchOutline = await inlineHeaderSearch.evaluate(input => {
      const style = getComputedStyle(input.parentElement);
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    });
    assert.deepEqual(
      [keyboardSearchOutline.width, keyboardSearchOutline.style],
      ['2px', 'solid'],
      `${viewport.name}: keyboard-focused search must retain a visible accessible outline`,
    );
    assert.notEqual(keyboardSearchOutline.color, 'rgba(0, 0, 0, 0)', `${viewport.name}: keyboard focus outline must remain perceptible`);
    await page.screenshot({ path: `${outputDir}/search-keyboard-focus-${viewport.name}.png`, fullPage: false });
    await appHeader.getByRole('button', { name: 'Xóa tìm kiếm', exact: true }).click();
    assert.equal(await page.locator('[data-customer-summary="true"]').count(), 1, `${viewport.name}: customer summary must be visible before filtering`);
    const customerSummary = page.locator('[data-customer-summary="true"]');
    const summaryLayout = await customerSummary.evaluate((summary) => {
      const cards = Array.from(summary.querySelectorAll('.hd-ds-card--kpi'));
      const centerDelta = element => {
        const rect = element.getBoundingClientRect();
        const parent = element.parentElement.getBoundingClientRect();
        return Math.abs((rect.left + rect.width / 2) - (parent.left + parent.width / 2));
      };
      return {
        columns: getComputedStyle(summary).gridTemplateColumns.split(' ').length,
        backgroundImage: getComputedStyle(summary).backgroundImage,
        cards: cards.map((card) => {
          const style = getComputedStyle(card);
          const label = card.querySelector('.hd-ds-card__eyebrow');
          const value = card.querySelector('.hd-ds-card__value');
          return {
            label: label?.textContent?.trim(),
            labelSize: getComputedStyle(label).fontSize,
            valueSize: getComputedStyle(value).fontSize,
            textAlign: style.textAlign,
            backgroundImage: style.backgroundImage,
            borderWidth: style.borderTopWidth,
            valueCenterDelta: centerDelta(value),
            valueFits: value.scrollWidth <= value.clientWidth + 1,
          };
        }),
        debtWidth: cards[2]?.getBoundingClientRect().width || 0,
        summaryWidth: summary.getBoundingClientRect().width,
      };
    });
    assert.equal(summaryLayout.backgroundImage, 'none', `${viewport.name}: summary must not use a decorative gradient`);
    assert.equal(summaryLayout.cards.length, 3, `${viewport.name}: all three permitted customer metrics must render as shared KPI cards`);
    assert.deepEqual(summaryLayout.cards.map(card => card.label), ['Doanh thu', 'Đơn hàng', 'Công nợ'], `${viewport.name}: KPI labels must preserve metric order`);
    assert.equal(summaryLayout.columns, viewport.width < 640 ? 2 : 3, `${viewport.name}: customer KPIs must use a compact responsive grid`);
    assert.equal(summaryLayout.cards[2].backgroundImage, 'none', `${viewport.name}: KPI cards must use the neutral shared surface`);
    assert(summaryLayout.cards.every(card => card.labelSize === '13px' && card.valueSize === '16px'), `${viewport.name}: KPI typography must use design-system label and small-KPI tokens`);
    assert(summaryLayout.cards.every(card => card.textAlign === 'center' && card.valueCenterDelta <= 1 && card.valueFits), `${viewport.name}: KPI values must stay centered and fit without overflow`);
    assert(summaryLayout.cards.every(card => Number.parseFloat(card.borderWidth) > 0), `${viewport.name}: KPI cards must retain the shared surface border`);
    if (viewport.width < 640) {
      assert(Math.abs(summaryLayout.debtWidth - summaryLayout.summaryWidth) <= 1, `${viewport.name}: the third KPI must span the mobile grid width`);
    }

    const firstCustomerCard = page.locator('[data-customer-card="true"]').first();
    const customerCardLayout = await firstCustomerCard.evaluate((card) => {
      const identity = card.querySelector('.hd-customer-card__identity-row');
      const avatar = card.querySelector('.hd-customer-card__avatar');
      const name = card.querySelector('.hd-customer-card__name');
      const manager = card.querySelector('.hd-customer-card__manager');
      const chevron = card.querySelector('.hd-customer-card__chevron');
      const contact = card.querySelector('.hd-customer-card__contact-row');
      const stats = card.querySelector('.hd-customer-card__stats-row');
      const rect = element => element?.getBoundingClientRect();
      const centerY = element => (rect(element)?.top || 0) + ((rect(element)?.height || 0) / 2);
      const centerX = element => (rect(element)?.left || 0) + ((rect(element)?.width || 0) / 2);
      const cardStyle = getComputedStyle(card);
      const expectedLeft = (rect(card)?.left || 0) + Number.parseFloat(cardStyle.paddingLeft);
      const expectedRight = (rect(card)?.right || 0) - Number.parseFloat(cardStyle.paddingRight);
      const identityItems = [name, manager, chevron];
      const identityGaps = identityItems.slice(1).map((item, index) => (rect(item)?.left || 0) - (rect(identityItems[index])?.right || 0));
      const statCenters = Array.from(stats?.children || []).map(item => {
        const value = item.querySelectorAll('p')[1];
        return Math.abs(centerX(value) - centerX(item));
      });
      return {
        hasAvatar: Boolean(avatar),
        identityCenterDeltas: [name, manager].map(element => Math.abs(centerY(element) - centerY(identity))),
        identityGapRange: Math.max(...identityGaps) - Math.min(...identityGaps),
        contactItemCount: contact?.children.length || 0,
        statsItemCount: stats?.children.length || 0,
        statLabels: Array.from(stats?.children || []).map(item => item.querySelector('p')?.textContent?.trim() || ''),
        rowOrder: [rect(identity)?.top || 0, rect(contact)?.top || 0, rect(stats)?.top || 0],
        rowGaps: [
          (rect(contact)?.top || 0) - (rect(identity)?.bottom || 0),
          (rect(stats)?.top || 0) - (rect(contact)?.bottom || 0),
        ],
        statCenters,
        contactLeftDelta: Math.abs((rect(contact)?.left || 0) - expectedLeft),
        contactRightDelta: Math.abs((rect(contact)?.right || 0) - expectedRight),
        statsLeftDelta: Math.abs((rect(stats)?.left || 0) - expectedLeft),
        statsRightDelta: Math.abs((rect(stats)?.right || 0) - expectedRight),
      };
    });
    assert.equal(customerCardLayout.hasAvatar, false, `${viewport.name}: customer cards must not render an avatar`);
    assert(customerCardLayout.identityCenterDeltas.every(delta => delta <= 1), `${viewport.name}: customer name and sales owner must share one aligned row`);
    assert(customerCardLayout.identityGapRange <= 1, `${viewport.name}: customer name, sales owner and disclosure must use equal horizontal spacing`);
    assert.equal(customerCardLayout.contactItemCount, 2, `${viewport.name}: phone and address must share the second row`);
    assert.equal(customerCardLayout.statsItemCount, 3, `${viewport.name}: revenue, orders and debt must share the third row`);
    assert.deepEqual(customerCardLayout.statLabels, ['DT', 'Đơn hàng', 'Còn nợ'], `${viewport.name}: customer totals must use the requested order`);
    assert(customerCardLayout.rowOrder[0] < customerCardLayout.rowOrder[1] && customerCardLayout.rowOrder[1] < customerCardLayout.rowOrder[2], `${viewport.name}: customer-card rows must keep identity, contact and totals order`);
    assert(Math.abs(customerCardLayout.rowGaps[0] - customerCardLayout.rowGaps[1]) <= 1, `${viewport.name}: customer-card rows must use equal vertical spacing`);
    assert(customerCardLayout.statCenters.every(delta => delta <= 1), `${viewport.name}: revenue, order and debt values must be horizontally centered`);
    assert(customerCardLayout.contactLeftDelta <= 1 && customerCardLayout.contactRightDelta <= 1, `${viewport.name}: contact row must use the full card width without avatar indentation`);
    assert(customerCardLayout.statsLeftDelta <= 1 && customerCardLayout.statsRightDelta <= 1, `${viewport.name}: totals row must use the full card width without avatar indentation`);
    await page.screenshot({ path: `${outputDir}/list-${viewport.name}.png`, fullPage: false });

    await firstCustomerCard.click();
    const customerDetail = page.locator('.premium-customer-detail');
    await customerDetail.waitFor({ state: 'visible', timeout: 10000 });
    const detailTitleStyle = await customerDetail.locator('.hd-customer-detail__title').evaluate(element => {
      const style = getComputedStyle(element);
      return { fontFamily: style.fontFamily, fontSize: style.fontSize };
    });
    const designSystemFont = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hd-font-sans').trim());
    const pageTitleSize = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--hd-type-h1').trim());
    assert.equal(detailTitleStyle.fontFamily, designSystemFont, `${viewport.name}: customer detail title must use the shared application font`);
    assert.equal(detailTitleStyle.fontSize, pageTitleSize, `${viewport.name}: customer detail title must use the shared page-title token`);
    assert.equal(await customerDetail.evaluate(element => getComputedStyle(element).fontSize), '14px', `${viewport.name}: customer detail body must use the requested 14px size`);

    await customerDetail.locator('.hd-customer-detail__title').click();
    const customerEditForm = customerDetail.locator('[data-customer-edit-form="true"]');
    await customerEditForm.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await customerEditForm.getByText('Cập nhật tên, số điện thoại, địa chỉ và nhân viên phụ trách.', { exact: true }).count(), 0, `${viewport.name}: customer edit helper copy must be removed`);
    assert.equal(await customerEditForm.locator('[data-customer-zalo-group-link-input="true"]').count(), 0, `${viewport.name}: customer edit form must not render the Zalo group link field`);
    const customerEditLayout = await customerEditForm.evaluate((form) => {
      const requiredLabels = ['Xưng hô', 'Tên khách hàng', 'Số điện thoại', 'Nhóm khách hàng', 'Địa chỉ giao hàng', 'Nhân viên phụ trách'];
      const fields = Array.from(form.querySelectorAll('.hd-customer-edit-field'));
      const labelTexts = fields.map(field => field.querySelector('.hd-customer-edit-field__label')?.textContent?.trim() || '');
      const labelsInsideFields = fields.every(field => {
        const fieldRect = field.getBoundingClientRect();
        const labelRect = field.querySelector('.hd-customer-edit-field__label')?.getBoundingClientRect();
        return labelRect && labelRect.top >= fieldRect.top && labelRect.bottom <= fieldRect.bottom;
      });
      const locationRow = form.querySelector('[data-customer-edit-row="location"]');
      const locationFields = Array.from(locationRow?.children || []);
      const locationTopDelta = locationFields.length === 2
        ? Math.abs(locationFields[0].getBoundingClientRect().top - locationFields[1].getBoundingClientRect().top)
        : 999;
      return {
        requiredLabelsPresent: requiredLabels.every(label => labelTexts.includes(label)),
        mapsLabelPresent: labelTexts.includes('Maps'),
        labelsInsideFields,
        locationFieldCount: locationFields.length,
        locationTopDelta,
      };
    });
    assert.equal(customerEditLayout.requiredLabelsPresent, true, `${viewport.name}: all requested customer edit labels must remain visible inside their fields`);
    assert.equal(customerEditLayout.mapsLabelPresent, true, `${viewport.name}: location field must use the concise Maps label`);
    assert.equal(customerEditLayout.labelsInsideFields, true, `${viewport.name}: customer edit labels must be contained inside field borders`);
    assert.equal(customerEditLayout.locationFieldCount, 2, `${viewport.name}: address and Maps must share one row`);
    assert(customerEditLayout.locationTopDelta <= 1, `${viewport.name}: address and Maps must align on the same row`);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hd-manager-screen-back', { cancelable: true, detail: { handled: false } })));
    await customerEditForm.waitFor({ state: 'hidden', timeout: 5000 });

    const openingDebtLayout = await customerDetail.locator('[data-customer-opening-debt-summary="true"]').evaluate(summary => {
      const receivable = summary.querySelector('[data-debt-side="receivable"]');
      const payable = summary.querySelector('[data-debt-side="payable"]');
      const receivableRect = receivable?.getBoundingClientRect();
      const payableRect = payable?.getBoundingClientRect();
      return {
        receivableText: receivable?.textContent?.trim() || '',
        payableText: payable?.textContent?.trim() || '',
        payableBelowReceivable: (payableRect?.top || 0) >= (receivableRect?.bottom || 0),
      };
    });
    assert.match(openingDebtLayout.receivableText, /^Khách nợ:/, `${viewport.name}: old receivable must use the requested label`);
    assert.match(openingDebtLayout.payableText, /^Công ty nợ:/, `${viewport.name}: old payable must use the requested full label`);
    assert.equal(openingDebtLayout.payableBelowReceivable, true, `${viewport.name}: Công ty nợ must appear below Khách nợ`);

    const detailProducts = customerDetail.locator('[data-customer-detail-products="true"]');
    const detailSectionsLayout = await customerDetail.evaluate((detail) => {
      const products = detail.querySelector('[data-customer-detail-products="true"]');
      const branches = detail.querySelector('[data-customer-detail-branches="true"]');
      const grid = products?.parentElement;
      const gridRect = grid?.getBoundingClientRect();
      const productsRect = products?.getBoundingClientRect();
      const branchesRect = branches?.getBoundingClientRect();
      return {
        productsWidthDelta: Math.abs((productsRect?.width || 0) - (gridRect?.width || 0)),
        branchesWidthDelta: Math.abs((branchesRect?.width || 0) - (gridRect?.width || 0)),
        branchBelowProducts: (branchesRect?.top || 0) >= (productsRect?.bottom || 0),
      };
    });
    assert(detailSectionsLayout.productsWidthDelta <= 1, `${viewport.name}: SP khach lay must occupy its own full-width row`);
    assert(detailSectionsLayout.branchesWidthDelta <= 1, `${viewport.name}: Chi nhanh must occupy its own full-width row`);
    assert.equal(detailSectionsLayout.branchBelowProducts, true, `${viewport.name}: Chi nhanh must appear on the row below SP khach lay`);
    const productSearch = detailProducts.locator('[data-customer-product-search="true"]');
    if (await productSearch.count() === 0) {
      await detailProducts.locator('.hd-customer-detail-products__toggle').click();
    }
    await productSearch.waitFor({ state: 'visible', timeout: 5000 });
    const productHeadingLayout = await detailProducts.evaluate((section) => {
      const title = section.querySelector('.hd-customer-detail-products__title');
      const search = section.querySelector('.hd-customer-detail-products__search');
      const searchInput = section.querySelector('[data-customer-product-search="true"]');
      const rect = element => element?.getBoundingClientRect();
      const centerY = element => (rect(element)?.top || 0) + ((rect(element)?.height || 0) / 2);
      return {
        centerDelta: Math.abs(centerY(title) - centerY(search)),
        searchBorder: getComputedStyle(search).borderTopWidth,
        inputBorder: getComputedStyle(searchInput).borderTopWidth,
      };
    });
    assert(productHeadingLayout.centerDelta <= 2, `${viewport.name}: SP khách lấy and search must share one aligned row`);
    assert.equal(productHeadingLayout.searchBorder, '0px', `${viewport.name}: product search wrapper must be borderless`);
    assert.equal(productHeadingLayout.inputBorder, '0px', `${viewport.name}: product search input must be borderless`);

    const productSuggestions = detailProducts.locator('[data-customer-product-suggestions="true"]');
    const suggestionLayout = await productSuggestions.evaluate((grid) => ({
      count: grid.children.length,
      limit: Number(grid.dataset.suggestionLimit || 0),
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      overflowY: getComputedStyle(grid).overflowY,
      shortNamesOnly: Array.from(grid.querySelectorAll('button')).every(button => (
        button.querySelector('.hd-customer-detail-products__suggestion-title')?.textContent?.trim()
          === button.dataset.productShortName
      )),
      usage: Array.from(grid.querySelectorAll('button')).map(button => [
        Number(button.dataset.productUsageQuantity || 0),
        Number(button.dataset.productUsageCount || 0),
        Number(button.dataset.productUsageLastTime || 0),
      ]),
    }));
    assert.equal(suggestionLayout.limit, 10, `${viewport.name}: SP khách lấy must expose a ten-product suggestion limit`);
    assert(suggestionLayout.count <= 10, `${viewport.name}: SP khách lấy must render at most ten suggestions`);
    assert.equal(suggestionLayout.columns, 2, `${viewport.name}: SP khách lấy must use two columns`);
    assert.equal(suggestionLayout.overflowY, 'visible', `${viewport.name}: SP khách lấy must not use a nested scroll area`);
    assert.equal(suggestionLayout.shortNamesOnly, true, `${viewport.name}: SP khách lấy suggestions must display the product short name`);
    assert(suggestionLayout.usage.every((tuple, index) => {
      if (index === 0) return true;
      const previous = suggestionLayout.usage[index - 1];
      return previous[0] > tuple[0]
        || (previous[0] === tuple[0] && previous[1] > tuple[1])
        || (previous[0] === tuple[0] && previous[1] === tuple[1] && previous[2] >= tuple[2]);
    }), `${viewport.name}: suggestions must be ranked by quantity, frequency and recency`);

    if (await detailProducts.locator('[data-customer-product-config="true"]').count() === 0) {
      await productSuggestions.locator('button').first().click();
    }
    const firstProductConfig = detailProducts.locator('[data-customer-product-config="true"]').first();
    await firstProductConfig.waitFor({ state: 'visible', timeout: 5000 });
    const productConfigLayout = await firstProductConfig.evaluate((config) => {
      const rect = element => element?.getBoundingClientRect();
      const rowChecks = Array.from(config.querySelectorAll('[data-config-row]')).map(row => {
        const fields = Array.from(row.children);
        return {
          count: fields.length,
          topDelta: fields.length === 2 ? Math.abs((rect(fields[0])?.top || 0) - (rect(fields[1])?.top || 0)) : 999,
        };
      });
      const fieldContainment = Array.from(config.querySelectorAll('.hd-customer-config-field')).every(field => {
        const fieldRect = rect(field);
        const labelRect = rect(field.querySelector('.hd-customer-config-field__label'));
        const controlRect = rect(field.querySelector('.hd-customer-config-field__control'));
        return labelRect && controlRect
          && labelRect.top >= fieldRect.top
          && controlRect.bottom <= fieldRect.bottom + 1;
      });
      const attributeHeader = config.querySelector('.hd-customer-product-config__attribute-header');
      const attributeTitle = attributeHeader?.querySelector('p');
      const addButton = attributeHeader?.querySelector('button');
      const centerY = element => (rect(element)?.top || 0) + ((rect(element)?.height || 0) / 2);
      return {
        rowChecks,
        fieldContainment,
        maxFieldHeight: Math.max(...Array.from(config.querySelectorAll('.hd-customer-product-config__fields .hd-customer-config-field')).map(field => rect(field)?.height || 0)),
        title: config.querySelector('.hd-customer-detail-products__product-title')?.textContent?.trim() || '',
        shortName: config.dataset.productShortName || '',
        attributeCenterDelta: Math.abs(centerY(attributeTitle) - centerY(addButton)),
      };
    });
    assert(productConfigLayout.rowChecks.every(row => row.count === 2 && row.topDelta <= 1), `${viewport.name}: size/price and pricing/order units must each share one row`);
    assert.equal(productConfigLayout.fieldContainment, true, `${viewport.name}: compact field labels and values must stay inside their field containers`);
    assert(productConfigLayout.maxFieldHeight <= 40, `${viewport.name}: size, price and unit fields must be approximately half their former height (actual ${productConfigLayout.maxFieldHeight}px)`);
    assert.equal(productConfigLayout.title, productConfigLayout.shortName, `${viewport.name}: selected customer products must use their short names`);
    assert(productConfigLayout.attributeCenterDelta <= 2, `${viewport.name}: Thuộc tính and + Thêm must share one aligned row`);
    assert.equal(await detailProducts.locator('text=Đơn vị đặt mặc định').count(), 0, `${viewport.name}: duplicate default order-unit field must be removed`);
    assert.equal(await detailProducts.locator('text=/Quy đổi sang/i').count(), 0, `${viewport.name}: conversion field must be removed`);
    assert.equal(await detailProducts.locator('text=Cùng một sản phẩm có thể thêm nhiều size, thuộc tính và giá riêng.').count(), 0, `${viewport.name}: attribute description must be removed`);
    assert.equal(await detailProducts.locator('text=Size / thuộc tính khác').count(), 0, `${viewport.name}: attribute section must use the concise title`);
    const configListOverflow = await detailProducts.locator('[data-customer-product-config-list="true"]').evaluate(element => getComputedStyle(element).overflowY);
    assert.equal(configListOverflow, 'visible', `${viewport.name}: product configuration list must not use a nested scroll area`);
    await firstProductConfig.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${outputDir}/detail-${viewport.name}.png`, fullPage: false });

    const loyaltySection = customerDetail.locator('[data-customer-loyalty-section="true"]');
    const loyaltyHeading = loyaltySection.locator('[data-customer-loyalty-heading="true"]');
    if ((await loyaltyHeading.getAttribute('aria-expanded')) !== 'true') await loyaltyHeading.click();
    await loyaltySection.locator('[data-customer-loyalty-content="true"]').waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await loyaltySection.getByText(/^(Bật riêng|Tắt riêng)$/).count(), 0, `${viewport.name}: customer loyalty must not show separate enable or disable labels`);
    assert.equal(await customerDetail.getByText('Chọn tài xế được xem công nợ của khách hàng này.', { exact: true }).count(), 0, `${viewport.name}: driver permission helper copy must be removed`);

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('hd-manager-screen-back', { cancelable: true, detail: { handled: false } })));
    await page.locator('.premium-customer-module:not(.premium-customer-detail)').waitFor({ state: 'visible', timeout: 5000 });

    if (viewport.name === 'mobile') {
      const customerFabLayout = await page.getByRole('button', { name: 'Mở thao tác khách hàng', exact: true }).evaluate((button) => {
        const footer = document.querySelector('[data-hd-navigation="bottom"]');
        const footerLayer = footer?.closest('nav') || footer;
        const buttonRect = button.getBoundingClientRect();
        const footerRect = footer?.getBoundingClientRect();
        return {
          buttonBottom: buttonRect.bottom,
          footerTop: footerRect?.top || 0,
          buttonZIndex: Number(getComputedStyle(button.parentElement).zIndex || 0),
          footerZIndex: Number(footerLayer && getComputedStyle(footerLayer).zIndex !== 'auto' ? getComputedStyle(footerLayer).zIndex : 0),
        };
      });
      assert(customerFabLayout.buttonBottom <= customerFabLayout.footerTop - 4, 'mobile: add-customer action must remain fully above the footer');
      assert(customerFabLayout.buttonZIndex > customerFabLayout.footerZIndex, 'mobile: add-customer action must paint above the footer');
    }

    await headerFilterButton.click();
    const customerFilterPanel = page.locator('[data-customer-filter-panel="true"]');
    await customerFilterPanel.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await page.locator('[data-customer-summary="true"]').count(), 0, `${viewport.name}: customer summary must yield to the filter panel`);
    const filterChipBorders = await customerFilterPanel.locator('.hd-customer-filter-chip').evaluateAll(elements => elements.map(element => getComputedStyle(element).borderTopWidth));
    assert(filterChipBorders.length >= 3 && filterChipBorders.every(width => width === '0px'), `${viewport.name}: customer filter chips must be borderless`);

    const revenueSortButton = customerFilterPanel.locator('[data-sort-direction]');
    assert.equal(await revenueSortButton.textContent().then(text => text.trim()), 'Doanh thu', `${viewport.name}: revenue filter must use the concise label`);
    await revenueSortButton.click();
    assert.equal(await revenueSortButton.getAttribute('data-sort-direction'), 'desc', `${viewport.name}: first revenue click must sort descending`);
    const descendingRevenue = await page.locator('[data-customer-card="true"]').evaluateAll(elements => elements.map(element => Number(element.dataset.customerRevenue || 0)));
    assert(descendingRevenue.every((value, index) => index === 0 || descendingRevenue[index - 1] >= value), `${viewport.name}: revenue descending order must be applied to customer cards`);
    await revenueSortButton.click();
    assert.equal(await revenueSortButton.getAttribute('data-sort-direction'), 'asc', `${viewport.name}: second revenue click must sort ascending`);
    const ascendingRevenue = await page.locator('[data-customer-card="true"]').evaluateAll(elements => elements.map(element => Number(element.dataset.customerRevenue || 0)));
    assert(ascendingRevenue.every((value, index) => index === 0 || ascendingRevenue[index - 1] <= value), `${viewport.name}: revenue ascending order must be applied to customer cards`);
    await page.screenshot({ path: `${outputDir}/filter-${viewport.name}.png`, fullPage: false });

    await headerFilterButton.click();
    await customerFilterPanel.waitFor({ state: 'hidden', timeout: 10000 });
    await page.locator('[data-customer-summary="true"]').waitFor({ state: 'visible', timeout: 10000 });
    await page.getByRole('button', { name: 'Mở thao tác khách hàng', exact: true }).click();
    await page.getByRole('button', { name: 'Tạo khách hàng', exact: true }).click();
    const createView = page.locator('.hd-customer-create-view');
    await createView.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);

    const layout = await createView.evaluate((view) => {
      const phoneRow = view.querySelector('.hd-customer-create-view__phone-row');
      const phoneInput = phoneRow?.querySelector('input');
      const contactButton = phoneRow?.querySelector('button');
      const pairRows = Array.from(view.querySelectorAll('.hd-customer-create-view__paired-row'));
      const openingBalanceHeader = view.querySelector('.hd-customer-create-view__opening-balance-header');
      const openingBalanceTitle = openingBalanceHeader?.querySelector(':scope > p');
      const debtTabs = Array.from(view.querySelectorAll('.hd-customer-create-view__debt-tabs button'));
      const debtTabList = view.querySelector('.hd-customer-create-view__debt-tabs');
      const compactField = view.querySelector('.hd-customer-create-view__compact-field');
      const compactInput = compactField?.querySelector('input, select');
      const nameInput = view.querySelector('[aria-label="Tên khách hoặc công ty"]');
      const debtLimitRow = view.querySelector('.hd-customer-create-view__debt-limit-row');
      const productSection = view.querySelector('.hd-customer-create-view__products');
      const productHeader = view.querySelector('.hd-customer-create-view__products-header');
      const productTitle = view.querySelector('.hd-customer-create-view__products-title');
      const productSearch = view.querySelector('.hd-customer-create-view__product-search');
      const productGrid = view.querySelector('.hd-customer-create-view__product-grid');
      const rect = element => element?.getBoundingClientRect();
      return {
        position: getComputedStyle(view).position,
        overlayBackground: getComputedStyle(view).backgroundColor,
        moduleChildrenVisible: Array.from(view.parentElement?.children || [])
          .filter(element => element !== view)
          .filter(element => getComputedStyle(element).display !== 'none').length,
        phoneTopDelta: Math.abs((rect(phoneInput)?.top || 0) - (rect(contactButton)?.top || 0)),
        phoneHeightDelta: Math.abs((rect(phoneInput)?.height || 0) - (rect(contactButton)?.height || 0)),
        pairWidths: pairRows.map(row => Array.from(row.children).map(element => rect(element)?.width || 0)),
        pairTopDeltas: pairRows.map(row => {
          const children = Array.from(row.children);
          return children.length === 2 ? Math.abs((rect(children[0])?.top || 0) - (rect(children[1])?.top || 0)) : 0;
        }),
        debtTabWidths: debtTabs.map(button => rect(button)?.width || 0),
        debtTabTopDelta: debtTabs.length === 2 ? Math.abs((rect(debtTabs[0])?.top || 0) - (rect(debtTabs[1])?.top || 0)) : Infinity,
        openingBalanceHeaderColumns: openingBalanceHeader ? getComputedStyle(openingBalanceHeader).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        openingBalanceHeaderCenterDelta: openingBalanceTitle && debtTabList
          ? Math.abs(((rect(openingBalanceTitle)?.top || 0) + ((rect(openingBalanceTitle)?.height || 0) / 2)) - ((rect(debtTabList)?.top || 0) + ((rect(debtTabList)?.height || 0) / 2)))
          : Infinity,
        nameInputFontSize: nameInput ? getComputedStyle(nameInput).fontSize : '',
        compactInputFontSize: compactInput ? getComputedStyle(compactInput).fontSize : '',
        compactInputColor: compactInput ? getComputedStyle(compactInput).color : '',
        compactFieldBorderTopWidth: compactField ? getComputedStyle(compactField).borderTopWidth : '',
        compactFieldBorderBottomWidth: compactField ? getComputedStyle(compactField).borderBottomWidth : '',
        compactFieldBorderRadius: compactField ? getComputedStyle(compactField).borderRadius : '',
        nameFieldBorderTopWidth: nameInput ? getComputedStyle(nameInput).borderTopWidth : '',
        nameFieldBorderBottomWidth: nameInput ? getComputedStyle(nameInput).borderBottomWidth : '',
        nameFieldBorderRadius: nameInput ? getComputedStyle(nameInput).borderRadius : '',
        hasCompactVisibleLabels: Boolean(view.querySelector('.hd-customer-create-view__compact-field > span')),
        debtLimitTitle: debtLimitRow?.querySelector('p')?.textContent?.trim() || '',
        debtLimitColumns: debtLimitRow ? getComputedStyle(debtLimitRow).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        hasHeaderEyebrow: Boolean(view.querySelector('.hd-customer-create-view__header span')),
        addressPlaceholder: view.querySelector('[aria-label="Địa chỉ giao hàng"]')?.getAttribute('placeholder') || '',
        mapsPlaceholder: view.querySelector('[aria-label="Vị trí Maps"]')?.getAttribute('placeholder') || '',
        customerGroupPlaceholder: view.querySelector('[aria-label="Nhóm khách hàng"]')?.getAttribute('placeholder') || '',
        managerEmptyOptionText: view.querySelector('[aria-label="Nhân viên phụ trách"] option[value=""]')?.textContent?.trim() || '',
        productTitle: productTitle?.textContent?.trim() || '',
        productHasLegacyDescription: view.textContent.includes('Tick sản phẩm khách thường lấy'),
        productHeaderCenterDelta: productHeader
          ? Math.abs(((rect(productTitle)?.top || 0) + ((rect(productTitle)?.height || 0) / 2)) - ((rect(productSearch)?.top || 0) + ((rect(productSearch)?.height || 0) / 2)))
          : Infinity,
        productSearchWidth: rect(productSearch)?.width || 0,
        productSearchBorderWidth: productSearch ? getComputedStyle(productSearch).borderTopWidth : '',
        productHeaderGap: productHeader ? Number.parseFloat(getComputedStyle(productHeader).columnGap) : Infinity,
        productSectionWidth: rect(productSection)?.width || 0,
        productSectionBorderWidth: productSection ? getComputedStyle(productSection).borderTopWidth : '',
        productSectionBackground: productSection ? getComputedStyle(productSection).backgroundColor : '',
        productGridColumns: productGrid ? getComputedStyle(productGrid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        productSuggestionLimit: Number(productGrid?.getAttribute('data-suggestion-limit') || 0),
        productSuggestionCount: productGrid?.querySelectorAll(':scope > button').length || 0,
        productSuggestionUsage: Array.from(productGrid?.querySelectorAll(':scope > button') || []).map(button => ([
          Number(button.getAttribute('data-product-usage-quantity') || 0),
          Number(button.getAttribute('data-product-usage-count') || 0),
          Number(button.getAttribute('data-product-usage-last-time') || 0),
        ])),
        productGridOverflowY: productGrid ? getComputedStyle(productGrid).overflowY : '',
        productGridMaxHeight: productGrid ? getComputedStyle(productGrid).maxHeight : '',
        hasZaloGroupField: Boolean(view.querySelector('input[placeholder*="Zalo"]')),
        heading: view.querySelector('.hd-customer-create-view__header h3')?.textContent?.trim() || '',
      };
    });

    assert.notEqual(layout.position, 'fixed', `${viewport.name}: customer creation must be a child view, not a fixed modal`);
    assert.equal(layout.overlayBackground, 'rgba(0, 0, 0, 0)', `${viewport.name}: child view must not add a dark modal overlay`);
    assert.equal(layout.moduleChildrenVisible, 0, `${viewport.name}: customer list content must yield to the child view`);
    const floatingQuickAction = page.locator('.hd-floating-quick-action');
    assert.equal(await floatingQuickAction.count(), 0, `${viewport.name}: customer module must use its own actions without a duplicate global FAB`);
    assert.equal(layout.heading, 'Tạo khách hàng', `${viewport.name}: child view must expose a clear title`);
    assert(layout.phoneTopDelta <= 1 && layout.phoneHeightDelta <= 1, `${viewport.name}: phone and contact picker must share one aligned row`);
    assert.equal(layout.hasZaloGroupField, false, `${viewport.name}: customer creation must not show the Zalo group field`);
    assert(layout.pairWidths.length >= 2, `${viewport.name}: address/maps and group/manager pairs must exist`);
    assert(layout.pairWidths.slice(0, 2).every(widths => widths.length === 2 && Math.abs(widths[0] - widths[1]) <= 1), `${viewport.name}: requested field pairs must use equal columns`);
    assert(layout.pairTopDeltas.slice(0, 2).every(delta => delta <= 1), `${viewport.name}: requested field pairs must be vertically aligned`);
    assert.equal(layout.debtTabWidths.length, 2, `${viewport.name}: opening balance must expose exactly two choices`);
    assert(Math.abs(layout.debtTabWidths[0] - layout.debtTabWidths[1]) <= 1 && layout.debtTabTopDelta <= 1, `${viewport.name}: debt choices must share one equal row`);
    assert.equal(layout.openingBalanceHeaderColumns, 2, `${viewport.name}: debt title and two-choice control must share one row`);
    assert(layout.openingBalanceHeaderCenterDelta <= 1, `${viewport.name}: debt title and two-choice control must be vertically aligned`);
    assert.equal(layout.compactInputFontSize, layout.nameInputFontSize, `${viewport.name}: compact placeholders and customer-name text must use the same font size`);
    assert.equal(layout.compactInputColor, 'rgb(17, 17, 17)', `${viewport.name}: entered field values must use black text`);
    assert.equal(layout.hasCompactVisibleLabels, false, `${viewport.name}: compact fields must use centered placeholders instead of separate labels`);
    assert.equal(layout.compactFieldBorderTopWidth, '0px', `${viewport.name}: compact fields must not use a closed top border`);
    assert.equal(layout.compactFieldBorderBottomWidth, '1px', `${viewport.name}: compact fields must keep the reference bottom divider`);
    assert.equal(layout.compactFieldBorderRadius, '0px', `${viewport.name}: compact fields must use straight divider rows`);
    assert.equal(layout.nameFieldBorderTopWidth, '0px', `${viewport.name}: customer-name field must not use a closed top border`);
    assert.equal(layout.nameFieldBorderBottomWidth, '1px', `${viewport.name}: customer-name field must keep the reference bottom divider`);
    assert.equal(layout.nameFieldBorderRadius, '0px', `${viewport.name}: customer-name field must use a straight divider row`);
    assert.equal(layout.debtLimitTitle, 'Hạn mức nợ', `${viewport.name}: debt limit must use the compact title`);
    assert.equal(layout.debtLimitColumns, 2, `${viewport.name}: debt-limit title and selector must share one row`);
    assert.equal(layout.hasHeaderEyebrow, false, `${viewport.name}: customer child-view header must not repeat the customer label`);
    assert.equal(layout.addressPlaceholder, 'Địa chỉ giao hàng', `${viewport.name}: address title must be a centered faint placeholder`);
    assert.equal(layout.mapsPlaceholder, 'Maps', `${viewport.name}: Maps title must be a centered faint placeholder`);
    assert.equal(layout.customerGroupPlaceholder, 'Nhóm KH', `${viewport.name}: customer-group title must be a centered faint placeholder`);
    assert.equal(layout.managerEmptyOptionText, 'NV phụ trách', `${viewport.name}: manager title must be the empty select prompt`);
    assert.equal(layout.productTitle, 'SP khách lấy', `${viewport.name}: fixed products must use the requested title`);
    assert.equal(layout.productHasLegacyDescription, false, `${viewport.name}: fixed-product helper paragraph must be removed`);
    assert(layout.productHeaderCenterDelta <= 1, `${viewport.name}: product title and search must share one row`);
    assert(layout.productSearchWidth < layout.productSectionWidth, `${viewport.name}: product search must be narrower than its section`);
    assert.equal(layout.productSearchBorderWidth, '0px', `${viewport.name}: product search must be borderless`);
    assert(layout.productHeaderGap <= 8, `${viewport.name}: product title and search must use compact spacing`);
    assert.equal(layout.productSectionBorderWidth, '0px', `${viewport.name}: product list must not be wrapped in a bordered box`);
    assert.equal(layout.productSectionBackground, 'rgba(0, 0, 0, 0)', `${viewport.name}: product list must not be wrapped in a tinted box`);
    assert.equal(layout.productGridColumns, 2, `${viewport.name}: customer products must render in two columns`);
    assert.equal(layout.productSuggestionLimit, 10, `${viewport.name}: customer product suggestions must be limited to ten items`);
    assert(layout.productSuggestionCount <= 10, `${viewport.name}: customer product suggestions must not exceed two columns of five items`);
    assert(layout.productSuggestionUsage.every((usage, index, list) => {
      if (index === 0) return true;
      const previous = list[index - 1];
      if (previous[0] !== usage[0]) return previous[0] >= usage[0];
      if (previous[1] !== usage[1]) return previous[1] >= usage[1];
      return previous[2] >= usage[2];
    }), `${viewport.name}: suggested products must be ordered by real usage`);
    assert.equal(layout.productGridOverflowY, 'visible', `${viewport.name}: customer product list must not create a nested scrollbar`);
    assert.equal(layout.productGridMaxHeight, 'none', `${viewport.name}: customer product list must expand with its content`);

    const groupInput = createView.getByLabel('Nhóm khách hàng', { exact: true });
    await groupInput.focus();
    const focusStyle = await groupInput.evaluate(element => ({
      outlineWidth: getComputedStyle(element).outlineWidth,
      boxShadow: getComputedStyle(element).boxShadow,
    }));
    assert.equal(focusStyle.outlineWidth, '0px', `${viewport.name}: focused fields must not show an outline`);
    assert.equal(focusStyle.boxShadow, 'none', `${viewport.name}: focused fields must not show a focus ring`);

    await createView.getByRole('button', { name: 'Lấy từ danh bạ điện thoại', exact: true }).click();
    assert.equal(
      await createView.getByText('Thiết bị này chưa hỗ trợ chọn danh bạ', { exact: true }).count(),
      1,
      `${viewport.name}: unsupported contact picker must show only the requested message`,
    );

    await page.getByLabel('Số tiền khách nợ công ty', { exact: true }).fill('125000');
    await page.getByLabel('Ghi chú khách nợ công ty', { exact: true }).fill('Nợ đầu kỳ');
    await page.getByRole('tab', { name: 'Công ty nợ', exact: true }).click();
    await page.getByLabel('Số tiền công ty nợ khách', { exact: true }).fill('75000');
    await page.getByLabel('Ghi chú công ty nợ khách', { exact: true }).fill('Mua hàng đầu kỳ');
    await page.getByRole('tab', { name: 'Khách nợ', exact: true }).click();
    assert.equal(await page.getByLabel('Số tiền khách nợ công ty', { exact: true }).inputValue(), '125.000', `${viewport.name}: switching debt side must preserve receivable amount`);
    assert.equal(await page.getByLabel('Ghi chú khách nợ công ty', { exact: true }).inputValue(), 'Nợ đầu kỳ', `${viewport.name}: switching debt side must preserve receivable note`);
    await page.getByRole('tab', { name: 'Công ty nợ', exact: true }).click();
    assert.equal(await page.getByLabel('Số tiền công ty nợ khách', { exact: true }).inputValue(), '75.000', `${viewport.name}: switching debt side must preserve payable amount`);
    assert.equal(await page.getByLabel('Ghi chú công ty nợ khách', { exact: true }).inputValue(), 'Mua hàng đầu kỳ', `${viewport.name}: switching debt side must preserve payable note`);

    assert.equal(await createView.getByRole('button', { name: 'Lấy từ danh bạ điện thoại', exact: true }).count(), 1, `${viewport.name}: compact contact picker must remain available`);
    assert.equal(await createView.getByLabel('Địa chỉ giao hàng', { exact: true }).count(), 1, `${viewport.name}: address field must remain available`);
    assert.equal(await createView.getByLabel('Vị trí Maps', { exact: true }).count(), 1, `${viewport.name}: Maps field must remain available`);
    assert.equal(await createView.getByLabel('Nhóm khách hàng', { exact: true }).count(), 1, `${viewport.name}: customer-group field must remain available`);
    assert.equal(await createView.getByLabel('Nhân viên phụ trách', { exact: true }).count(), 1, `${viewport.name}: manager selector must remain available`);
    assert.deepEqual(pageErrors, [], `${viewport.name}: customer child view must render without page errors`);

    await page.screenshot({ path: `${outputDir}/${viewport.name}.png`, fullPage: false });
    await createView.getByRole('button', { name: 'Quay lại danh sách khách hàng', exact: true }).click();
    await createView.waitFor({ state: 'hidden', timeout: 10000 });
    await page.locator('.premium-customer-module').waitFor({ state: 'visible', timeout: 10000 });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log('PASS customer creation child-view QA: compact fields, debt switch, contact fallback and two-column products.');
