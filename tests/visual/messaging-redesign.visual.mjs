import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseUrl = process.env.HD_MANAGER_VISUAL_QA_URL || 'http://127.0.0.1:5201/';
const outputDir = process.env.HD_MANAGER_MESSAGING_VISUAL_OUTPUT || 'test-results/messaging-redesign';
const browserPath = process.env.HD_MANAGER_VISUAL_QA_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const companyId = 'comp_preview';
const employeeId = 'emp_admin';
const claims = {
  uid: employeeId, identityId: employeeId, appUserId: employeeId, companyId,
  companyName: 'Công ty HD Preview', accountType: 'employee', role: 'super_admin',
  name: 'Quản trị Demo', phone: '0909000001',
};
const authToken = `hd-preview-auth-v1:${encodeURIComponent(JSON.stringify(claims))}`;
const dateAt = (hour, minute) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};
const duckImage = '/messaging/duck-farm.png';
const truckImage = '/messaging/delivery-truck.png';
const customers = Object.fromEntries([
  ['farm', 'Trại Bình Dương'],
  ['buyer', 'Anh Tuấn - Khách sỉ'],
  ['agency', 'Chị Hà - Đại lý'],
  ['supplier', 'Nhà cung cấp miền Tây'],
  ['mai', 'Chị Mai - Khách hàng'],
].map(([id, name], index) => [id, {
  id, companyId, name, phone: `091100000${index + 1}`, empId: employeeId,
  avatarUrl: id === 'farm' ? duckImage : '', isArchived: false,
}]));
const employees = Object.fromEntries([
  ['emp_admin', 'Quản trị Demo'],
  ['emp_driver', 'Anh Hùng - Tài xế'],
  ['emp_dispatch', 'Lan - Điều phối'],
  ['emp_other', 'Tài xế - Giao hàng'],
].map(([id, name], index) => [id, {
  id, companyId, name, phone: `098800000${index + 1}`, role: 'employee', isArchived: false,
}]));

let serial = 0;
const message = (props) => {
  serial += 1;
  return { id: `chat_fixture_${serial}`, companyId, isArchived: false, ...props };
};
const customerMessage = (customerId, text, hour, minute, extra = {}) => message({
  conversationType: 'customer_support', conversationId: `customer_${customerId}`,
  customerId, customerName: customers[customerId].name, senderType: 'customer',
  senderName: customers[customerId].name, text, createdAt: dateAt(hour, minute), ...extra,
});
const groupMessage = (groupId, groupName, text, senderEmpId, hour, minute, extra = {}) => message({
  conversationType: 'internal_group', type: 'internal_group', conversationId: groupId,
  groupId, groupName, participantEmpIds: ['emp_admin', 'emp_driver', 'emp_dispatch', 'emp_other'],
  senderEmpId, senderType: 'employee', senderName: employees[senderEmpId].name,
  text, createdAt: dateAt(hour, minute), ...extra,
});
const directMessage = (otherId, text, hour, minute, extra = {}) => message({
  conversationType: 'internal', type: 'internal_message',
  conversationId: ['emp_admin', otherId].sort().join('-').replace(/^/, 'internal-'),
  senderEmpId: otherId, senderType: 'employee', senderName: employees[otherId].name,
  text, createdAt: dateAt(hour, minute), ...extra,
});
const messages = [
  customerMessage('farm', 'Chào anh, hiện tại bên trại có 500 con vịt, trọng lượng 2.8 - 3kg. Giá 60k/kg, giao được ngày mai.', 9, 28),
  customerMessage('farm', 'Hình ảnh lồng vịt', 9, 29, { attachmentType: 'image', attachmentImages: [duckImage, duckImage, duckImage, duckImage, duckImage, duckImage] }),
  message({ conversationType: 'customer_support', conversationId: 'customer_farm', customerId: 'farm', senderEmpId: employeeId, senderType: 'employee', senderName: 'Quản trị Demo', text: 'Có hình ảnh lồng được không anh?', createdAt: dateAt(9, 30) }),
  customerMessage('farm', 'Dạ có anh, em gửi thêm nhé', 9, 30),
  customerMessage('farm', '', 9, 31, { attachmentType: 'audio', duration: '0:12' }),
  message({ conversationType: 'customer_support', conversationId: 'customer_farm', customerId: 'farm', senderEmpId: employeeId, senderType: 'employee', senderName: 'Quản trị Demo', text: 'Ok, anh chốt 500 con nhé\nMai giao sáng 6h tại kho', createdAt: dateAt(9, 32) }),
  customerMessage('farm', 'Dạ vâng, em chuẩn bị. Có gì em báo lại sớm ạ.', 9, 33, { isRead: false }),
  groupMessage('internal_group_delivery', 'Tài xế - Giao hàng', 'Đã nhận hàng tại kho ✅', 'emp_driver', 8, 12),
  groupMessage('internal_group_delivery', 'Tài xế - Giao hàng', 'Xe đang chở vịt đi giao.', 'emp_driver', 8, 13, { attachmentType: 'image', attachmentImage: truckImage, reactions: { heart: 3, like: 1 } }),
  groupMessage('internal_group_delivery', 'Tài xế - Giao hàng', 'Cập nhật vị trí giúp mình', 'emp_dispatch', 8, 15),
  groupMessage('internal_group_delivery', 'Tài xế - Giao hàng', 'Dạ vâng 👍', 'emp_driver', 8, 16, { isRead: false }),
  groupMessage('internal_group_delivery', 'Tài xế - Giao hàng', 'Vị trí hiện tại', 'emp_driver', 8, 21, { attachmentType: 'location', attachmentLabel: 'Vị trí hiện tại', attachmentText: 'QL13, Bàu Bàng, Bình Dương' }),
  groupMessage('internal_group_warehouse', 'Nhóm kho', 'Đã nhập 1.000 con vịt về kho sáng nay.', 'emp_other', 8, 10),
  groupMessage('internal_group_marketing', 'Nhóm marketing', 'Hình ảnh vịt giống mới', 'emp_dispatch', 7, 45, { attachmentType: 'image', attachmentImage: duckImage }),
  customerMessage('buyer', 'Giá vịt hôm nay 58k/kg nhé. Đơn hàng ngày mai chốt nhé anh', 7, 25),
  customerMessage('agency', 'Đặt thêm 300 con vịt tuần tới. Cảm ơn, em nhận hàng rồi', 7, 20),
  customerMessage('supplier', 'Có hàng vịt xiêm, số lượng lớn. File báo giá tháng 9.pdf', 7, 15, { attachmentType: 'document', attachmentLabel: 'Báo giá tháng 9.pdf' }),
  customerMessage('mai', 'Ok, cảm ơn anh', 7, 10),
  directMessage('emp_driver', 'Đã giao 500 con vịt cho trại', 7, 5),
  directMessage('emp_dispatch', 'Lịch giao vịt cho khách Bắc Ninh. Cập nhật vị trí giúp mình', 7, 0),
];
const previewStore = {
  __replaceSeed: true,
  customers,
  employees,
  messages: Object.fromEntries(messages.map((item) => [item.id, item])),
};

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ executablePath: browserPath, headless: true });
const failures = [];
const makePage = async (viewport, store = previewStore) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.addInitScript(({ token, initialStore }) => {
    window.__initial_auth_token = token;
    window.localStorage.setItem('hd-manager-local-db-v2-clean-preview', JSON.stringify(initialStore));
  }, { token: authToken, initialStore: store });
  const response = await page.goto(baseUrl, { waitUntil: 'commit', timeout: 20000 });
  assert.equal(response?.status(), 200, 'Preview must return HTTP 200.');
  await page.locator('[data-hd-shell="enterprise"]').waitFor({ timeout: 20000 });
  const nav = page.locator('[data-hd-navigation="bottom"]');
  await nav.getByRole('button', { name: 'Thêm', exact: true }).click();
  await page.getByRole('button', { name: 'Tin nhắn', exact: true }).click();
  await page.locator('[data-hd-module="messaging"]').waitFor({ timeout: 10000 });
  return { context, page };
};

