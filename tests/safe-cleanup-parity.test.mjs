import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { parse } from '@babel/parser';

const baseline = '4db424a3e511bc2a24162245e7423478da9f89c8';
const files = [
  'src/App.jsx', 'src/design-system/ListPagination.jsx',
  'src/features/attendance/AttendanceRoleSelector.jsx',
  'src/features/business-report/BusinessReportWorkspace.jsx',
  'src/features/employees/EmployeeBankQr.jsx', 'src/features/orders/CoreRowPager.jsx',
  'src/features/settings/CompanyBankAccounts.jsx', 'src/features/settings/CustomerCareSettings.jsx',
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
