import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  const handleLoyaltySettingSubmit = async (event)');
const end = source.indexOf('  const handleCustomerCareSettingSubmit', start);
function setup(save, allowed = true) {
  const states = { status: '', saving: false };
  const context = {
    canManageLoyaltySettings: allowed,
    loyaltySaveInFlight: { current: false },
    setIsSavingLoyalty: value => { states.saving = value; },
    setLoyaltySaveStatus: value => { states.status = value; },
    loyaltyForm: { customerLoyaltyEnabled: true, loyaltyEarnMode: 'revenue_percent', loyaltyRevenuePercent: '1', loyaltyEarnAmountPerPoint: '1000', loyaltyRedeemValuePerPoint: '1000', loyaltyEligibilityConditions: { notOverdue: true } },
    parseInputCurrency: Number,
    DEFAULT_CUSTOMER_LOYALTY_SETTINGS: {},
    normalizeLoyaltyEligibilityConditions: value => value,
    getFriendlyFirebaseErrorMessage: error => error.message,
    onUpdateCompanySettings: save,
  };
  vm.createContext(context);
  const submit = vm.runInContext(`${source.slice(start, end)}; handleLoyaltySettingSubmit`, context);
  return { states, submit: () => submit({ preventDefault() {} }) };
}
let resolveSave;
let calls = 0;
const deferred = setup(payload => {
  calls++;
  assert.equal(payload.loyaltyRevenuePercent, 1);
  assert.equal(payload.loyaltyEligibilityConditions.notOverdue, true);
  return new Promise(resolve => { resolveSave = resolve; });
});
const saving = deferred.submit();
assert.equal(deferred.states.saving, true);
await deferred.submit();
assert.equal(calls, 1);
resolveSave({ success: true });
await saving;
assert.equal(deferred.states.saving, false);
assert.match(deferred.states.status, /Đã lưu/);
for (const code of ['firestore/sync-pending', 'permission-denied']) {
  const rejected = setup(async () => { throw Object.assign(new Error('Denied'), { code }); });
  await rejected.submit();
  assert.equal(rejected.states.saving, false);
  assert.doesNotMatch(rejected.states.status, /Đã lưu/);
  assert.ok(rejected.states.status);
}
await setup(() => assert.fail('Unauthorized write'), false).submit();
const companySave = source.slice(source.indexOf('const isLoyaltySettingsUpdate'), source.indexOf('const handleResetCompanyDemoData'));
assert.ok(companySave.indexOf('await requireSharedWriteConfirmation') < companySave.indexOf('return { success: true }'));
assert.match(companySave, /settingsPatch/);
console.log('PASS loyalty save: confirmation, payload, duplicate submission, pending, rejection and permission');
