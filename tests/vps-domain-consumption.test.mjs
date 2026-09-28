import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(
  new URL('../src/App.jsx', import.meta.url),
  'utf8',
);
const stagingApiSource = fs.readFileSync(
  new URL('../src/api/hdConnectStaging.js', import.meta.url),
  'utf8',
);

test('VPS Debt and Payroll tabs render authoritative VPS read panels', () => {
  assert.match(appSource, /data-vps-authoritative-module="debt"/);
  assert.match(appSource, /data-vps-authoritative-module="payroll"/);
  assert.match(appSource, /VPS_UI_READ_MODULE_BY_TAB\[activeTab\] === 'debt'/);
  assert.match(
    appSource,
    /VPS_UI_READ_MODULE_BY_TAB\[activeTab\] === 'payroll'/,
  );
});

test('VPS Settings tab consumes Storage API read, provider and health contracts', () => {
  assert.match(
    appSource,
    /path:\s*['"]\/api\/v1\/storage['"],\s*run:\s*\(\)\s*=>\s*api\.listStorage\(query\)/,
  );
  assert.match(
    appSource,
    /path:\s*['"]\/api\/v1\/storage\/providers['"],\s*run:\s*\(\)\s*=>\s*api\.getStorageProviders\(\)/,
  );
  assert.match(
    appSource,
    /path:\s*['"]\/api\/v1\/storage\/health['"],\s*run:\s*\(\)\s*=>\s*api\.getStorageHealth\(\)/,
  );
  assert.match(appSource, /data-vps-authoritative-module="storage"/);
});

test('VPS mode keeps payroll and storage writes fail-closed when external policy is missing', () => {
  assert.match(
    appSource,
    /VPS payroll generate\/approve\/lock UI is not yet mapped/,
  );
  assert.doesNotMatch(
    appSource,
    /isVpsStagingMode[\s\S]{0,180}uploadStorageFile\(/,
  );
});

test('VPS staging customer creation uses the authenticated VPS actor when legacy employees are unavailable', () => {
  assert.match(
    appSource,
    /const assignedEmpId\s*=\s*empId\s*\|\|\s*customerData\?\.empId\s*\|\|\s*currentUser\?\.id\s*\|\|\s*['"]['"];/,
  );
  assert.match(appSource, /if \(!finalEmpId && !isVpsStagingMode\) \{/);
  const activeCustomerCrmSource = appSource.slice(
    appSource.indexOf('function CustomerCRMView({'),
  );
  assert.match(
    activeCustomerCrmSource,
    /<select\s+required=\{!isVpsStagingMode\}\s+value=\{newCus\.empId\}/s,
  );
});

test('VPS inventory lookup uses only its supported query contract', () => {
  assert.match(appSource, /const inventoryLookupQuery = \{ limit: 50 \};/);
  assert.match(appSource, /api\.listInventory\(inventoryLookupQuery\)/);
});

test('VPS staging can create only the missing disposable UOM and warehouse master records for inventory E2E', () => {
  assert.match(
    stagingApiSource,
    /async createUnit\(record = \{\}\)\s*\{\s*return this\.client\.post\(\s*['"]\/master-data\/units['"],\s*toTenantSafePayload\(record\),\s*mutationOptions\(record\),?\s*\);\s*\}/s,
  );
  assert.match(appSource, /data-vps-staging-master-setup="true"/);
  assert.match(appSource, /getHdConnectStagingApi\(\)\.createUnit\(request\)/);
  assert.match(
    appSource,
    /getHdConnectStagingApi\(\)\.createWarehouse\(request\)/,
  );
  assert.match(
    appSource,
    /clientMutationId: `p32-vps-staging-\$\{kind\}-\$\{Date\.now\(\)\}`/,
  );
  assert.match(appSource, /Dùng thời điểm hiện tại cho tồn đầu kỳ VPS/);
});

test('VPS finance expense UI keeps the form open until its write succeeds', () => {
  const financeStart = appSource.indexOf('function FinanceView({');
  const financeEnd = appSource.indexOf(
    'function DeliveryReportView',
    financeStart,
  );
  const financeSource = appSource.slice(financeStart, financeEnd);

  assert.match(financeSource, /const handleExpenseSubmit = async \(e\) =>/);
  assert.match(financeSource, /await onAddExpense\(\{/);
  assert.match(financeSource, /setShowExpenseModal\(false\);\s+setNewExpense/s);
  assert.match(
    financeSource,
    /setExpenseSubmitError\(\s*error\?\.message\s*\|\|\s*['"]Khong the luu khoan chi\. Vui long thu lai\.['"],?\s*\)/s,
  );
  assert.match(financeSource, /role="alert"/);
});

test('VPS staging exposes explicit order lifecycle controls without automatic stock-out or legacy payment rules', () => {
  assert.match(
    stagingApiSource,
    /async reserveOrder\(id, record = \{\}\) \{[\s\S]*?\/sales\/orders\/\$\{id\}\/reserve/s,
  );
  assert.match(
    stagingApiSource,
    /async releaseOrderReservation\(id, record = \{\}\) \{[\s\S]*?\/sales\/orders\/\$\{id\}\/release-reservation/s,
  );
  assert.match(appSource, /data-vps-order-workflow/);
  assert.match(appSource, /data-vps-order-confirm/);
  assert.match(appSource, /data-vps-order-reserve/);
  assert.match(appSource, /data-vps-order-release/);
  assert.match(
    appSource,
    /Giữ tồn chỉ tạo reservation trên kho VPS;\s*không tự xuất\s*trừ tồn hoặc tự tất toán công nợ\./,
  );
  assert.match(
    appSource,
    /Payment collection is not enabled in the VPS staging order flow\./,
  );
});

test('VPS fulfillment UI preserves real order, reservation, delivery-plan, and ledger lineage', () => {
  assert.match(
    stagingApiSource,
    /async listSalesDeliveryPlans\(query = \{\}\) \{[\s\S]*?\/sales\/delivery-plans/s,
  );
  assert.match(
    stagingApiSource,
    /async createSalesDeliveryPlan\(orderId, record = \{\}\) \{[\s\S]*?\/sales\/orders\/\$\{safeOrderId\}\/delivery-plans/s,
  );
  assert.match(
    stagingApiSource,
    /async listWarehouseDispatches\(query = \{\}\) \{[\s\S]*?\/warehouse-suite\/dispatches/s,
  );
  assert.match(
    stagingApiSource,
    /async reverseWarehouseDispatch\(dispatchId, record = \{\}\) \{[\s\S]*?\/warehouse-suite\/stock-out\/\$\{safeDispatchId\}\/reversals/s,
  );
  assert.match(appSource, /function VpsOrderFulfillmentPanel/);
  assert.match(appSource, /data-vps-order-fulfillment/);
  assert.match(appSource, /data-vps-delivery-plan-create/);
  assert.match(appSource, /data-vps-delivery-dispatch/);
  assert.match(appSource, /!lineage\.deliveryPlanLineId/);
  assert.match(
    appSource,
    /VPS warehouse dispatch must start from a reserved sales order and a persisted delivery-plan line/,
  );
  assert.match(appSource, /referenceId: lineage\.deliveryPlanId/);
  assert.match(appSource, /sourceDispatchId: clientMutationId/);
  assert.match(appSource, /inventoryStatus: 'RESERVED'/);
  assert.match(appSource, /metadata\.deliveryPlanLineId === planLine\.id/);
  assert.match(appSource, /data-vps-dispatch-lineage-required/);
  assert.match(appSource, /data-vps-dispatch-reversals/);
  assert.match(appSource, /data-vps-dispatch-reversal/);
  assert.match(appSource, /returnDisposition: 'RESTORE_RESERVATION'/);
  assert.match(appSource, /original dispatch remains immutable/);
});

test('VPS staging debt and cash UI use their supported Finance contracts and retain tenant guardrails', () => {
  assert.match(appSource, /function VpsDebtLifecyclePanel/);
  assert.match(appSource, /data-vps-debt-lifecycle/);
  assert.match(appSource, /createFinanceReceivable\(/);
  assert.match(appSource, /createFinanceDebtMovement\(/);
  assert.match(appSource, /function VpsFinanceCashPanel/);
  assert.match(appSource, /data-vps-finance-cash/);
  assert.match(appSource, /createFinanceCashAccount\(/);
  assert.match(appSource, /createFinanceCashTransaction\(/);
  assert.match(
    appSource,
    /Giao dịch quỹ được ghi độc lập theo hợp đồng VPS\.\s*Việc tất toán phải thu\s*vẫn thực hiện ở luồng Công nợ VPS\./,
  );
  assert.match(
    stagingApiSource,
    /companyId: _companyId,[\s\S]*?tenantId: _tenantId,[\s\S]*?organizationId: _organizationId/s,
  );
});
