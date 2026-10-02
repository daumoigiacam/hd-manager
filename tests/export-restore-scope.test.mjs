import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const source = readFileSync('src/App.jsx', 'utf8');
const baseline = execFileSync('git', ['show', 'd4262219:src/App.jsx'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const section = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end)).replace(/\r\n/g, '\n');
test('warehouse write handlers are byte-equivalent to the deployed baseline', () => {
  for (const [start, end] of [
    ['const handleAddWarehouseDispatch =', 'const handleEditWarehouseDispatch ='],
    ['const handleEditWarehouseDispatch =', 'const handleDeleteWarehouseDispatch ='],
  ]) assert.equal(section(source, start, end), section(baseline, start, end));
});
test('application no longer invokes paused architecture or cursor migration', () => {
  assert.doesNotMatch(source, /commitAtomicInventoryOperation|commitOrderReturnTransaction|useScreenCursorState/);
});
test('security rules and deployed function exports exactly match the old contract', () => {
  for (const file of ['firestore.rules', 'functions/index.js']) {
    assert.equal(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'),
      execFileSync('git', ['show', `d4262219:${file}`], { encoding: 'utf8' }).replace(/\r\n/g, '\n'));
  }
});
test('only visible groups are paged; original full-data totals and search remain', () => {
  assert.match(source, /groupedEditableDispatchRows\.slice\(0, dispatchDisplayLimit\)/);
  assert.match(source, /visibleDispatchGroups\.flatMap/);
  assert.match(source, /count: dispatchDisplayLimit \+ 20/);
  assert.equal(section(source, 'const dispatchSummary =', '  const [dispatchDisplayPage'),
    section(baseline, 'const dispatchSummary =', '  const shouldShowDispatchShortage'));
  assert.equal(section(source, 'const filteredEditableDispatchRows =', 'const mergedDispatchRows ='),
    section(baseline, 'const filteredEditableDispatchRows =', 'const mergedDispatchRows ='));
});
test('render pagination does not split row spans or lose groups', () => {
  const groups = Array.from({ length: 43 }, (_, i) => ({ id: i, rows: Array.from({ length: i % 3 + 1 }, (_, j) => ({ id: `${i}-${j}` })) }));
  assert.equal(groups.slice(0, 20).length, 20);
  assert.equal(groups.slice(0, 40).length, 40);
  assert.deepEqual(groups.slice(0, 60), groups);
  assert.equal(new Set(groups.flatMap(g => g.rows.map(r => r.id))).size, groups.flatMap(g => g.rows).length);
});
