import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

const getSection = (startMarker, endMarker) => {
  const start = appSource.indexOf(startMarker);
  const end = appSource.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `Missing source marker: ${startMarker}`);
  assert.ok(end > start, `Missing end marker: ${endMarker}`);
  return appSource.slice(start, end);
};

test('new sales orders wait for Firestore confirmation before returning success', () => {
  const section = getSection('const handleAddOrder = async', 'const handleGetCustomerProductPreference');

  assert.match(section, /const writeResult = await saveDataDocument\(/);
  assert.match(section, /await requireSharedWriteConfirmation\(writeResult, 'orders', id\)/);
  assert.doesNotMatch(section, /saveDataDocument\('orders'[\s\S]*?\.then\(/);
  assert.match(section, /throw error;/);
});

test('employee order request saves can return immediately while Firestore confirmation continues in the background', () => {
  const section = getSection('const handleAddOrderRequest = async', 'const handleEditOrderRequest');

  assert.match(section, /const handleAddOrderRequest = async \(empId, requestData = \{\}, saveOptions = \{\}\)/);
  assert.match(section, /if \(saveOptions\?\.backgroundSync\)/);
  assert.match(section, /void \(async \(\) => \{/);
  assert.match(section, /return id;/);
  assert.match(section, /const writeResult = await persistOrderRequest\(\);/);
  assert.match(section, /await requireSharedWriteConfirmation\(writeResult, 'orderRequests', id\)/);
  assert.match(section, /saveOptions\.onPersisted\?\.\(\{ id, request: newRequestDocument, queued: Boolean\(writeResult\?\.queued\) \}\)/);
  assert.match(section, /saveOptions\.onSettled\?\.\(\{ id, persisted, confirmed, error: writeError \}\)/);
});

test('editing an order request supports an immediate optimistic return with background sync', () => {
  const section = getSection('const handleEditOrderRequest = async', 'const handleDeleteOrderRequest');

  assert.match(section, /const handleEditOrderRequest = async \(requestId, updatedData, empId = '', saveOptions = \{\}\)/);
  assert.match(section, /if \(saveOptions\?\.backgroundSync\)/);
  assert.match(section, /await persistOrderRequestUpdate\(\)/);
  assert.match(section, /await requireSharedWriteConfirmation\(writeResult, 'orderRequests', requestId\)/);
  assert.match(section, /return true;/);
});

test('queued shared writes are retried once per document and remain tenant-scoped', () => {
  const pendingSyncSection = getSection('const flushPendingFirebaseWriteNow =', 'const saveDataDocument = async');
  const tenantSourceSection = getSection('const getTenantCollectionSources =', 'const getSnapshotItems =');

  assert.match(pendingSyncSection, /const inFlightKey = `\$\{normalizeTenantStorageScope\(companyId\)\}:\$\{key\}`/);
  assert.match(pendingSyncSection, /pendingFirebaseWritePromisesRef\.current\.get\(inFlightKey\)/);
  assert.match(pendingSyncSection, /persistPendingFirebaseWrites\(nextWrites\)/);
  assert.match(pendingSyncSection, /pendingFirebaseWritePromisesRef\.current\.delete\(inFlightKey\)/);
  assert.match(pendingSyncSection, /item\?\.key === key && `\$\{item\?\.companyId \|\| ''\}`\.trim\(\) === companyId/);
  assert.match(tenantSourceSection, /firebaseWhere\('companyId', '==', tenantCompanyId\)/);
});

test('order request form uses background persistence while normal sales order save retains confirmation', () => {
  const requestSubmitSection = getSection('const handleSubmitOrderRequests = async', 'const orderCellEditorConfig');
  const salesSubmitSection = getSection('const handleSubmitBulkOrders = async', 'const openAddOrderModal');
  const singleOrderSubmitSection = getSection('const handleAddSubmit = async', 'const openAddOrderModal');

  assert.match(requestSubmitSection, /backgroundSync: true/);
  assert.match(requestSubmitSection, /onPersisted:/);
  assert.match(requestSubmitSection, /onSettled:/);
  assert.match(requestSubmitSection, /Dang luu \$\{normalizedRequests\.length\} don dat hang/);
  assert.doesNotMatch(salesSubmitSection, /flushSync\(\(\) => \{[\s\S]*?setShowAddOrder\(false\)/);
  assert.match(singleOrderSubmitSection, /setBulkOrderStatus\('Đang xác nhận đơn với máy chủ\.\.\.'\)/);
  assert.match(singleOrderSubmitSection, /await submitOrderDraft\(newOrder, \{ allowDescriptionOnly: false \}\)/);
  assert.match(singleOrderSubmitSection, /Đã tạo đơn hàng\. Máy chủ đã xác nhận và đồng bộ dữ liệu\./);
  assert.match(singleOrderSubmitSection, /catch \(error\) \{\s*setBulkOrderStatus\(''\)/);
});

test('realtime confirmation compares the server version before removing the local edit guard', () => {
  const section = getSection('const clearConfirmedLocalMutations =', 'const hasCollectionValue =');

  assert.match(section, /!options\.fromCache && !options\.hasPendingWrites/);
  assert.match(section, /isRealtimeWriteConfirmed\(serverItem, write\.payload\)/);
  assert.match(section, /snapshotById/);
});
