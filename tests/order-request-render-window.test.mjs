import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {readApplicationSource,readApplicationSourceRoot} from '../scripts/helpers/application-source.cjs';
import path from 'node:path';
import {getGroupedRowPage} from '../development/hd-manager/application/src/services/groupedRowPage.js';

const source = readApplicationSource();
const start = source.indexOf('const visibleRequestSalesGroups = useMemo(');
const end = source.indexOf('\n  const isOrderRequestRowFullyDispatchedForShare', start);
const code = source.slice(start, end) + '\nvisibleRequestSalesGroups;';
const groups = Array.from({ length: 3 }, (_, s) => ({ key: s, customerGroups: Array.from({ length: 17 }, (_, c) => ({ key: `${s}-${c}`, rows: [{ id: `${s}-${c}-1` }, { id: `${s}-${c}-2` }] })) }));

test('request pages preserve row order, row spans and every row exactly once', () => {
  for (const limit of [15,20,50]) {
    const all=groups.flatMap(salesGroup=>salesGroup.customerGroups.map(group=>({...group,salesGroup}))),seen=[];
    for(let offset=0;offset<102;offset+=limit){
      const requestRowPage=getGroupedRowPage(all,offset,limit);
      const visible = vm.runInNewContext(code, {requestRowPage,useMemo:fn=>fn()});
      const customerGroups=visible.flatMap(g=>g.customerGroups);
      assert(customerGroups.every(g=>g.rowSpan===g.rows.length));
      seen.push(...customerGroups.flatMap(g=>g.rows).map(row=>row.id));
    }
    assert.deepEqual(seen,all.flatMap(g=>g.rows).map(row=>row.id));
  }
  assert.equal(groups.flatMap(g => g.customerGroups).length, 51);
});

test('date/sales filters reset render window; totals and sharing retain full rows', () => {
  assert.match(source, /requestDisplayScope = `\$\{requestFilterDate\}\|\$\{requestFilterSalesEmpId\}`/);
  assert.match(source, /requestDisplayPage.scope === requestDisplayScope \? requestDisplayPage.offset : 0/);
  const table=path.join(readApplicationSourceRoot(),'src/features/orders/OrderRequestTableRows.jsx');
  assert.match(source.includes('visibleRequestSalesGroups.map') ? source : readFileSync(table,'utf8'), /visibleRequestSalesGroups.map/);
  assert.match(source, /editableCurrentDayRows\s*\.filter\(\(row\) => !isOrderRequestRowFullyDispatchedForShare/);
});