try {
  const { context, page } = await makePage({ width: 390, height: 844 });
  const module = page.locator('[data-hd-module="messaging"]');
  await page.screenshot({ path: `${outputDir}/01_chat_list.png` });
  assert.equal(await module.locator('h1').count(), 0, 'No app-level messaging header is allowed.');
  assert.equal(await module.getByRole('tab').count(), 4, 'Conversation list needs four tabs.');
  await module.getByRole('button', { name: /Trại Bình Dương/ }).first().click();
  await page.screenshot({ path: `${outputDir}/02_chat_conversation.png` });
  await module.getByRole('button', { name: 'Đính kèm' }).click();
  await page.screenshot({ path: `${outputDir}/05_attachment_panel.png` });
  assert.equal(await module.locator('[data-chat-attachment-panel="true"] button').count(), 9, 'Attachment panel needs eight options and close.');
  await module.getByRole('button', { name: 'Quay lại danh sách tin nhắn' }).click();
  await module.getByRole('button', { name: /Tài xế - Giao hàng/ }).first().click();
  await page.screenshot({ path: `${outputDir}/03_group_delivery.png` });
  await module.getByRole('button', { name: 'Quay lại danh sách tin nhắn' }).click();
  await module.getByRole('searchbox', { name: 'Tìm kiếm tin nhắn, người dùng...' }).fill('vịt');
  await page.screenshot({ path: `${outputDir}/04_search_result.png` });
  assert.ok(await module.locator('mark').count() > 0, 'Matching search terms must be highlighted.');
  await module.getByRole('searchbox', { name: 'Tìm kiếm tin nhắn, người dùng...' }).fill('khong-c%C3%B3-ket-qua');
  await page.screenshot({ path: `${outputDir}/07_empty_state.png` });
  await module.getByRole('button', { name: 'Xóa tìm kiếm' }).click();
  await module.getByRole('button', { name: 'Tạo cuộc trò chuyện' }).click();
  await module.getByRole('button', { name: 'Lọc tin nhắn' }).click();
  await module.getByRole('button', { name: 'Tin chưa đọc' }).click();
  await page.screenshot({ path: `${outputDir}/06_unread_state.png` });
  await module.getByRole('button', { name: 'Tạo cuộc trò chuyện' }).click();
  await module.getByRole('button', { name: 'Làm mới' }).click();
  await page.screenshot({ path: `${outputDir}/08_loading_state.png` });

  for (const viewport of [{ width: 320, height: 700 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    await module.getByRole('button', { name: 'Tạo cuộc trò chuyện' }).click();
    await module.getByRole('button', { name: 'Lọc tin nhắn' }).click();
    await module.getByRole('button', { name: 'Tất cả', exact: true }).last().click();
    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      moduleWidth: document.querySelector('[data-hd-module="messaging"]').getBoundingClientRect().width,
    }));
    assert.ok(geometry.documentWidth <= geometry.innerWidth + 1, `${viewport.width}: no horizontal overflow: ${JSON.stringify(geometry)}`);
    await page.screenshot({ path: `${outputDir}/responsive-${viewport.width}.png` });
  }
  assert.deepEqual(failures, [], `Browser errors: ${failures.join('; ')}`);
  await context.close();
  console.log(`PASS Messaging visual QA; screenshots saved in ${outputDir}`);
} finally {
  await browser.close();
}
