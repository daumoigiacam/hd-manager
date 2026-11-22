import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {createSettingsSaveController} from '../development/hd-manager/application/src/services/settingsSaveController.js';
import {settingsPercent,settingsMoney} from '../development/hd-manager/application/src/utils/settingsFormValidation.js';

const source = readFileSync(new URL('../development/hd-manager/application/src/App.jsx', import.meta.url), 'utf8');
const viewSource = readFileSync(new URL('../development/hd-manager/application/src/features/legacy/SettingsView.jsx', import.meta.url), 'utf8');
const start = viewSource.indexOf('  const handleLoyaltySettingSubmit = async (event)');
const end = viewSource.indexOf('  const handleCustomerCareSettingSubmit', start);
assert.ok(start>=0&&end>start,'Extract the current canonical settings handler');
function setup(save, allowed = true) {
  const states = { status: '', saving: false };
  const scope = 'loyalty-company-owner';
  const controller = createSettingsSaveController({isCurrent:value=>value===scope,makeId:()=> 'loyalty-test',now:()=> '2026-11-22T00:00:00.000Z'});
  const settingsSave = {scope,isBusy:()=>controller.isBusy(scope),isCurrent:value=>value===scope};
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
    saveScope:scope,settingsSave,settingsPercent,settingsMoney,
    submitSettingsPatch:async(patch,setStatus,successMessage)=>{
      try {await controller.save({scope,patch,baseCompany:{},save});setStatus(successMessage);}
      catch(error){setStatus(error.message);}
    },
  };
  vm.createContext(context);
  const submit = vm.runInContext(`${viewSource.slice(start, end)}; handleLoyaltySettingSubmit`, context);
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
resolveSave({ success: true, confirmed: true, queued: false });
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
for (const receipt of [undefined,{success:false},{success:true,queued:true},{success:true,confirmed:false}]) {
  const unconfirmed=setup(async()=>receipt);await unconfirmed.submit();
  assert.doesNotMatch(unconfirmed.states.status,/Đã lưu/);assert.equal(unconfirmed.states.saving,false);
}
// The parent now uses an actual server transaction instead of a queued save
// receipt. Its executable ACK/CAS/replay oracles live in the canonical
// settings-mutation-integrity suite; publication must still follow its await.
const companySave = source.slice(source.indexOf('const handleUpdateCompanySettings'), source.indexOf('const handleResetCompanyDemoData'));
assert.ok(companySave.includes('await withTimeout(commitSettingsMutation('));
assert.ok(companySave.indexOf('await withTimeout(commitSettingsMutation(')<companySave.indexOf('setCurrentCompany('));
console.log('PASS loyalty save: confirmation, payload, duplicate submission, pending, rejection and permission');
