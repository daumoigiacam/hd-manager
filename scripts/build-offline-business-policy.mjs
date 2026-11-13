// Reuse the exact accepted Local capability rules; no parallel RBAC policy.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
const input='tools/local-development/api.mjs',source=(await fs.readFile(input,'utf8')).replaceAll('\r\n','\n');
const names=['role','cashCaps','employeeProfileActions','employeeCaps','requestCaps','settlementCaps','attendancePeriodCaps','capabilities'];
const declarations=new Map();
for(const node of parse(source,{sourceType:'module'}).program.body)if(node.type==='VariableDeclaration')for(const d of node.declarations)if(names.includes(d.id.name))declarations.set(d.id.name,'const '+source.slice(d.start,d.end)+';');
if(declarations.size!==names.length)throw Error('Accepted business capability declarations changed');
const prefix=`// Generated from tools/local-development/api.mjs. Do not edit independently.
import projector from './offlineOriginalDomain.cjs';
import cashDomain from './offlineCashflowPolicy.cjs';
import policy from '../offlineCoreAppPolicy.cjs';
import {HOME_PERMISSION_MAPPING} from '../offlineHomeFeed.mjs';
import dispatch from '../offlineWarehouseDispatchCommands.cjs';
import delivery from '../offlineDeliveryCommands.cjs';
import * as advanceDomain from '../../development/hd-manager/application/src/features/payroll/salaryAdvanceProtocol.js';
import * as payrollDomain from '../../development/hd-manager/application/src/features/payroll/offlinePayrollProtocol.js';
import {salarySettlementCapabilities} from '../../development/hd-manager/application/src/features/payroll/payrollSettlementPolicy.js';
const {originalCoreCapabilities}=policy,{deliveryCapabilities}=delivery,{warehouseDispatchCapabilities}=dispatch;
`;
const code=prefix+names.map(name=>declarations.get(name)).join('\n')+'\nexport {capabilities as trustedBusinessCapabilities};\n';
const output='functions/generated/offlineBusinessPolicy.mjs';
if(process.argv.includes('--check')){if((await fs.readFile(output,'utf8')).replaceAll('\r\n','\n')!==code)throw Error('Accepted business capability policy drift');}
else await fs.writeFile(output,code);
console.log(JSON.stringify({status:'CANONICAL_BUSINESS_POLICY_MATCH',input,output,sha256:createHash('sha256').update(code).digest('hex')}));
