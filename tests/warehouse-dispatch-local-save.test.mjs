import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const create = source.slice(source.indexOf('const handleAddWarehouseDispatch ='), source.indexOf('const handleEditWarehouseDispatch ='));
assert.match(create, /enqueuePendingFirebaseWrite\(\{ collectionName: 'warehouseDispatches'.*durable: true/);
assert.match(create, /void flushPendingFirebaseWriteNow\('warehouseDispatches', id\)\.catch/);
assert.doesNotMatch(create, /await saveDataDocument/);
assert.match(source, /dispatchShortageCustomerGroups\.slice\(0, 3\)/);
assert.match(source, /dispatchShortageCustomerGroups\.length - 3/);
const enqueue = source.slice(source.indexOf('const enqueuePendingFirebaseWrite ='), source.indexOf('const rememberRecentLocalWrite ='));
const persistIndex = enqueue.indexOf('persistPendingFirebaseWrites(nextWrites, { alreadyPersisted: durable })');
assert(persistIndex > enqueue.indexOf('window.localStorage.setItem'));
assert(persistIndex > enqueue.indexOf('window.localStorage.getItem(storageKey) !== serialized'));
assert.match(enqueue, /nextWrites\.length > 500/);
assert.match(enqueue, /window.localStorage.getItem\(storageKey\) !== serialized/);
console.log('PASS: three-row preview and durable-before-background dispatch save guards.');
