import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { parse } from '@babel/parser';
import {appExpression} from './helpers/app-source-function.mjs';
import {assertAuditedMutationWiring,auditedMutationWiring} from './helpers/audited-handler-gates.mjs';
import '../development/hd-manager/application/tests/settings-save-integrity.test.mjs';
import '../development/hd-manager/application/tests/settings-view-integrity.test.mjs';
import './business-report-finance.test.mjs';
import './business-report-cash-expense.test.mjs';
import './operating-expense-detail.test.mjs';
import './report-expense-list.test.mjs';

const baseline = '4db424a3e511bc2a24162245e7423478da9f89c8';
const files = [
  'src/design-system/ListPagination.jsx',
  'src/features/attendance/AttendanceRoleSelector.jsx',
  'src/features/employees/EmployeeBankQr.jsx', 'src/features/orders/CoreRowPager.jsx',
  'src/layout/SyncQueueStatus.jsx',
];
const cleanNode = node => JSON.parse(JSON.stringify(node, (key, value) =>
  ['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key) ? undefined : value));
for (const file of files) {
  test(`${file}: executable AST and module loading remain unchanged`, () => {
    const before = execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const after = fs.readFileSync(file, 'utf8');
    const parseBody = source => parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body;
    const a = parseBody(before);
    const b = parseBody(after);
    const imports = nodes => nodes.filter(node => node.type === 'ImportDeclaration');
    assert.deepEqual(imports(b).map(node => node.source.value), imports(a).map(node => node.source.value));
    assert.deepEqual(cleanNode(b.filter(node => node.type !== 'ImportDeclaration')),
      cleanNode(a.filter(node => node.type !== 'ImportDeclaration')));
    const oldBindings = imports(a).flatMap(node => node.specifiers.map(spec => spec.local.name));
    const newBindings = imports(b).flatMap(node => node.specifiers.map(spec => spec.local.name));
    const bodyText = b.filter(node => node.type !== 'ImportDeclaration').map(node => after.slice(node.start, node.end)).join('\n');
    for (const name of oldBindings.filter(name => !newBindings.includes(name))) {
      assert.doesNotMatch(bodyText, new RegExp(`\\b${name}\\b`), `Removed binding ${name} is referenced`);
    }
  });
}

test('canonical App uses audited behavior gates instead of an obsolete whole-file cleanup parity claim',()=>{
  assertAuditedMutationWiring(new Map(Object.keys(auditedMutationWiring).map(name=>[name,appExpression(name)])));
});

const parseBody=source=>parse(source,{sourceType:'module',plugins:['jsx']}).program.body;
const declarations=source=>new Map(parseBody(source).flatMap(row=>{
  const node=row.type==='ExportNamedDeclaration'||row.type==='ExportDefaultDeclaration'?row.declaration:row;
  if(node?.type==='FunctionDeclaration')return [[node.id.name,node]];
  if(node?.type==='VariableDeclaration')return node.declarations.map(item=>[item.id.name,item.init]);
  return [];
}));
const frozen=file=>execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8',maxBuffer:16*1024*1024});

test('canonical report retains all unaffected frozen declarations; changed presentation uses actual financial goldens',()=>{
  const file='src/features/business-report/BusinessReportWorkspace.jsx',before=declarations(frozen(file)),after=declarations(fs.readFileSync(file,'utf8'));
  // These six declarations changed during accepted report/presentation work;
  // the imported current financial suites retain numeric/date/payroll oracles.
  const changed=new Set(['routeTitles','ProductRows','SalesEmployeeRows','ReportDateFilter','BusinessReportWorkspace','CostReport']);
  assert.deepEqual([...after.keys()].filter(name=>name!=='OperatingExpenseDetails'),[...before.keys()]);
  assert.ok(after.has('OperatingExpenseDetails'));
  assert.match(JSON.stringify(after.get('OperatingExpenseDetails')), /"name":"getOperatingExpenseItems"/,
    'The added drilldown uses the independently tested period/payroll/cost-of-goods filter');
  let locked=0;
  for(const [name,node]of before)if(!changed.has(name)){
    assert.deepEqual(cleanNode(after.get(name)),cleanNode(node),name);locked++;
  }
  assert.equal(locked,18);
});

for(const component of ['CompanyBankAccounts','CustomerCareSettings'])test(`canonical ${component} preserves its callback API and runs current actual-component failure/scope gates`,()=>{
  const file=`src/features/settings/${component}.jsx`,before=declarations(frozen(file)),after=declarations(fs.readFileSync(file,'utf8'));
  assert.ok(before.has(component));assert.ok(after.has(component));
  const keys=node=>node.params[0].properties.map(item=>item.key?.name).filter(Boolean);
  for(const key of keys(before.get(component)))assert.ok(keys(after.get(component)).includes(key),`${component}: ${key}`);
  if(component==='CustomerCareSettings')assert.deepEqual(cleanNode(after.get('CARE_RULES')),cleanNode(before.get('CARE_RULES')));
});
