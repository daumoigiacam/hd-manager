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
 const declarations=new Map(),imports=new Map(),globals=new Set(),queue=[...exportedRoots];
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
  p.traverse({JSXElement(){throw Error('UI cannot enter employee Home domain '+name)},ReferencedIdentifier(ref){
   const dependency=ref.node.name,b=ref.scope.getBinding(dependency);
   if(!b)globals.add(dependency);else if(b.scope===program.scope&&!declarations.has(dependency)&&!imports.has(dependency))queue.push(dependency);
  }});
 }
 for(const name of globals)if(!permittedGlobals.has(name))throw Error('Unapproved employee Home global '+name);
 return [...imports.values(),...Array.from(declarations.values()).sort((a,b)=>a.start-b.start).map(n=>(n.type==='VariableDeclarator'?'const ':'')+source.slice(n.start,n.end)+(n.type==='VariableDeclarator'?';':'')),`export {${exportedRoots.join(',')}};`].join('\n\n');
}

export function employeeHomeDomainPlugin() {
 const id='\0hd-employee-home-domain';
 return {name:'hd-employee-home-domain',resolveId(name){if(name==='@hd/employee-home-domain')return id},
  async load(name){
   if(name!==id)return;
   const sourceFile=path.resolve('src/App.jsx');this.addWatchFile(sourceFile);
   return extractEmployeeHomeDomain(await readFile(sourceFile,'utf8'),path.dirname(sourceFile));
  }};
}
