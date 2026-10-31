import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const app = parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body
  .find(node => node.type === 'ExportDefaultDeclaration' && node.declaration.id?.name === 'App').declaration;
const names = new Set(['isCustomerSession', 'employeeInfo', 'backupRoleActions',
  'canAutomaticallyBackUpCompany', 'automaticBackupAccessRef']);
// Preserve authored execution order. Injecting isCustomerSession as a fixture
// parameter would hide a temporal-dead-zone failure after successful login.
const statements = app.body.body.filter(node => (
  node.type === 'VariableDeclaration' && node.declarations.some(d => names.has(d.id.name))
) || (node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression'
  && node.expression.left.object?.name === 'automaticBackupAccessRef'));
assert.equal(statements.length, 6);
const run = new Function('currentUser', 'employees', 'currentCompany', 'myCompanyId', 'firebaseUser',
  'useMemo', 'useRef', 'getCompanyEffectiveRolePermissionActions', 'isOwnerAccountUser',
  statements.map(node => source.slice(node.start, node.end)).join('\n')
    + '\nreturn {isCustomerSession,employeeInfo,canAutomaticallyBackUpCompany,access:automaticBackupAccessRef.current};');

test('actual ordered App initialization handles login, staff hydration, customer and sign-out without TDZ', () => {
  const staff = { id: 'staff', role: 'employee', position: 'Kinh doanh' };
  const owner = { id: 'owner', role: 'super_admin' };
  const customer = { id: 'customer', accountType: 'customer', role: 'customer' };
  const hydrated = { ...staff, name: 'Fixture staff' };
  for (const [currentUser, employees, isCustomer, allowed] of [
    [null, [], false, false], [staff, [], false, false], [staff, [hydrated], false, false],
    [owner, [], false, true], [customer, [], true, false], [null, [hydrated], false, false]
  ]) {
    const result = run(currentUser, employees, { id: 'fixture-company' }, 'fixture-company', { uid: 'fixture-user' },
      callback => callback(), value => ({ current: value }), () => ({}),
      (_employee, user) => user?.role === 'super_admin');
    assert.equal(result.isCustomerSession, isCustomer);
    assert.equal(result.canAutomaticallyBackUpCompany, allowed);
    assert.equal(result.employeeInfo, currentUser === staff && employees.length ? hydrated : currentUser);
    assert.deepEqual(result.access, { allowed, companyId: 'fixture-company', uid: 'fixture-user' });
  }
});
