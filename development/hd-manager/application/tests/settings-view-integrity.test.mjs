import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {parse} from '@babel/parser';
import {transformSync} from 'esbuild';
import * as icons from 'lucide-react';
import {hooks, nodes, text} from './helpers/react-hook-frame.mjs';
import {createSettingsSaveController} from '../src/services/settingsSaveController.js';
import * as validation from '../src/utils/settingsFormValidation.js';
import {getCompanyBankAccounts, buildCompanyBankAccountUpdate} from '../src/features/settings/companyBankAccounts.js';

const require = createRequire(import.meta.url), event = {preventDefault() {}};
function compile(relative, name, env, capture = '') {
  const source = fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
  const ast = parse(source, {sourceType: 'module', plugins: ['jsx']}); let found;
  function walk(n) {if (!n || typeof n !== 'object') return;
    if (n.type === 'FunctionDeclaration' && n.id?.name === name) found = n;
    for (const value of Object.values(n)) if (Array.isArray(value)) value.forEach(walk); else if (value?.type) walk(value);
  } walk(ast); assert.ok(found, name);
  let code = source.slice(found.start, found.end);
  if (capture) code = code.replace('  if (!canAccessSettings)', `  capture({${capture}});\n  if (!canAccessSettings)`);
  const bindings = Object.entries(env).filter(([key]) => /^[A-Za-z_$][\w$]*$/.test(key) && key !== 'default');
  return Function('require', ...bindings.map(([key]) => key), `${transformSync(code, {loader: 'jsx', jsx: 'automatic', format: 'cjs'}).code}; return ${name};`)(require, ...bindings.map(([,value]) => value));
}
function fixture(overrides = {}) {
  const frame = hooks(), f = {calls: []};
  const env = {...frame, ...icons, ...validation, createSettingsSaveController, getCompanyBankAccounts,
    useAppScreenBack: callback => {f.back = callback;}, capture: api => {f.api = api;},
    window: {dispatchEvent() {}, confirm: () => false}, CustomEvent: class {},
    getInvoiceTransferProfile: company => ({bankId: company.bankId || '', accountNumber: company.bankAccountNumber || ''}),
    DEFAULT_INVOICE_TRANSFER_PROFILE: {template: 'qr_only'},
    getCustomerLoyaltySettings: company => ({enabled: company.customerLoyaltyEnabled === true, earnMode: 'fixed', revenuePercent: 1,
      earnAmountPerPoint: company.loyaltyEarnAmountPerPoint || 100000, redeemValuePerPoint: 1000, eligibilityConditions: {}}),
    normalizeLoyaltyEligibilityConditions: value => value || {}, LOYALTY_ELIGIBILITY_CONDITION_DEFINITIONS: [],
    getCustomerCareSettings: () => ({enabled: false, inactiveDays: 7}), getWarehouseOrderAutoCancelDays: company => company.warehouseOrderAutoCancelDays || 0,
    buildSalaryAdvanceSettingsForm: () => ({salaryAdvancePercent: '', salaryAdvancePercentByDepartment: {}}),
    isOrderCodeAutoMatchEnabled: () => true, formatInputCurrency: String, parseInputCurrency: Number,
    DEFAULT_CUSTOMER_LOYALTY_SETTINGS: {earnAmountPerPoint: 100000, redeemValuePerPoint: 1000}, DEFAULT_CUSTOMER_CARE_SETTINGS: {inactiveDays: 7},
    describeSalaryAdvanceLimitInput: () => 'Không giới hạn', parseSalaryAdvancePercentSettingInput: () => ({isUnlimited: true}),
    RESET_DATA_SCOPE_OPTIONS: [{id: 'messages', label: 'Tin nhắn'}], getAutoBackupStateForCompany: () => ({}), getTodayString: () => '2026-11-22',
    isEmployeeReviewEnabled: company => company.employeeReviewsEnabled !== false, CARE_RULES: [],
    getFriendlyFirebaseErrorMessage: error => error.message, formatCurrency: String,
    EmployeeReviewSettings: () => null, CompanyBankAccounts: () => null, CustomerCareSettings: () => null,
    React: {Suspense: () => null}, LazyIdentitySecurityCenter: () => null, SALARY_ADVANCE_DEPARTMENT_OPTIONS: [],
    shareContentFile: async () => ({status: 'downloaded'}), buildBackupFilename: () => 'qa.json',
    normalizeResetDateKey: value => value, countBackupRecords: value => value.count || 0, readFileAsText: async () => '{"count":1}',
  }; delete env.default;
  Object.assign(env, overrides);
  env.useSettingsSave = compile('../src/hooks/useSettingsSave.js', 'useSettingsSave', env);
  const View = compile('../src/features/legacy/SettingsView.jsx', 'SettingsView', env,
    'handleLoyaltySettingSubmit,handleWarehouseSettingSubmit,handleBubbleSettingSubmit,handleCreateBackupFile,handleRestoreBackupFile,handleResetDemoData,setLoyaltyForm,setWarehouseForm,setBubbleForm,loyaltyForm,warehouseForm,bankSaveStatus,loyaltySaveStatus,warehouseSaveStatus,backupStatus,isBackingUp,isSavingPanel');
  f.props = {readIdentity: 'actor-a', currentUser: {id: 'owner'}, employee: {id: 'owner'}, currentCompany: {id: 'qa', warehouseOrderAutoCancelDays: 0},
    onLogout: () => {f.logouts = (f.logouts || 0) + 1;},
    isAccounting: true, canManageLoyaltySettings: true, canManageWarehouseSettings: true, canManageQuickActionDefaults: true,
    canBackupData: true, canRestoreData: true, canResetCompanyData: true,
    onUpdateCompanySettings: async (patch, options) => {f.calls.push(structuredClone({patch, options})); return {success: true, confirmed: true};}};
  f.render = () => {let again, count = 0; do {assert.ok(count++ < 12); frame.begin(); f.tree = View(f.props); again = frame.commit();} while (again); return f.tree;};
  f.open = label => {const button = nodes(f.tree, n => n.type === 'button' && text(n).startsWith(label))[0]; assert.ok(button, label); button.props.onClick(); f.render();};
  f.env = env; f.unmount = () => frame.unmount(); f.render(); return f;
}

