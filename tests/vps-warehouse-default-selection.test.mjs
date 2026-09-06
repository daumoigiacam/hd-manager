import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveSingleActiveMainWarehouse,
  resolveSingleActiveMainWarehouseId,
} from '../src/utils/vpsWarehouseDefaultSelection.js';

test('selects the only active MAIN warehouse', () => {
  const warehouse = { id: 'main-id', type: 'MAIN', status: 'ACTIVE' };
  assert.equal(resolveSingleActiveMainWarehouse([warehouse]), warehouse);
  assert.equal(resolveSingleActiveMainWarehouseId([warehouse]), 'main-id');
});

test('does not select a non-main, deleted, inactive, or ambiguous warehouse', () => {
  assert.equal(resolveSingleActiveMainWarehouseId([
    { id: 'secondary', type: 'SECONDARY', status: 'ACTIVE' },
  ]), '');
  assert.equal(resolveSingleActiveMainWarehouseId([
    { id: 'deleted', type: 'MAIN', status: 'ACTIVE', deletedAt: '2026-09-06' },
  ]), '');
  assert.equal(resolveSingleActiveMainWarehouseId([
    { id: 'inactive', type: 'MAIN', status: 'INACTIVE' },
  ]), '');
  assert.equal(resolveSingleActiveMainWarehouseId([
    { id: 'main-a', type: 'MAIN', status: 'ACTIVE' },
    { id: 'main-b', type: 'MAIN', status: 'ACTIVE' },
  ]), '');
});
