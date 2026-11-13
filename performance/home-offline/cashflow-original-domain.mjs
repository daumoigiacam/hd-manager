import {readFileSync} from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {parse} from '@babel/parser';import traverseModule from '@babel/traverse';
// Extract the exact current application pure functions; no duplicate accounting formulas.
const shared=readFileSync(path.resolve('development/hd-manager/application/src/features/customers/productCRMShared.jsx'),'utf8');
const app=readFileSync(path.resolve('development/hd-manager/application/src/App.jsx'),'utf8');
const roots=['isOwnerAccountUser','parseLooseMoneyValue','capitalizeFirst','CASHFLOW_APPROVAL_STATUS','normalizeLeadingLabel','normalizeExpenseCategoryLabel','isOrderCodeAutoMatchEnabled','isEmployeeDriverPosition','requiresCashflowApproval'];
const traverse=traverseModule.default||traverseModule,bindings=new Map(),declarations=new Map();
for(const [index,source]of [shared,app].entries()){
  let program;traverse(parse(source,{sourceType:'module',plugins:['jsx']}),{Program(p){program=p;p.stop();}});
  for(const [name,binding]of Object.entries(program.scope.bindings))if(binding.path.isVariableDeclarator()||binding.path.isFunctionDeclaration())bindings.set(name,{binding,source,index});
}
function collect(name){
  if(declarations.has(name))return;
  const entry=bindings.get(name);if(!entry)throw Error('Missing original pure binding '+name);declarations.set(name,entry);
  entry.binding.path.traverse({ReferencedIdentifier(p){const b=p.scope.getBinding(p.node.name);if(b&&(b.scope.path.isProgram()||b.kind==='module'))collect(p.node.name);}});
}
roots.forEach(collect);
export const originalCashflowDomain=Object.freeze(vm.runInNewContext([...declarations.values()].sort((a,b)=>a.index-b.index||a.binding.path.node.start-b.binding.path.node.start)
  .map(({binding,source})=>(binding.path.isVariableDeclarator()?'const ':'')+source.slice(binding.path.node.start,binding.path.node.end)+';').join('\n')+'\n({'+roots.join(',')+'})'));
