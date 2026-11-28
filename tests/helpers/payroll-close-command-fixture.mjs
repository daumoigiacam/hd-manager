import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
import * as firestore from 'firebase/firestore';
import * as locks from '../../development/hd-manager/application/src/utils/payrollPeriodLock.js';
import * as carry from '../../development/hd-manager/application/src/utils/payrollDebtCarryover.js';
import * as integrity from '../../development/hd-manager/application/src/utils/payrollSnapshotIntegrity.js';
import * as commands from '../../development/hd-manager/application/src/utils/payrollCloseTransaction.js';
import * as customerDebt from '../../development/hd-manager/application/src/utils/payrollCustomerDebt.js';

const source = readFileSync(new URL('../../development/hd-manager/application/src/App.jsx',import.meta.url),'utf8');
const tree = parse(source,{sourceType:'module',plugins:['jsx']});
export function payrollCommandSource(name) {
  let found;
  function walk(node) {
    if (!node || typeof node !== 'object' || found) return;
    if (node.type === 'VariableDeclarator' && node.id.name === name) {found=node.init;return;}
    for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(walk);else walk(child);
  }
  walk(tree);
  if (!found) throw Error('Actual payroll command missing: '+name);
  return source.slice(found.start,found.end);
}
export function createPayrollParentCommands(context) {
  const env = {...firestore,...locks,...carry,...integrity,...commands,...customerDebt,...context};
  return Object.fromEntries(['handleLockPayrollPeriod','handleCompletePayrollPolicy'].map(name => [name,
    Function(...Object.keys(env),`return (${payrollCommandSource(name)});`)(...Object.values(env))]));
}
