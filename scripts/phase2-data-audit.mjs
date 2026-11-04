import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {parse} from '@babel/parser';

// Static inspection only: no app import, credentials, SDK, network or cloud CLI.
export const output='docs/reports/phase2-performance-20261102';
await fs.mkdir(output,{recursive:true});
const files=[];
async function list(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 const file=path.posix.join(dir,entry.name);if(entry.isDirectory())await list(file);
 else if(/\.(jsx?|tsx?)$/.test(file))files.push(file);
}}
await list('src');
const sources=new Map(),trees=new Map(),imports=[],reads=[],allocations=[],disposals=[];
function visit(node,fn,ancestors=[]){if(!node||typeof node!=='object')return;
 if(node.type)fn(node,ancestors);
 for(const [key,value] of Object.entries(node)){
  if(['loc','extra','comments','tokens'].includes(key))continue;
  if(Array.isArray(value))value.forEach(child=>visit(child,fn,[...ancestors,node]));
  else if(value?.type)visit(value,fn,[...ancestors,node]);
 }
}
function evaluate(node){
 if(['StringLiteral','NumericLiteral','BooleanLiteral'].includes(node?.type))return node.value;
 if(node?.type==='ArrayExpression')return node.elements.map(evaluate);
 if(node?.type==='ObjectExpression')return Object.fromEntries(node.properties.map(p=>[p.key.name??p.key.value,evaluate(p.value)]));
 if(node?.type==='CallExpression'&&node.callee?.object?.name==='Object'&&node.callee.property?.name==='freeze')return evaluate(node.arguments[0]);
 throw Error('Unsupported static descriptor');
}
const declarations={};
const routeLiterals=new Set();
for(const file of files){
 const source=await fs.readFile(file,'utf8');sources.set(file,source);
 let tree;try{tree=parse(source,{sourceType:'module',plugins:['jsx',...(file.endsWith('.ts')||file.endsWith('.tsx')?['typescript']:[])]})}
 catch(error){throw Error(`${file}:${error.message}`)}trees.set(file,tree);
 const sdk=new Map();
 for(const item of tree.program.body){if(item.type!=='ImportDeclaration')continue;
  imports.push({file,line:item.loc.start.line,from:item.source.value});
  if(item.source.value==='firebase/firestore')for(const s of item.specifiers)sdk.set(s.local.name,s.imported?.name??'*');
 }
 visit(tree,(node,ancestors)=>{
  if(node.type==='BinaryExpression'&&['===','=='].includes(node.operator)){
   if(node.left?.name==='activeTab'&&node.right?.type==='StringLiteral')routeLiterals.add(node.right.value);
   if(node.right?.name==='activeTab'&&node.left?.type==='StringLiteral')routeLiterals.add(node.left.value);
  }
  if(file==='src/App.jsx'&&node.type==='VariableDeclarator'&&['DATA_COLLECTION_NAMES','CORE_DATA_COLLECTION_NAMES','BASELINE_REALTIME_COLLECTION_NAMES','FOREGROUND_REALTIME_COLLECTIONS_BY_TAB'].includes(node.id?.name))declarations[node.id.name]=evaluate(node.init);
  if(node.type!=='CallExpression')return;
  const name=node.callee?.name??node.callee?.property?.name;
  const functionOwners=ancestors.filter(n=>n.type==='FunctionDeclaration'||n.type==='VariableDeclarator'&&['ArrowFunctionExpression','FunctionExpression'].includes(n.init?.type));
  const row={file,line:node.loc.start.line,name,owner:functionOwners.map(n=>n.id?.name).filter(Boolean).join(' > ')||'(callback)',excerpt:source.slice(node.start,node.end).split(/\r?\n/)[0].slice(0,150)};
  if(['onSnapshot','getDoc','getDocs','getDocsFromServer','getDocFromServer'].includes(sdk.get(name)))reads.push({...row,api:sdk.get(name),mock:file.startsWith('src/mocks/')});
  else if(file==='src/App.jsx'&&['onSnapshot','getDoc','getDocs'].includes(name))reads.push({...row,api:name,facade:true,mock:false});
  if(['onSnapshot','addEventListener','setInterval','setTimeout','subscribe','observePage'].includes(name))allocations.push(row);
  if(['removeEventListener','clearInterval','clearTimeout','terminate','unsubscribe','dispose','close'].includes(name))disposals.push(row);
 });
}
function resolve(from,value){if(!value.startsWith('.'))return null;
 const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),value));
 return [base,base+'.js',base+'.jsx',base+'/index.js'].find(file=>sources.has(file))??null;
}
const graph=new Map();
for(const entry of imports){const target=resolve(entry.file,entry.from);if(target){if(!graph.has(entry.file))graph.set(entry.file,[]);graph.get(entry.file).push(target)}}
const reachable=new Set();function reach(file){if(reachable.has(file))return;reachable.add(file);for(const next of graph.get(file)||[])reach(next)}reach('src/main.jsx');
const plans=declarations.FOREGROUND_REALTIME_COLLECTIONS_BY_TAB;
const modules=Object.entries(plans).map(([module,collections])=>({module,collections,
 readOwner:module==='customer_home'||module==='order'?'customer bootstrap / App tenant sources':'App session subscription manager',
 pageEngineIntegrated:false,scope:'authenticated companyId plus role/customer query filters; must retain server Rules',
 pagination:'foreground snapshots are whole matching sources; overflow REST may collect multiple pages, not bounded UI cursor pages',
 dedupe:'shared collectionBindingMap/active listener sets inside one App session; NOT cross-client or global request dedupe',
 routeUnmount:'bounded LRU intentionally retains some listeners; session cleanup closes them',
 proof:'src/App.jsx:1140; exact collection sets extracted from AST',runtimeCoverage:'NOT_MEASURED_FOR_EVERY_MODULE'}));
