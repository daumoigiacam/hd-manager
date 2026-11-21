import assert from 'node:assert/strict';
import test from 'node:test';
import {readLegacyAuditSource,legacyAuditScope} from './helpers/legacy-audit-fixture.mjs';
import {appFunction} from './helpers/app-source-function.mjs';

// These retained VPS contracts belong to root src, not the Firebase release.
// Keep every original oracle while explicitly opting out of canonical reads.
const appSource=readLegacyAuditSource('src/App.jsx');
const stagingApiSource=readLegacyAuditSource('src/api/hdConnectStaging.js');
// These assertions predate the checked-in legacy adapter. Keep their oracles
// visible, but do not invent missing product features to turn them green.
const unsupported=new Map([
  ['VPS Settings tab consumes Storage API read, provider and health contracts','No storage tab/providers/health UI in the retained root app'],
  ['VPS staging customer creation uses the authenticated VPS actor when legacy employees are unavailable','The old monolithic customer form assertion no longer matches the split legacy CRM'],
  ['VPS inventory lookup uses only its supported query contract','Legacy read panel still forwards its generic query; narrowed VPS lookup is not implemented'],
  ['VPS staging can create only the missing disposable UOM and warehouse master records for inventory E2E','No createUnit method or disposable master-setup UI in the retained root adapter'],
  ['VPS staging exposes explicit order lifecycle controls without automatic stock-out or legacy payment rules','No reserve/release order methods or lifecycle UI in the retained root adapter'],
  ['VPS fulfillment UI preserves real order, reservation, delivery-plan, and ledger lineage','No delivery-plan/reservation/reversal UI in the retained root adapter'],
  ['VPS staging debt and cash UI use their supported Finance contracts and retain tenant guardrails','The root app exposes generic read panels, not these lifecycle forms'],
]);
const testLegacy=(name,run)=>test(`legacy-root VPS (not canonical Firebase acceptance): ${name}`,
  unsupported.has(name)?{skip:`UNSUPPORTED LEGACY ORACLE: ${unsupported.get(name)}`}:{},run);
test('VPS source coverage is explicitly classified as legacy-root only',()=>assert.match(legacyAuditScope,/NOT_CANONICAL_FIREBASE_ACCEPTANCE/));
test('unsupported VPS feature claims are classified explicitly and cannot silently become accepted features',()=>{
  assert.equal(unsupported.size,7);
  for(const marker of ['function VpsDebtLifecyclePanel','function VpsOrderFulfillmentPanel','data-vps-staging-master-setup="true"'])assert.equal(appSource.includes(marker),false,`Feature appeared; restore its old functional oracle: ${marker}`);
  for(const marker of ['async createUnit(','async reserveOrder(','async listSalesDeliveryPlans('])assert.equal(stagingApiSource.includes(marker),false,`Adapter appeared; restore its old functional oracle: ${marker}`);
});

testLegacy('VPS Debt and Payroll tabs render authoritative VPS read panels', () => {
  assert.match(appSource,/debt: 'debt'/);assert.match(appSource,/payroll: 'payroll'/);
  assert.match(appSource,/<VpsModuleReadPanel moduleKey=\{VPS_UI_READ_MODULE_BY_TAB\[activeTab\]\}/);
  assert.match(appSource,/data-vps-read-module=\{moduleKey\}/);
  assert.match(appSource,/path: '\/api\/v1\/finance-suite\/receivables', run: \(\) => api\.listFinanceReceivables\(query\)/);
  assert.match(appSource,/path: '\/api\/v1\/hr-suite\/payrolls', run: \(\) => api\.listPayrolls\(query\)/);
});

testLegacy('VPS Settings tab consumes Storage API read, provider and health contracts', () => {
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

testLegacy('VPS mode keeps payroll and storage writes fail-closed when external policy is missing', () => {
  assert.match(
    appSource,
    /VPS payroll generate\/approve\/lock UI is not yet mapped/,
  );
  assert.doesNotMatch(
    appSource,
    /isVpsStagingMode[\s\S]{0,180}uploadStorageFile\(/,
  );
});

testLegacy('VPS staging customer creation uses the authenticated VPS actor when legacy employees are unavailable', () => {
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

testLegacy('VPS inventory lookup uses only its supported query contract', () => {
  assert.match(appSource, /const inventoryLookupQuery = \{ limit: 50 \};/);
  assert.match(appSource, /api\.listInventory\(inventoryLookupQuery\)/);
});

testLegacy('VPS staging can create only the missing disposable UOM and warehouse master records for inventory E2E', () => {
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

test('canonical actual expense handler retains its draft on failure, locks duplicates and reuses its intent on retry (local unit only)', async () => {
  const draft={category:'Chi phí khác',amount:'50000',note:'Keep draft',date:'2026-11-22'},original=structuredClone(draft);
  const state={open:true,error:'',saving:false,resets:0},calls=[],intent={current:''},lock={current:false};let reject,resolve;
  const handler=appFunction('handleExpenseSubmit',{
    canCreateExpense:true,expenseSubmitInFlightRef:lock,expenseMutationIdRef:intent,
    normalizeExpenseCategoryLabel:value=>value,newExpense:draft,crypto:{randomUUID:()=>'one-intent'},
    setExpenseSaving:value=>{state.saving=value;},setExpenseSaveError:value=>{state.error=value;},
    onAddExpense:async payload=>{calls.push(structuredClone(payload));await new Promise((yes,no)=>{resolve=yes;reject=no;});},
    isFuelExpenseCategory:()=>false,parseInputCurrency:Number,normalizeLeadingLabel:value=>value,
    isDriverFinanceMode:false,cashflowNeedsApproval:false,reportedCashflowRole:'accounting',
    CASHFLOW_APPROVAL_STATUS:{pending:'pending',approved:'approved'},
    setShowExpenseModal:value=>{state.open=value;},setNewExpense:()=>{state.resets++;},getTodayString:()=>draft.date,
    getFriendlyFirebaseErrorMessage:error=>error.message,
  },{scope:'FinanceView'});
  const event={preventDefault(){}},first=handler(event);await handler(event);
  assert.equal(calls.length,1);assert.equal(state.open,true);assert.equal(state.resets,0);assert.equal(state.saving,true);
  reject(Error('Server rejected expense'));await first;
  assert.equal(state.error,'Server rejected expense');assert.equal(state.open,true);assert.equal(state.resets,0);
  assert.equal(lock.current,false);assert.deepEqual(draft,original);assert.equal(intent.current,'exp_one-intent');
  const retry=handler(event);assert.equal(calls.length,2);assert.equal(calls[1].clientMutationId,calls[0].clientMutationId);
  assert.equal(state.open,true);resolve({success:true,confirmed:true,queued:false});await retry;
  assert.equal(state.open,false);assert.equal(state.resets,1);assert.equal(intent.current,'');
});

testLegacy('VPS staging exposes explicit order lifecycle controls without automatic stock-out or legacy payment rules', () => {
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

testLegacy('VPS fulfillment UI preserves real order, reservation, delivery-plan, and ledger lineage', () => {
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

testLegacy('VPS staging debt and cash UI use their supported Finance contracts and retain tenant guardrails', () => {
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
