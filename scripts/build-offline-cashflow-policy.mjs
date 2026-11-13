// Build-time extraction from the canonical business rules. No duplicate
// financial formula, JSX parser or vm dependency is shipped in the API runtime.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';import {parse} from '@babel/parser';import traverseModule from '@babel/traverse';
const root='development/hd-manager/application',files=[root+'/src/features/customers/productCRMShared.jsx',root+'/src/App.jsx'];
const roots=['isOwnerAccountUser','parseLooseMoneyValue','capitalizeFirst','CASHFLOW_APPROVAL_STATUS','normalizeLeadingLabel','normalizeExpenseCategoryLabel','isOrderCodeAutoMatchEnabled','isEmployeeDriverPosition','requiresCashflowApproval'];
const traverse=traverseModule.default||traverseModule,bindings=new Map(),declarations=new Map(),inputs=[];
for(const [index,file]of files.entries()){
 const source=(await fs.readFile(file,'utf8')).replaceAll('\r\n','\n');inputs.push({file,sha256:createHash('sha256').update(source).digest('hex'),normalization:'LF'});
 let program;traverse(parse(source,{sourceType:'module',plugins:['jsx']}),{Program(p){program=p;p.stop();}});
 for(const [name,binding]of Object.entries(program.scope.bindings))if(binding.path.isVariableDeclarator()||binding.path.isFunctionDeclaration())bindings.set(name,{binding,source,index});
}
function collect(name){if(declarations.has(name))return;const entry=bindings.get(name);if(!entry)throw Error('Missing canonical cashflow binding '+name);declarations.set(name,entry);entry.binding.path.traverse({ReferencedIdentifier(p){const b=p.scope.getBinding(p.node.name);if(b&&(b.scope.path.isProgram()||b.kind==='module'))collect(p.node.name);}});}
roots.forEach(collect);
const code='// Generated from canonical source by scripts/build-offline-cashflow-policy.mjs.\n'+[...declarations.values()].sort((a,b)=>a.index-b.index||a.binding.path.node.start-b.binding.path.node.start).map(({binding,source})=>(binding.path.isVariableDeclarator()?'const ':'')+source.slice(binding.path.node.start,binding.path.node.end)+';').join('\n')+'\nmodule.exports={'+roots.join(',')+'};\n';
const output='functions/generated/offlineCashflowPolicy.cjs';
if(process.argv.includes('--check')){if((await fs.readFile(output,'utf8')).replaceAll('\r\n','\n')!==code)throw Error('Canonical cashflow policy drift');}
else{await fs.writeFile(output,code);await fs.writeFile('functions/generated/offlineCashflowPolicy.inputs.json',JSON.stringify({generator:'scripts/build-offline-cashflow-policy.mjs',sourceRoot:root,inputs,sha256:createHash('sha256').update(code).digest('hex')},null,2));}
console.log(JSON.stringify({status:'CANONICAL_POLICY_MATCH',output,sha256:createHash('sha256').update(code).digest('hex')}));
