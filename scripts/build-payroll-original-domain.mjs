// Regenerate the pure payroll snapshot from canonical App, including authored
// top-level catalog initialization. No UI, database, or deployment is loaded.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {extractEmployeeHomeDomain} from '../development/hd-manager/application/scripts/helpers/employee-home-domain-extraction.mjs';
const appDirectory=fileURLToPath(new URL('../development/hd-manager/application/src/',import.meta.url));
const output=path.join(appDirectory,'features/payroll/payrollOriginalDomain.js');
const sharedOutput=path.join(appDirectory,'features/payroll/payrollOriginalShared.js');
const crmFile=path.join(appDirectory,'features/customers/productCRMShared.jsx');
const roots=['buildPayrollViewProjectionSteps','hasCompanyRolePermissionAction','isOwnerAccountUser','isAccountingPosition',
 'isOwnerPosition','calculateMonthRevenue','withSalesRevenueIndex','getEmployeeRolePermissionKey','ROLE_PERMISSION_DEPARTMENTS'];
const source=await fs.readFile(path.join(appDirectory,'App.jsx'),'utf8');
const extracted=extractEmployeeHomeDomain(source,appDirectory,roots);
const crmRoots=parse(extracted,{sourceType:'module'}).program.body.filter(n=>n.type==='ImportDeclaration'&&path.resolve(n.source.value)===crmFile)
 .flatMap(n=>n.specifiers.map(s=>s.imported.name));
// Keep the established shared API while regenerating its exact pure closure.
const sharedRoots=[...new Set([...crmRoots,'getPaymentDateKey'])];
const relativeImports=(text,destination)=>text.replace(/from ("[^"]+")/g,(_match,quoted)=>{
 const target=JSON.parse(quoted);let relative=path.relative(path.dirname(output),target).replaceAll('\\','/');
 if(path.resolve(target)===crmFile)relative='./payrollOriginalShared.js';
 else relative=path.relative(path.dirname(destination),target).replaceAll('\\','/');
 if(!relative.startsWith('.'))relative='./'+relative;
 return 'from '+JSON.stringify(relative);
});
const header='// Generated from canonical source by scripts/build-payroll-original-domain.mjs. Do not edit independently.\n';
const outputs=[[output,header+relativeImports(extracted,output)+'\n'],[sharedOutput,header+relativeImports(
 extractEmployeeHomeDomain(await fs.readFile(crmFile,'utf8'),path.dirname(crmFile),sharedRoots),sharedOutput)+'\n']];
for(const [file,code]of outputs)if(process.argv.includes('--check')){
 if((await fs.readFile(file,'utf8')).replaceAll('\r\n','\n')!==code.replaceAll('\r\n','\n'))throw Error('Canonical payroll domain drift: '+file);
}else await fs.writeFile(file,code.replaceAll('\r\n','\n'));
console.log(JSON.stringify({status:'CANONICAL_PAYROLL_DOMAIN_MATCH',output:path.relative(process.cwd(),output),roots}));
