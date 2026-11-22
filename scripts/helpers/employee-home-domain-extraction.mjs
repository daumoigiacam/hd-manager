import path from 'node:path';
import {readFileSync,mkdirSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parse} from '@babel/parser';
import {extractEmployeeHomeDomain as extractCanonical} from '../../development/hd-manager/application/scripts/helpers/employee-home-domain-extraction.mjs';
export {employeeHomeDomainPlugin} from '../../development/hd-manager/application/scripts/helpers/employee-home-domain-extraction.mjs';

// Server/test projectors use the same initializer-aware extractor. Keep CRM's
// pure named closure in its own module so it cannot pull React/native UI into a
// private calculation artifact or collide with App's private binding names.
export function extractEmployeeHomeDomain(source,sourceDirectory,roots){
 let code=extractCanonical(source,sourceDirectory,roots);
 const imports=parse(code,{sourceType:'module'}).program.body.filter(node=>node.type==='ImportDeclaration'
  &&node.source.value.replaceAll('\\','/').endsWith('/features/customers/productCRMShared.jsx'));
 if(!imports.length)return code;
 const file=imports[0].source.value;
 if(imports.some(node=>node.source.value!==file||node.specifiers.some(spec=>spec.type!=='ImportSpecifier')))throw Error('Unsupported pure CRM dependency');
 const names=[...new Set(imports.flatMap(node=>node.specifiers.map(spec=>spec.imported.name)))];
 const shared=extractCanonical(readFileSync(file,'utf8'),path.dirname(file),names);
 const directory=fileURLToPath(new URL('../../.artifacts/pure-home-domain/',import.meta.url));
 mkdirSync(directory,{recursive:true});
 const module=path.join(directory,createHash('sha256').update(shared).digest('hex')+'.mjs');
 if(!existsSync(module)){
  const temporary=module+'.'+process.pid+'.tmp';writeFileSync(temporary,shared);renameSync(temporary,module);
 }
 return code.split(JSON.stringify(file)).join(JSON.stringify(module.replaceAll('\\','/')));
}
