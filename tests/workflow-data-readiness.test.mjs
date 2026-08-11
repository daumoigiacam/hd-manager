import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  getWorkflowDataReadiness,
  shouldShowMissingWorkflowSetup
} from '../src/utils/workflowDataReadiness.js';

const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

const shouldShowSalesGuide = ({ state, hasCustomers = false, hasProducts = false }) => {
  const readiness = getWorkflowDataReadiness({
    activeTenantId: 'company-a',
    readinessTenantId: state.tenantId,
    serverConfirmedCollections: state.collections
  });
  return shouldShowMissingWorkflowSetup({
    canCreate: true,
    dataReady: readiness.sales,
    hasCustomers,
    hasProducts
  });
};

test('warehouse setup guide waits for both server-confirmed collections', () => {
  assert.equal(shouldShowSalesGuide({
    state: { tenantId: 'company-a', collections: {} }
  }), false);
  assert.equal(shouldShowSalesGuide({
    state: { tenantId: 'company-a', collections: { customers: true } },
    hasCustomers: true
  }), false);
  assert.equal(shouldShowSalesGuide({
    state: { tenantId: 'company-a', collections: { products: true } },
    hasProducts: true
  }), false);
});

test('genuinely empty server-confirmed sales data still shows setup guidance', () => {
  const confirmedState = {
    tenantId: 'company-a',
    collections: { customers: true, products: true }
  };

  assert.equal(shouldShowSalesGuide({ state: confirmedState }), true);
  assert.equal(shouldShowSalesGuide({ state: confirmedState, hasCustomers: true }), true);
  assert.equal(shouldShowSalesGuide({ state: confirmedState, hasProducts: true }), true);
  assert.equal(shouldShowSalesGuide({
    state: confirmedState,
    hasCustomers: true,
    hasProducts: true
  }), false);
});

test('server confirmation from another tenant cannot trigger an empty-state guide', () => {
  const readiness = getWorkflowDataReadiness({
    activeTenantId: 'company-b',
    readinessTenantId: 'company-a',
    serverConfirmedCollections: { customers: true, products: true }
  });

  assert.deepEqual(readiness, {
    tenantMatches: false,
    customers: false,
    products: false,
    sales: false
  });
  assert.equal(shouldShowMissingWorkflowSetup({
    canCreate: true,
    dataReady: readiness.sales,
    hasCustomers: false,
    hasProducts: false
  }), false);
});

test('warehouse import can independently wait for product confirmation', () => {
  const readiness = getWorkflowDataReadiness({
    activeTenantId: 'company-a',
    readinessTenantId: 'company-a',
    serverConfirmedCollections: { products: true }
  });

  assert.equal(shouldShowMissingWorkflowSetup({
    canCreate: true,
    dataReady: readiness.products,
    hasProducts: false,
    requiresCustomers: false
  }), true);
  assert.equal(shouldShowMissingWorkflowSetup({
    canCreate: true,
    dataReady: readiness.products,
    hasProducts: true,
    requiresCustomers: false
  }), false);
});

test('delayed product snapshots never create a transient false onboarding screen', () => {
  for (let run = 0; run < 1000; run += 1) {
    const hasCustomers = run % 2 === 0;
    const hasProducts = run % 3 === 0;
    const stateBeforeProductConfirmation = {
      tenantId: 'company-a',
      collections: run % 5 === 0 ? {} : { customers: true }
    };

    assert.equal(shouldShowSalesGuide({
      state: stateBeforeProductConfirmation,
      hasCustomers,
      hasProducts
    }), false, `false setup guide before product confirmation at run ${run}`);
  }
});

test('App marks only server-backed reads as workflow-ready and gates all sales guides', () => {
  assert.match(appSource, /const markCollectionServerConfirmed = \(colName\) =>/);
  assert.match(appSource, /markCollectionServerConfirmed\(colName\);[\s\S]*?source: 'server'/);
  assert.match(appSource, /isServerConfirmedRealtimeSnapshot\(snapshot\)[\s\S]*?markCollectionServerConfirmed\(colName\)/);
  assert.match(appSource, /case 'warehouse_dispatch': return shouldShowMissingWorkflowSetup\(/);
  assert.match(appSource, /case 'order_requests': return shouldShowMissingWorkflowSetup\(/);
  assert.match(appSource, /case 'orders': return shouldShowMissingWorkflowSetup\(/);
  assert.match(appSource, /dataReady: workflowDataReadiness\.sales/);
});