test('actual settings view retains open draft during same-tenant realtime updates and uses the opening snapshot', async () => {
  const f = fixture(); f.open('Xuất kho'); f.api.setWarehouseForm({warehouseOrderAutoCancelDays: '7'}); f.render();
  f.props.currentCompany = {...f.props.currentCompany, warehouseOrderAutoCancelDays: 9, name: 'Concurrent update'}; f.render();
  assert.equal(f.api.warehouseForm.warehouseOrderAutoCancelDays, '7');
  await f.api.handleWarehouseSettingSubmit(event); f.render();
  assert.deepEqual(f.calls[0].patch, {warehouseOrderAutoCancelDays: 7});
  assert.deepEqual(f.calls[0].options.expectedSettings, {warehouseOrderAutoCancelDays: {exists: true, value: 0}});
  assert.match(f.api.warehouseSaveStatus, /Đã lưu/);
});
test('actual settings form keeps rejected draft, blocks duplicate saves/back, and retries the identical command', async () => {
  const f = fixture(); let reject;
  f.props.onUpdateCompanySettings = (patch, options) => {f.calls.push(structuredClone({patch, options})); return new Promise((_, r) => {reject = r;});};
  f.open('Tích điểm'); f.api.setLoyaltyForm(value => ({...value, loyaltyEarnAmountPerPoint: '123000'})); f.render();
  const first = f.api.handleLoyaltySettingSubmit(event); await f.api.handleLoyaltySettingSubmit(event);
  assert.equal(f.calls.length, 1); assert.equal(f.back(), true); f.render(); assert.equal(f.api.isSavingPanel, true);
  reject(Error('Server rejected QA')); await first; f.render();
  assert.equal(f.api.loyaltyForm.loyaltyEarnAmountPerPoint, '123000'); assert.match(f.api.loyaltySaveStatus, /Server rejected/);
  f.props.onUpdateCompanySettings = async (patch, options) => {f.calls.push(structuredClone({patch, options})); return {success: true, confirmed: true};};
  f.render(); await f.api.handleLoyaltySettingSubmit(event); f.render(); assert.deepEqual(f.calls[1], f.calls[0]);
});
test('actual settings rejects invalid money/day values without writing or silently removing minus signs', async () => {
  const f = fixture(); f.open('Tích điểm'); f.api.setLoyaltyForm(value => ({...value, loyaltyEarnAmountPerPoint: '-1000'})); f.render();
  await f.api.handleLoyaltySettingSubmit(event); f.render(); assert.equal(f.calls.length, 0); assert.doesNotMatch(f.api.loyaltySaveStatus, /Đã lưu/);
  f.back(); f.render(); f.open('Xuất kho'); f.api.setWarehouseForm({warehouseOrderAutoCancelDays: '-7'}); f.render();
  await f.api.handleWarehouseSettingSubmit(event); f.render(); assert.equal(f.calls.length, 0); assert.ok(f.api.warehouseSaveStatus);
});
test('legacy view-settings flag cannot grant configuration, payroll limit, bank, backup or reset panels', () => {
  const f = fixture(); for (const key of Object.keys(f.props).filter(key => key.startsWith('can'))) f.props[key] = false;
  f.render(); const labels = nodes(f.tree, n => n.type === 'button').map(text);
  assert.deepEqual(labels, ['Bảo mật tài khoảnMật khẩu, PIN và thiết bị tin cậy', 'Đăng xuất']);
  nodes(f.tree, n => n.type === 'button').at(-1).props.onClick();
  assert.equal(f.logouts, 1);
});
test('late settings acknowledgement after account/permission change cannot restore its old panel or status', async () => {
  const f = fixture(); let finish;
  f.props.onUpdateCompanySettings = () => new Promise(resolve => {finish = resolve;}); f.open('Xuất kho');
  f.api.setWarehouseForm({warehouseOrderAutoCancelDays: '7'}); f.render(); const pending = f.api.handleWarehouseSettingSubmit(event);
  f.props.readIdentity = 'actor-b'; f.props.currentCompany = {id: 'tenant-b'}; f.render(); finish({success: true, confirmed: true}); await pending; f.render();
  assert.equal(f.tree.props['data-settings-page'], 'menu'); assert.equal(f.api.warehouseSaveStatus, ''); assert.equal(f.api.isSavingPanel, false);
});
test('backup double-click is locked and account change prevents exporting stale private data', async () => {
  const f = fixture(); let finish, calls = 0;
  f.props.onCreateCompanyBackup = () => {calls++; return new Promise(resolve => {finish = resolve;});}; f.render();
  const pending = f.api.handleCreateBackupFile(); await f.api.handleCreateBackupFile(); assert.equal(calls, 1);
  f.props.readIdentity = 'replacement-session'; f.render(); finish({success: true, backup: {private: 'old'}, count: 1}); await pending; f.render();
  assert.equal(f.api.backupStatus, '');
});
test('actual restore keeps one command after rejection and blocks duplicate file submissions until ACK', async () => {
  const f=fixture(); f.env.window.confirm=()=>true; let reject;
  f.props.onRestoreCompanyBackup=(payload,metadata)=>{f.calls.push(structuredClone({payload,metadata}));return new Promise((_,r)=>{reject=r;});};f.render();
  const fileEvent=()=>({target:{files:[{name:'qa.json'}],value:'selected'}});
  const pending=f.api.handleRestoreBackupFile(fileEvent());await Promise.resolve();await Promise.resolve();
  await f.api.handleRestoreBackupFile(fileEvent());assert.equal(f.calls.length,1);
  reject(Error('Partial prefix ACK lost'));await pending;f.render();assert.match(f.api.backupStatus,/Partial prefix/);
  f.props.onRestoreCompanyBackup=async(payload,metadata)=>{f.calls.push(structuredClone({payload,metadata}));return{success:true,confirmed:true};};f.render();
  await f.api.handleRestoreBackupFile(fileEvent());f.render();assert.deepEqual(f.calls[1],f.calls[0]);assert.match(f.api.backupStatus,/Đã khôi phục/);
});
test('actual malformed backup file produces a localized validation message without any restore call', async () => {
  const f=fixture({readFileAsText:async()=>'{broken-json'});
  f.props.onRestoreCompanyBackup=()=>assert.fail('Malformed JSON must not reach persistence');f.render();
  await f.api.handleRestoreBackupFile({target:{files:[{}],value:'selected'}});f.render();
  assert.equal(f.api.backupStatus,'File sao lưu không phải JSON hợp lệ. Vui lòng chọn lại file.');
});
test('file decoding completed after switching account cannot confirm or submit a restore', async () => {
  const f=fixture();let finish,confirmed=0;
  f.env.window.confirm=()=>{confirmed++;return true;};f.env.readFileAsText=()=>new Promise(resolve=>{finish=resolve;});
  // Recompile with this controlled file-reader to exercise the actual callback.
  const frame=hooks(), context={...f.env,...frame};
  context.useSettingsSave=compile('../src/hooks/useSettingsSave.js','useSettingsSave',context);
  context.capture=api=>{f.api=api;};
  const View=compile('../src/features/legacy/SettingsView.jsx','SettingsView',context,'handleRestoreBackupFile');
  const render=()=>{let again,count=0;do{assert.ok(count++<12);frame.begin();View(f.props);again=frame.commit();}while(again);};
  f.props.onRestoreCompanyBackup=()=>assert.fail('Stale file must not restore');render();
  const pending=f.api.handleRestoreBackupFile({target:{files:[{}],value:'selected'}});f.props.readIdentity='new-actor';render();
  finish('{"count":1}');await pending;assert.equal(confirmed,0);
});

