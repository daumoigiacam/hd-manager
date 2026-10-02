import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('const visibleRequestSalesGroups = useMemo(');
const end = source.indexOf('\n  const isOrderRequestRowFullyDispatchedForShare', start);
const code = source.slice(start, end) + '\nvisibleRequestSalesGroups;';
const groups = Array.from({ length: 3 }, (_, s) => ({ key: s, customerGroups: Array.from({ length: 17 }, (_, c) => ({ key: `${s}-${c}`, rows: [{ id: `${s}-${c}-1` }, { id: `${s}-${c}-2` }] })) }));

test('request render window preserves whole customer groups and all rows', () => {
  for (const limit of [20, 40, 60]) {
    const visible = vm.runInNewContext(code, { displayRowsBySales: groups, requestDisplayLimit: limit, useMemo: fn => fn() });
    const expected = groups.flatMap(g => g.customerGroups).slice(0, limit);
    assert.equal(JSON.stringify(visible.flatMap(g => g.customerGroups)), JSON.stringify(expected));
  }
  assert.equal(groups.flatMap(g => g.customerGroups).length, 51);
});

test('date/sales filters reset render window; totals and sharing retain full rows', () => {
  assert.match(source, /requestDisplayScope = `\$\{requestFilterDate\}\|\$\{requestFilterSalesEmpId\}`/);
  assert.match(source, /requestDisplayPage.scope === requestDisplayScope \? requestDisplayPage.count : 20/);
  assert.match(source, /visibleRequestSalesGroups.map/);
  assert.match(source, /editableCurrentDayRows\s*\.filter\(\(row\) => !isOrderRequestRowFullyDispatchedForShare/);
});
