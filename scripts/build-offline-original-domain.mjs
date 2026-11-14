// Generate the server projection from the exact canonical Web/Android formulas.
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {parse} from '@babel/parser';
import {extractEmployeeHomeDomain} from '../development/hd-manager/application/scripts/helpers/employee-home-domain-extraction.mjs';
import {COMPANY_HOME_ROOTS} from '../development/hd-manager/application/scripts/helpers/company-home-domain.mjs';
const root=path.resolve('development/hd-manager/application/src');
const source=await fs.readFile(path.join(root,'App.jsx'),'utf8');
const domain='import {BusinessDate as Date} from '+JSON.stringify(path.join(root,'utils/businessDate.js').replaceAll('\\','/'))+';\n'+extractEmployeeHomeDomain(source,root,COMPANY_HOME_ROOTS);
const crmFile=path.join(root,'features/customers/productCRMShared.jsx');
const crmRoots=parse(domain,{sourceType:'module'}).program.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value.endsWith('/productCRMShared.jsx')).flatMap(n=>n.specifiers.map(s=>s.imported.name));
const crmDomain='import {BusinessDate as Date} from '+JSON.stringify(path.join(root,'utils/businessDate.js').replaceAll('\\','/'))+';\n'+extractEmployeeHomeDomain(await fs.readFile(crmFile,'utf8'),path.dirname(crmFile),crmRoots);
const contents=`export {projectCompanyHome,HOME_FEED_SOURCES} from './services/companyHomeProjection.js';
export {buildHomeProductDetail} from './services/executiveDashboardService.js';
export {hasCompanyRolePermissionAction,buildOrderDuplicateSignature,resolveCashflowDateKey} from '@hd/company-home-domain';`;
const result=await build({stdin:{contents,resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs',target:'node22',metafile:true,
 plugins:[{name:'canonical-company-home',setup(builder){builder.onResolve({filter:/^@hd\/company-home-domain$/},()=>({path:'company-home',namespace:'hd-domain'}));builder.onLoad({filter:/.*/,namespace:'hd-domain'},()=>({contents:domain,resolveDir:root,loader:'js'}));builder.onLoad({filter:/productCRMShared\.jsx$/},()=>({contents:crmDomain,resolveDir:path.dirname(crmFile),loader:'js'}));}}]});
if(Object.keys(result.metafile.inputs).some(name=>/node_modules|firebase|capacitor/i.test(name)||/\.jsx$/i.test(name)&&!name.endsWith('/productCRMShared.jsx')))throw Error('UI or network dependency entered the financial projector');
const output='functions/generated/offlineOriginalDomain.cjs',code=result.outputFiles[0].text.replaceAll(path.resolve('.').replaceAll('\\','/')+'/','');
if(process.argv.includes('--check')){if((await fs.readFile(output,'utf8')).replaceAll('\r\n','\n')!==code)throw Error('Canonical financial projector drift');}
else await fs.writeFile(output,code);
console.log(JSON.stringify({status:'CANONICAL_FINANCIAL_PROJECTOR_MATCH',output,inputCount:Object.keys(result.metafile.inputs).length}));
