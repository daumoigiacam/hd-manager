import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import generateModule from '@babel/generator';
import { cloneNode, importDeclaration, stringLiteral } from '@babel/types';

const {values}=parseArgs({options:{view:{type:'string'},label:{type:'string'},apply:{type:'boolean',default:false}}});
const name=values.view,label=values.label;
if(!/^[A-Z][A-Za-z0-9]*View$/.test(name||'')||['MainAppView','AccessDeniedView'].includes(name)||!label||label.length>120)
  throw Error('Provide a top-level workspace View and a user-facing label. App/shell/access boundaries cannot be extracted here.');
const root=process.cwd(),appPath=path.join(root,'src','App.jsx'),manifestPath=path.join(root,'src','features','legacy','view-manifest.json');
const destination=path.join(root,'src','features','legacy',name+'.jsx');
const source=await fs.readFile(appPath,'utf8'),ast=parse(source,{sourceType:'module',plugins:['jsx']});
const traverse=traverseModule.default||traverseModule,generate=generateModule.default||generateModule,
  dependencies=new Set(),globals=new Set(),literalEdits=[],imports=new Map(),importedBindings=new Set();
const relocated=value=>{
  if(!value.startsWith('.'))return value;
  let next=path.relative(path.dirname(destination),path.resolve(path.dirname(appPath),value)).replaceAll('\\','/');
  if(!next.startsWith('.'))next='./'+next;
  return next;
};
let target;
traverse(ast,{FunctionDeclaration(p){
  if(p.node.id?.name!==name||!p.parentPath.isProgram())return;
  target=p.node;
  if(p.node.leadingComments?.some(comment=>/@(?:param|template|type|returns)/.test(comment.value)))
    throw Error('Typed workspace requires an explicit type-import plan before extraction.');
  p.traverse({ReferencedIdentifier(q){
    const binding=q.scope.getBinding(q.node.name);
    if(!binding)globals.add(q.node.name);
    else if(binding.scope.path.isProgram()){
      if(binding.kind==='module'){
        const declaration=binding.path.parent;
        if(declaration.type!=='ImportDeclaration')throw Error('Unsupported module binding.');
        if(!imports.has(declaration))imports.set(declaration,new Map());
        imports.get(declaration).set(binding.identifier.name,binding.path.node);importedBindings.add(binding.identifier.name);
      }else{
        // Runtime injection preserves object/function identities, not future
        // reassignments to a lexical binding. Refuse that semantic change.
        if(!binding.constant)throw Error('Mutable workspace binding requires a live accessor plan: '+q.node.name);
        dependencies.add(q.node.name);
      }
    }
  },StringLiteral(q){
    const parent=q.parent,node=q.node;
    const relativeImport=parent.type==='CallExpression'&&parent.callee.type==='Import'&&parent.arguments[0]===node;
    const relativeAsset=parent.type==='NewExpression'&&parent.callee.name==='URL'&&parent.arguments[0]===node
      &&parent.arguments[1]?.type==='MemberExpression'&&parent.arguments[1].object?.type==='MetaProperty';
    if((relativeImport||relativeAsset)&&node.value.startsWith('.')){
      const next=relocated(node.value);
      literalEdits.push({start:node.start-target.start,end:node.end-target.start,text:JSON.stringify(next)});
    }
  }});
  p.stop();
}});
if(!target)throw Error('Workspace declaration not found.');
if(source.slice(target.start,target.end).includes('module={deferred'+name+'Module}'))throw Error('Workspace is already extracted.');
const factory='create'+name,moduleVariable='deferred'+name+'Module',keys=[...dependencies].sort();
let component=source.slice(target.start,target.end);
for(const edit of literalEdits.sort((a,b)=>b.start-a.start))component=component.slice(0,edit.start)+edit.text+component.slice(edit.end);
const directImports=[...imports].map(([declaration,specifiers])=>generate(importDeclaration([...specifiers.values()].sort((a,b)=>a.start-b.start).map(specifier=>cloneNode(specifier,true)),stringLiteral(relocated(declaration.source.value)))).code).join('\n');
const factorySource=`${directImports}
// Transitional bundle boundary. Only stable local module bindings are injected;
// all actor/company/business data continues to arrive through current props.
// Generated binding contract is checked against the real source AST.
export function ${factory}(runtime) {
  const {${keys.join(',')}} = runtime;
  ${component}
  return ${name};
}
`;
const wrapper=`const ${moduleVariable} = createPreloadableModule(() => import('./features/legacy/${name}.jsx')
  .then(({${factory}}) => ({default:${factory}(Object.freeze({${keys.join(',')}}))})));
function ${name}(props) {
  return <PreloadedWorkspace module={${moduleVariable}} viewProps={props} label={${JSON.stringify(label)}} />;
}`;
let next=source.slice(0,target.start)+wrapper+source.slice(target.end);
if(!next.includes("import PreloadedWorkspace from './layout/PreloadedWorkspace.jsx';"))next="import PreloadedWorkspace from './layout/PreloadedWorkspace.jsx';\n"+next;
parse(factorySource,{sourceType:'module',plugins:['jsx']});parse(next,{sourceType:'module',plugins:['jsx']});
const sha=value=>createHash('sha256').update(value).digest('hex');
const record={name,label,file:path.relative(root,destination).replaceAll('\\','/'),factory,moduleVariable,
  runtimeBindings:keys,importedBindings:[...importedBindings].sort(),browserGlobals:[...globals].sort(),componentSha256:sha(component),appBeforeSha256:sha(source),appAfterSha256:sha(next),
  scope:'Code-load boundary only; same component body and module binding identities. Not data pagination or performance acceptance.'};
console.log(JSON.stringify({...record,apply:values.apply,componentBytes:Buffer.byteLength(component)}));
if(!values.apply)process.exit(0);
let manifest={version:1,views:[]};try{manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
if(manifest.views.some(view=>view.name===name))throw Error('Existing extraction manifest entry.');
try{await fs.stat(destination);throw Error('Destination already exists.')}catch(error){if(error.code!=='ENOENT')throw error}
const backup=path.join(root,'test-results','view-extraction-baselines');await fs.mkdir(backup,{recursive:true});
await fs.writeFile(path.join(backup,name+'-'+sha(source).slice(0,16)+'-App.jsx'),source,{flag:'wx'});
await fs.mkdir(path.dirname(destination),{recursive:true});
await fs.writeFile(destination,factorySource,{flag:'wx'});
await fs.writeFile(appPath,next);
manifest.views.push(record);await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