for(const module of [...routeLiterals].sort())if(!Object.hasOwn(plans,module))modules.push({module,collections:null,
 readOwner:'No entry in foreground collection plan; inspect local state, parent-provided data and role-specific route',pageEngineIntegrated:false,
 proof:'Static activeTab equality in repository; not assumed empty or runtime reachable for every role',runtimeCoverage:'REQUIRES_ROUTE_CONTRACT'});
const fingerprints=Object.fromEntries([...sources].map(([file,source])=>[file,crypto.createHash('sha256').update(source).digest('hex')]));
const data={at:new Date().toISOString(),status:'STATIC_AUDIT_COMPLETE_NOT_RUNTIME_ACCEPTANCE',
 safety:{networkCalls:0,productionReads:0,productionWrites:0,newLibraries:0,architectureIntegrated:false},
 files:files.length,modules,descriptors:declarations,
 engine:{reachableFromMain:reachable.has('src/data/instantDataEngine.js'),hookReachable:reachable.has('src/data/useInstantPage.js'),
 requestAdmissionReachable:reachable.has('src/data/requestAdmission.js'),qualification:'static relative import graph; Vite aliases/dynamic chunks need build confirmation'},
 sdkReadSites:reads,sdkReadSiteQualification:'Includes App facade and its underlying SDK calls, not physical request counts. Injected transport read/watch aliases are separate adapter sites.',listenerAndTimerSites:allocations,cleanupSites:disposals,
 fingerprints,
 findings:[
 {id:'D01',priority:'P0',fact:'Page engine and transport are not wired into operational modules; client page slicing does not bound source reads.',action:'Present module-by-module read adapter/capability plan for review before integration.'},
 {id:'D02',priority:'P0',fact:'Personal Home contract needs 13 business collections plus companies/employees. Company Home needs 15 business collections. All-source commit guards preserve financial correctness but widen data-ready critical path.',action:'Keep shell/navigation independent; splitting financial cards needs complete dependency contracts, not fabricated zeroes.'},
 {id:'D03',priority:'P0',fact:'Worker/client and application retain complete snapshots in multiple layers. Bounds count scopes/collections, not total bytes.',action:'Measure retained graph and per-process heaps before choosing byte budgets or evicting anything.'},
 {id:'D04',priority:'P0',fact:'Legacy login scan/reset/export/payroll preference read sites bypass page engine. Static presence does not prove execution on ordinary login.',action:'Classify call-site purpose and build-mode guards; do not route destructive admin jobs through list cache.'},
 {id:'D05',priority:'P0',fact:'Cursor helper spreads stored id after document path ID. Distinct documents can collapse during page merge.',action:'Reproduce on demo Firestore Emulator, then make path identity authoritative; preserve all other fields.'},
 {id:'D06',priority:'P1',fact:'Projection cache uses WeakMap source identity and max four scopes per source tuple, not a global memory byte limit. Session source references determine retention.',action:'Treat as derived projection ownership, not a second authoritative server cache.'},
 {id:'D07',priority:'P1',fact:'Read worker persistent cache is opt-in; separate volatile identity directory; engine read retry bounded, realtime retry explicit. SDK RPC cancellation discards publication without aborting physical RPC.',action:'Keep one transport owner and immutable access epoch; do not add Query or duplicate SDK listener.'},
 ],
 integrationPlan:[
 {step:1,approval:'REQUIRED_ARCHITECTURE',change:'Introduce session-owned adapter boundary using current subscription manager; key by project/app/principal/tenant/permission epoch/query.',gate:'Fixture role isolation; one physical owner per query; logout closes requests/listeners and hides old scope.'},
 {step:2,approval:'REQUIRED_ARCHITECTURE',change:'First bounded list only: products/customers with supported sort, typed cursor and global-search semantics. Keep accounting aggregation on complete authoritative sources.',gate:'Feature parity including permissions, search and export; no partial-page aggregate.'},
 {step:3,approval:'REQUIRED_ARCHITECTURE',change:'Explicit freshness and commit metadata per dataset; ACK invalidation of exact collection/query dependencies; transient-only retry with jitter.',gate:'Concurrent edit, permission revoke, offline reconnect, duplicate requests and post-ACK old response tests.'},
 {step:4,approval:'REQUIRED_ARCHITECTURE',change:'Separate derived projection eviction from source/session ownership; use measured byte budgets with hysteresis.',gate:'No financial data deletion, reload loop or hidden stale result; Android 30min/2hr soak.'},
 ],
 duplicateRequestVerdict:'No unconditional duplicate request proven across all modules. Shared paths and fallback overlap need runtime trace with fake fixtures; counting SDK calls in source is not a request count.',
 listenerLeakVerdict:'Cleanup paths exist; static pairing cannot prove absence of leaked listeners. Deterministic engine/worker lifecycle tests plus soak required.',
};
await fs.writeFile(`${output}/data-engine-integration.json`,JSON.stringify(data,null,2));
console.log(JSON.stringify({modules:modules.length,sourceFiles:files.length,sdkReads:reads.filter(x=>!x.mock).length,engine:data.engine}));
