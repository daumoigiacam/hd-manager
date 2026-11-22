import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsSaveController} from '../src/services/settingsSaveController.js';
import {settingsInteger, settingsMoney, settingsPercent} from '../src/utils/settingsFormValidation.js';
import {buildCompanyBankAccountUpdate} from '../src/features/settings/companyBankAccounts.js';

const ack = {success: true, confirmed: true, queued: false};
function fixture() {
  const context = {scope: 'tenant-a/actor-a'}, calls = [];
  const controller = createSettingsSaveController({isCurrent: scope => context.scope === scope});
  const input = {scope: context.scope, patch: {floatingQuickActionEnabled: false}, baseCompany: {floatingQuickActionEnabled: true},
    save: async (patch, options) => {calls.push(structuredClone({patch, options})); return ack;}};
  return {controller, input, context, calls};
}
test('settings commands carry only exact changed keys and compare the draft opening snapshot', async () => {
  const f = fixture(); f.input.baseCompany.bankAccountNumber = 'PRIVATE-UNCHANGED';
  await f.controller.save(f.input);
  assert.deepEqual(f.calls[0].patch, {floatingQuickActionEnabled: false});
  assert.deepEqual(f.calls[0].options.expectedSettings, {floatingQuickActionEnabled: {exists: true, value: true}});
  assert.ok(f.calls[0].options.clientCommandId); assert.ok(f.calls[0].options.clientMutationAt);
});
test('absent fields are distinguished from explicit null, false and zero settings', async () => {
  const f = fixture(); f.input.patch = {newField: false, nullable: 0}; f.input.baseCompany = {nullable: null};
  await f.controller.save(f.input);
  assert.deepEqual(f.calls[0].options.expectedSettings, {newField: {exists: false}, nullable: {exists: true, value: null}});
});
test('duplicate clicks share one in-flight operation; rejected command retries identical immutable metadata', async () => {
  const f = fixture(); let reject;
  f.input.save = (patch, options) => {f.calls.push(structuredClone({patch, options})); return new Promise((_, r) => {reject = r;});};
  const pending = f.controller.save(f.input);
  await assert.rejects(f.controller.save(f.input), {code: 'settings/save-busy'});
  assert.equal(f.calls.length, 1); reject(Error('ACK lost')); await assert.rejects(pending, /ACK lost/);
  f.input.save = async (patch, options) => {f.calls.push(structuredClone({patch, options})); return ack;};
  await f.controller.save(f.input); assert.deepEqual(f.calls[1], f.calls[0]);
  f.input.patch = {floatingQuickActionEnabled: true}; await f.controller.save(f.input);
  assert.notEqual(f.calls[2].options.clientCommandId, f.calls[0].options.clientCommandId);
});
test('missing, pending, queued or false receipts never report settings success', async () => {
  for (const receipt of [undefined, false, {}, {success: true}, {success: true, confirmed: false}, {...ack, queued: true}, {...ack, pending: true}]) {
    const f = fixture(); f.input.save = async () => receipt;
    await assert.rejects(f.controller.save(f.input), {code: 'settings/unconfirmed'});
  }
});
test('scope change before dispatch or after acknowledgement cannot publish another account success', async () => {
  const f = fixture(); f.context.scope = 'tenant-b/actor-b';
  await assert.rejects(f.controller.save(f.input), {code: 'settings/stale-scope'}); assert.equal(f.calls.length, 0);
  f.context.scope = f.input.scope; let finish;
  f.input.save = () => new Promise(resolve => {finish = resolve;});
  const pending = f.controller.save(f.input); f.context.scope = 'new-session'; finish(ack);
  await assert.rejects(pending, {code: 'settings/stale-scope'}); assert.equal(f.controller.isBusy(f.input.scope), false);
});
test('settings numeric validation preserves valid decimal percent and rejects malformed/negative/lossy inputs', () => {
  assert.equal(settingsPercent('1,5'), 1.5); assert.equal(settingsPercent('100'), 100);
  assert.equal(settingsMoney('100.000', 'Tiền'), 100000); assert.equal(settingsMoney('0000123', 'Tiền'), 123);
  assert.equal(settingsInteger('', {blank: 0}), 0); assert.equal(settingsInteger('3650', {min: 1, max: 3650}), 3650);
  for (const value of ['-1', 'abc', '1e2', '1..5', '101', 'Infinity']) assert.throws(() => settingsPercent(value), value);
  for (const value of ['-10.000', '0', '', '12abc', '12.34', '9007199254740992']) assert.throws(() => settingsMoney(value, 'Tiền'), value);
  for (const value of ['-1', '1.5', '1abc', '9007199254740992']) assert.throws(() => settingsInteger(value), value);
});
test('legacy bank accounts missing optional fields can be edited without losing leading zeros or unrelated accounts', () => {
  const legacy = {id: 'a', bankId: ' vcb ', bankName: 'Vietcombank', bankAccountName: 'QA', bankAccountNumber: '00 1234'};
  const other = {id: 'b', bankId: 'BIDV', bankAccountNumber: '0099', metadata: 'keep'};
  const company = {companyBankAccounts: [legacy, other], primaryCompanyBankAccountId: 'a'};
  const before = structuredClone(company), patch = buildCompanyBankAccountUpdate(company, legacy, true);
  assert.equal(patch.bankAccountNumber, '001234'); assert.equal(patch.sepayVirtualAccountNumber, '');
  assert.deepEqual(patch.companyBankAccounts[1], other); assert.deepEqual(company, before);
  assert.throws(() => buildCompanyBankAccountUpdate(company, {...legacy, id: 'duplicate'}, false), /đã có/);
});
test('QR-only permission produces a QR patch without rewriting bank accounts; bank-only save preserves QR policy', () => {
  const account = {id:'primary',bankId:'VCB',bankName:'Vietcombank',bankAccountName:'QA',bankAccountNumber:'0001',invoiceQrTemplate:'print'};
  const company = {companyBankAccounts:[account],primaryCompanyBankAccountId:'primary'};
  assert.deepEqual(buildCompanyBankAccountUpdate(company,{...account,invoiceQrTemplate:'compact'},false,{canManageAccounts:false,canManageQr:true}),{invoiceQrTemplate:'compact'});
  assert.throws(()=>buildCompanyBankAccountUpdate(company,{...account,id:'other'},false,{canManageAccounts:false,canManageQr:true}),/chưa được cấp quyền/);
  const bankOnly = buildCompanyBankAccountUpdate(company,{...account,invoiceQrTemplate:'compact',bankAccountNumber:'0002'},true,{canManageAccounts:true,canManageQr:false});
  assert.equal(bankOnly.invoiceQrTemplate,undefined);assert.equal(bankOnly.companyBankAccounts[0].invoiceQrTemplate,'print');assert.equal(bankOnly.bankAccountNumber,'0002');
});