function childFixture(kind) {
  const frame=hooks(), f={calls:[]};
  const env={...frame,...icons,...validation,getCompanyBankAccounts,buildCompanyBankAccountUpdate,
    CARE_RULES:[['inactive','Khách lâu chưa mua','QA default'],['holiday','Ngày lễ','QA holiday']]};delete env.default;
  const isBank=kind==='bank', name=isBank?'CompanyBankAccounts':'CustomerCareSettings';
  const View=compile(`../src/features/settings/${name}.jsx`,name,env);
  const account={id:'bank-a',bankId:'VCB',bankName:'Vietcombank',bankAccountName:'QA',bankAccountNumber:'0000123'};
  f.props={scope:'tenant/actor',company:{id:'qa',companyBankAccounts:[account],customerCareRules:{payment:{enabled:false,message:'Untouched'}}},
    banks:[{value:'VCB',label:'Vietcombank'}],canEdit:true,draft:null,selected:'',
    setDraft:next=>{f.props.draft=typeof next==='function'?next(f.props.draft):next;},onSelect:value=>{f.props.selected=value;},
    onSave:async(patch,options)=>{f.calls.push(structuredClone({patch,options}));return{success:true,confirmed:true};}};
  f.render=()=>{let again,count=0;do{assert.ok(count++<10);frame.begin();f.tree=View(f.props);again=frame.commit();}while(again);return f.tree;};
  f.submit=()=>nodes(f.tree,n=>n.type==='form')[0].props.onSubmit(event);
  f.input=(label,value)=>{const group=nodes(f.tree,n=>n.type==='label'&&text(n).startsWith(label))[0];assert.ok(group,label);
    const input=nodes(group,n=>['input','textarea','select'].includes(n.type))[0];input.props.onChange({target:{value,checked:value}});f.render();};
  f.open=()=>{nodes(f.tree,n=>n.type==='button'&&!n.props['aria-label'])[0].props.onClick();f.render();};
  f.unmount=()=>frame.unmount();f.render();return f;
}
test('actual bank account form retains legacy optional defaults, opening snapshot and failed draft on duplicate submission',async()=>{
  const f=childFixture('bank');let reject;f.props.onSave=(patch,options)=>{f.calls.push(structuredClone({patch,options}));return new Promise((_,r)=>{reject=r;});};
  f.open();f.input('Số tài khoản','0000456');
  f.props.company={...f.props.company,companyBankAccounts:[...f.props.company.companyBankAccounts,{id:'concurrent'}]};f.render();
  const pending=f.submit();await f.submit();assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.baseCompany.companyBankAccounts.length,1);
  reject(Error('Bank conflict'));await pending;f.render();assert.match(text(f.tree),/Bank conflict/);assert.equal(f.props.draft.bankAccountNumber,'0000456');
  f.props.onSave=async()=>({success:true,queued:true});f.render();await f.submit();f.render();assert.match(text(f.tree),/chưa xác nhận/);
});
test('actual bank QR-only form disables bank edits and saves only the primary QR template',async()=>{
  const f=childFixture('bank');f.props.canManageAccounts=false;f.props.canManageQr=true;f.render();
  assert.equal(nodes(f.tree,n=>n.props['aria-label']==='Thêm tài khoản ngân hàng').length,0);f.open();
  const accountInput=nodes(f.tree,n=>n.type==='input'&&n.props.value==='0000123')[0];assert.equal(accountInput.props.disabled,true);
  f.input('Mẫu QR','compact');await f.submit();assert.deepEqual(f.calls[0].patch,{invoiceQrTemplate:'compact'});
});
test('actual care form validates day boundaries, preserves unrelated rules and stable enabledAt after failure',async()=>{
  const f=childFixture('care');f.open();f.input('Số ngày chưa mua','-7');await f.submit();f.render();assert.equal(f.calls.length,0);assert.match(text(f.tree),/chưa mua/);
  f.input('Số ngày chưa mua','30');f.input('Trạng thái',true);f.input('Nội dung tin nhắn','QA saved care');
  f.props.onSave=async(patch,options)=>{f.calls.push(structuredClone({patch,options}));throw Error('QA offline');};f.render();
  await f.submit();f.render();assert.match(text(f.tree),/QA offline/);
  f.props.company={...f.props.company,customerCareRules:{payment:{enabled:true,message:'Concurrent'}}};f.render();await f.submit();f.render();
  assert.deepEqual(f.calls[1],f.calls[0]);assert.equal(f.calls[0].patch.customerCareRules.payment.message,'Untouched');
  assert.equal(f.calls[0].patch.customerCareRules.inactive.inactiveDays,30);assert.ok(f.calls[0].patch.customerCareRules.inactive.enabledAt);
});
test('care duplicate submission is locked and late acknowledgement after unmount cannot publish success',async()=>{
  const f=childFixture('care');f.open();let finish;
  f.props.onSave=patch=>{f.calls.push(patch);return new Promise(resolve=>{finish=resolve;});};f.render();
  const pending=f.submit();await f.submit();assert.equal(f.calls.length,1);f.unmount();finish({success:true,confirmed:true});await pending;
  f.render();assert.doesNotMatch(text(f.tree),/Đã lưu/);
});
