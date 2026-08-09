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

test('new order requests wait for Firestore confirmation before returning success', () => {
  const section = getSection('const handleAddOrderRequest = async', 'const handleEditOrderRequest');

  assert.match(section, /const writeResult = await saveDataDocument\(/);
  assert.match(section, /await requireSharedWriteConfirmation\(writeResult, 'orderRequests', id\)/);
  assert.doesNotMatch(section, /saveDataDocument\('orderRequests'[\s\S]*?\.then\(/);
  assert.match(section, /throw error;/);
});

test('queued shared writes are retried once per document and remain tenant-scoped', () => {
  const pendingSyncSection = getSection('const flushPendingFirebaseWriteNow =', 'const saveDataDocument = async');
  const tenantSourceSection = getSection('const getTenantCollectionSource =', 'const getSnapshotItems =');

  assert.match(pendingSyncSection, /const inFlightKey = `\$\{normalizeTenantStorageScope\(companyId\)\}:\$\{key\}`/);
  assert.match(pendingSyncSection, /pendingFirebaseWritePromisesRef\.current\.get\(inFlightKey\)/);
  assert.match(pendingSyncSection, /persistPendingFirebaseWrites\(nextWrites\)/);
  assert.match(pendingSyncSection, /pendingFirebaseWritePromisesRef\.current\.delete\(inFlightKey\)/);
  assert.match(pendingSyncSection, /item\?\.key === key && `\$\{item\?\.companyId \|\| ''\}`\.trim\(\) === companyId/);
  assert.match(tenantSourceSection, /firebaseWhere\('companyId', '==', tenantCompanyId\)/);
});

test('order forms stay open while the server confirms the write', () => {
  const requestSubmitSection = getSection('const handleSubmitOrderRequests = async', 'const orderCellEditorConfig');
  const salesSubmitSection = getSection('const handleSubmitBulkOrders = async', 'const openAddOrderModal');

  assert.doesNotMatch(requestSubmitSection, /closeImmediatelyAfterSubmit/);
  assert.match(requestSubmitSection, /Dang luu \$\{normalizedRequests\.length\} don dat hang/);
  assert.doesNotMatch(salesSubmitSection, /flushSync\(\(\) => \{[\s\S]*?setShowAddOrder\(false\)/);
  assert.match(salesSubmitSection, /Đang xác nhận đơn với máy chủ/);
});
