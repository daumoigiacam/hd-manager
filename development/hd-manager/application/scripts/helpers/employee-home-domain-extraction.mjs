import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default;
const roots=['buildSalaryDetails','buildEmployeeReviewSummary'];
const permittedGlobals=new Set(['Array','Boolean','Date','Intl','Map','Math','Number','Object','Set','String','isNaN','parseFloat','parseInt','undefined']);

// Build-time only: the worker runs the exact existing App formulas. Refuse UI,
// dynamic/network globals or an unsupported closure instead of changing maths.
export function extractEmployeeHomeDomain(source,sourceDirectory,exportedRoots=roots) {
 if(!Array.isArray(exportedRoots)||!exportedRoots.length||exportedRoots.some(name=>!/^[$A-Za-z_][$\w]*$/.test(name)))throw new TypeError('Invalid domain roots');
 const tree=parse(source,{sourceType:'module',plugins:['jsx']});let program;
 traverse(tree,{Program(p){program=p;p.stop()}});
 const declarations=new Map(),imports=new Map(),globals=new Set(),queue=[...exportedRoots],initializers=new Map();
 const dependencies=p=>p.traverse({JSXElement(){throw Error('UI cannot enter employee Home domain')},ReferencedIdentifier(ref){
  const dependency=ref.node.name,b=ref.scope.getBinding(dependency);
  if(!b)globals.add(dependency);else if(b.scope===program.scope&&!declarations.has(dependency)&&!imports.has(dependency))queue.push(dependency);
 }});
 const rootBinding=p=>{
  while(p?.isMemberExpression()||p?.isOptionalMemberExpression())p=p.get('object');
  return p?.isIdentifier()&&p.scope.getBinding(p.node.name)?.scope===program.scope?p.node.name:null;
 };
 // Property writes do not appear in Babel binding.constantViolations. Keep
 // their enclosing top-level statement (including forEach/if initializers)
 // and its dependency closure, in original execution order.
 const mutations=program.get('body').filter(p=>!p.isDeclaration()&&!p.isImportDeclaration()).map(statement=>{
  const writes=new Set(),remember=p=>{const name=rootBinding(p);if(name)writes.add(name);};
  statement.traverse({AssignmentExpression(p){remember(p.get('left'));},UpdateExpression(p){remember(p.get('argument'));},
   CallExpression(p){const callee=p.get('callee');if(!callee.isMemberExpression())return;
    const method=callee.node.computed?callee.node.property.value:callee.node.property.name;
    if(['push','pop','shift','unshift','splice','sort','reverse','set','delete','clear','add','fill','copyWithin'].includes(method))remember(callee.get('object'));
    if(callee.get('object').isIdentifier({name:'Object'})&&['assign','defineProperty','defineProperties'].includes(method))remember(p.get('arguments.0'));
   }});
  return {statement,writes};
 });
 while(queue.length||mutations.some(({statement,writes})=>!initializers.has(statement.node.start)&&[...writes].some(name=>declarations.has(name)))){
 while(queue.length){
  const name=queue.shift();if(declarations.has(name)||imports.has(name))continue;
  const binding=program.scope.getBinding(name);if(!binding){globals.add(name);continue}
  const p=binding.path;
  if(p.isImportSpecifier()||p.isImportDefaultSpecifier()||p.isImportNamespaceSpecifier()){
   const specifier=p.isImportSpecifier()?`{${p.node.imported.name}${p.node.imported.name!==name?' as '+name:''}}`:p.isImportDefaultSpecifier()?name:`* as ${name}`;
   const target=p.parent.source.value;
   if(!target.startsWith('.'))throw Error('Unapproved employee Home domain dependency: '+target);
   imports.set(name,`import ${specifier} from ${JSON.stringify(path.resolve(sourceDirectory,target).replaceAll('\\','/'))};`);continue;
  }
  if(!p.isVariableDeclarator()&&!p.isFunctionDeclaration())throw Error('Unsupported domain binding '+name);
  if(p.isVariableDeclarator()&&p.node.id.type!=='Identifier')throw Error('Destructured domain binding '+name);
  declarations.set(name,p.node);
  dependencies(p);
 }
 for(const {statement,writes} of mutations)if(!initializers.has(statement.node.start)&&[...writes].some(name=>declarations.has(name))){
  initializers.set(statement.node.start,statement.node);dependencies(statement);
 }
 }
 for(const name of globals)if(!permittedGlobals.has(name))throw Error('Unapproved employee Home global '+name);
 return [...imports.values(),...[...declarations.values(),...initializers.values()].sort((a,b)=>a.start-b.start).map(n=>(n.type==='VariableDeclarator'?'const ':'')+source.slice(n.start,n.end)+(n.type==='VariableDeclarator'?';':'')),`export {${exportedRoots.join(',')}};`].join('\n\n');
}

export function employeeHomeDomainPlugin(moduleName='@hd/employee-home-domain',exportedRoots=roots,sourceRelative='src/App.jsx') {
 if(!['src/App.jsx','src/features/customers/productCRMShared.jsx'].includes(sourceRelative))throw new TypeError('Unapproved original domain source');
 const id=moduleName==='@hd/employee-home-domain'?'\0hd-employee-home-domain':'\0'+moduleName;
 return {name:moduleName==='@hd/employee-home-domain'?'hd-employee-home-domain':'hd-employee-home-domain:'+moduleName,resolveId(name){if(name===moduleName)return id},
  async load(name){
   if(name!==id)return;
   const sourceFile=path.resolve(sourceRelative);this.addWatchFile(sourceFile);
   return extractEmployeeHomeDomain(await readFile(sourceFile,'utf8'),path.dirname(sourceFile),exportedRoots);
  }};
}
