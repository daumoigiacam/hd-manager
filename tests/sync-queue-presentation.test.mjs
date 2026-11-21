import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/layout/SyncQueueStatus.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/design-system/foundation.css', import.meta.url), 'utf8');

test('the requested cleanup removes the settings sync-status row and never creates a global footer overlay', () => {
  const settings=readFileSync(new URL('../development/hd-manager/application/src/features/legacy/SettingsView.jsx',import.meta.url),'utf8');
  assert.equal((app.match(/<SyncQueueStatus\b/g) || []).length, 0);
  assert.doesNotMatch(settings,/<SyncQueueStatus\b/);
  assert.doesNotMatch(settings,/Trạng thái đồng bộ/);
  assert.match(css, /\.hd-sync-queue\s*\{\s*position: static;/);
  assert.doesNotMatch(panel, /thao tác chưa được máy chủ xác nhận/);
});

test('diagnostics retain pending writes, manual retry and honest empty state', () => {
  assert.match(app, /SyncQueueContext.Provider value=\{\{ writes: pendingFirebaseWritesRef.current, onRetry: retryPendingFirebaseWrite \}\}/);
  assert.match(panel, /await onRetry\(write\)/);
  assert.match(panel, /writes.map\(write/);
  assert.match(panel, /Không có thao tác chờ đồng bộ/);
  assert.match(panel, /inFlight.current.has\(write.key\)/);
});
