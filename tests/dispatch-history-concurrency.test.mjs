import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveDispatchHistorySelection } from '../src/features/warehouse/dispatchHistorySelection.js';
import { deleteDispatchHistoryRow } from '../src/features/warehouse/dispatchHistoryActions.js';
import { buildDispatchShortageGroups } from '../src/features/warehouse/dispatchShortageGroups.js';

test('shortage grouping preserves original request references, counts, dates and newest-first order', () => {
  const request = {requestId: 'r', requestDate: '2026-10-06', itemIndex: 0};
  const lines = [{customerId: 'a', customerName: 'A', productShortName: 'VKM', requestLines: [request], latestMissingTimestamp: 1},
    {customerId: 'a', customerName: 'A', productShortName: 'VKM', requestLines: [request], dispatchedKg: 2},
    {customerId: 'b', customerName: 'B', productName: 'B', latestMissingTimestamp: 2}];
  const groups = buildDispatchShortageGroups(lines, {normalizeLookupText: s => s, getCompactProductName: (_, s) => s, formatCompactDateLabel: s => s});
  assert.deepEqual(groups.map(group => group.key), ['b','a']);
  assert.equal(groups[1].requestLines[0], request);
  assert.equal(groups[1].totalMissingLines, 2);
  assert.deepEqual(groups[1].productLabels, ['VKM']);
  assert.deepEqual(groups[1].requestDateLabels, ['2026-10-06']);
  assert.equal(groups[1].totalDispatchedKg, 2);
});

test('open history resolves refreshed records and disappears when the last record is removed', () => {
  const initial = {dateKey: '2026-10-06', items: [{id: 'd', weightKg: 10}]};
  let groups = new Map([[initial.dateKey, initial]]);
  assert.equal(resolveDispatchHistorySelection(groups, initial.dateKey), initial);
  const updated = {...initial, items: [{id: 'd', weightKg: 20}, {id: 'new', weightKg: 5}]};
  groups = new Map([[updated.dateKey, updated]]);
  assert.equal(resolveDispatchHistorySelection(groups, initial.dateKey), updated);
  assert.equal(resolveDispatchHistorySelection(new Map(), initial.dateKey), null);
  assert.equal(resolveDispatchHistorySelection(groups, null), null);
});

test('late delete rejection does not restore a captured record or overwrite a newer selection', async () => {
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  let error = '';
  const newer = {dateKey: '2026-10-07', items: [{id: 'new', weightKg: 99}]};
  const groups = new Map([[newer.dateKey, newer]]);
  const lock = {current: false};
  const deleting = deleteDispatchHistoryRow({id: 'old'}, {
    allowed: true, lock, confirm: () => true, remove: () => pending,
    setPending: () => {}, setError: value => {error = value;}, errorMessage: e => e.message,
    onRemoved: () => assert.fail('failed delete must not publish a success'),
  });
  reject(new Error('conflict'));
  await deleting;
  assert.equal(error, 'conflict');
  assert.equal(lock.current, false);
  assert.equal(resolveDispatchHistorySelection(groups, newer.dateKey), newer);
});

test('actual parent keeps only selection identity and does not patch a captured history group', () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /resolveDispatchHistorySelection\(historyDispatchGroupMap, selectedHistoryDate\)/);
  assert.doesNotMatch(source, /setSelectedHistoryDispatchGroup/);
});
