import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {build} from 'esbuild';
const traverse=traverseModule.default;
const roots=['buildSalaryDetails','buildEmployeeReviewSummary'];
const permittedGlobals=new Set(['Array','Boolean','Date','Intl','Map','Math','Number','Object','Set','String','isNaN','parseFloat','parseInt','undefined']);
// This prototype only generates local test artifacts. It never changes App,
// ships a new endpoint, reads a database, or persists a materialized view.
const output=process.env.HD_HOME_DOMAIN_OUTPUT||'test-results/perf-target-20261102/home-domain';
if(!output.startsWith('test-results/')||output.includes('..'))throw Error('A local test-results directory is required.');
await fs.mkdir(output,{recursive:true});
const source=await fs.readFile('src/App.jsx','utf8'),tree=parse(source,{sourceType:'module',plugins:['jsx']});let program;
traverse(tree,{Program(p){program=p;p.stop()}});
const declarations=new Map(),imports=new Map(),globals=new Set(),queue=[...roots];
while(queue.length){
 const name=queue.shift();if(declarations.has(name)||imports.has(name))continue;
 const binding=program.scope.getBinding(name);if(!binding){globals.add(name);continue}
 const p=binding.path;
 if(p.isImportSpecifier()||p.isImportDefaultSpecifier()||p.isImportNamespaceSpecifier()){
  const specifier=p.isImportSpecifier()?`{${p.node.imported.name}${p.node.imported.name!==name?' as '+name:''}}`:p.isImportDefaultSpecifier()?name:`* as ${name}`;
  imports.set(name,`import ${specifier} from ${JSON.stringify(p.parent.source.value)};`);continue;
 }
 if(!p.isVariableDeclarator()&&!p.isFunctionDeclaration())throw Error('Unsupported domain binding '+name);
 if(p.isVariableDeclarator()&&p.node.id.type!=='Identifier')throw Error('Destructured domain binding '+name);
 declarations.set(name,p.node);
 p.traverse({JSXElement(){throw Error('UI cannot enter server domain '+name)},ReferencedIdentifier(ref){
  const dependency=ref.node.name,b=ref.scope.getBinding(dependency);
  if(!b)globals.add(dependency);else if(b.scope===program.scope&&!declarations.has(dependency)&&!imports.has(dependency))queue.push(dependency);
 }});
}
for(const name of globals)if(!permittedGlobals.has(name))throw Error('Unapproved domain global '+name);
const domain=[...imports.values(),...Array.from(declarations.values()).sort((a,b)=>a.start-b.start).map(n=>(n.type==='VariableDeclarator'?'const ':'')+source.slice(n.start,n.end)+(n.type==='VariableDeclarator'?';':'')),`export {${roots.join(',')}};`].join('\n\n');
const result=await build({stdin:{contents:domain,resolveDir:path.resolve('src'),sourcefile:'actual-App-employee-home-domain.js'},bundle:true,write:false,platform:'node',format:'cjs',target:'node22',metafile:true});
const inputs=Object.keys(result.metafile.inputs);
if(inputs.some(name=>/firebase|capacitor|react|App\.jsx/i.test(name)))throw Error('UI/network SDK unexpectedly entered server domain.');
const bundle=result.outputFiles[0].text;
await fs.writeFile(output+'/employeeHomeDomain.cjs',bundle);
const evidence={at:new Date().toISOString(),roots,declarations:declarations.size,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),bundleSha256:crypto.createHash('sha256').update(bundle).digest('hex'),inputs,
 scope:'Local prototype of existing salary/review domain code extracted verbatim from current App with its complete static dependency closure. No new or modified financial formula. This is not a deployed API, a performance result, or financial parity acceptance.'};
await fs.writeFile(output+'/manifest.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify({declarations:declarations.size,bytes:Buffer.byteLength(bundle),inputs:inputs.length,sourceSha256:evidence.sourceSha256}));
