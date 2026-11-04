import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';

const root=process.cwd();
const output=path.resolve(process.env.HD_SYSTEM_AUDIT_OUTPUT||'test-results/full-system-transformation-20261101');
const repositories=['.','hd-connect-platform'].filter(name=>name==='.'||path.resolve(root,name)!==root);
const excluded=/(^|\/)(?:node_modules|\.git|dist|build|test-results|release|backups|coverage|generated|logs|\.firebase|\.codex[^/]*|\.gradle[^/]*|_recovered[^/]*|temp-restore-unzip)(\/|$)/;
const privateReports=/(^|\/)docs\/reports(\/|$)/;
const credential=/(^|\/)(?:\.env(?:\..*)?|.*\.(?:jks|keystore|pem|p12|pfx|key)|service[-_]?account[^/]*\.json|credentials?[^/]*\.json)$/i;
const code=/\.(?:[cm]?[jt]sx?)$/i;
const config=/(?:\.(?:json|rules|ya?ml|html|css|java|kt|kts|gradle|properties|prisma|sql|toml|md|ps1|sh|bat|cmd|xml)|(?:^|\/)Dockerfile(?:\.[^/]*)?)$/i;
const calls=[],queries=[],modules=[],roles=new Map(),parseErrors=[],files=[],repositoryStates=[],apiRoutes=[];
const callName=node=>node?.type==='Identifier'?node.name:node?.type==='MemberExpression'||node?.type==='OptionalMemberExpression'?callName(node.object)+'.'+(node.property.name||node.property.value||'?'):'';
const leaf=node=>callName(node).split('.').at(-1);
const knownRole=/^(?:owner|business_owner|company_owner|super_admin|admin|manager|employee|customer|sales|accountant|accounting|purchasing|warehouse|driver|delivery|production|staff)$/;
const walk=(node,visit,context='')=>{
 if(!node||typeof node!=='object')return;
 const next=node.type==='FunctionDeclaration'?node.id?.name||context:node.type==='VariableDeclarator'&&/FunctionExpression$/.test(node.init?.type||'')?node.id?.name||context:context;
 visit(node,next);
 for(const [key,value]of Object.entries(node)){
  if(['loc','extra','comments','tokens'].includes(key))continue;
  if(Array.isArray(value))value.forEach(child=>walk(child,visit,next));else if(value?.type)walk(value,visit,next);
 }
};
for(const repository of repositories){
 const cwd=path.resolve(root,repository);let names;
 try{
  names=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd,maxBuffer:32*1024*1024}).toString().split('\0').filter(Boolean);
  repositoryStates.push({repository,commit:execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8'}).trim()});
 }catch{repositoryStates.push({repository,status:'UNAVAILABLE'});continue;}
 for(const name of new Set(names)){
  const normalized=name.replaceAll('\\','/');if(excluded.test(normalized)||privateReports.test(normalized)||credential.test(normalized)||!code.test(normalized)&&!config.test(normalized))continue;
  const file=repository==='.'?normalized:repository+'/'+normalized;
  let bytes;try{bytes=await fs.readFile(path.resolve(cwd,name))}catch{continue;}
  const source=bytes.toString('utf8'),layer=file.startsWith('hd-connect-platform/')?'vps-backend':file.startsWith('functions/')?'firebase-functions':file.startsWith('src/')?'frontend':file.startsWith('tests/')?'tests':file.startsWith('scripts/')?'tooling':'configuration-or-native';
  files.push({file,layer,bytes:bytes.length,lines:source.split(/\r?\n/).length,sha256:createHash('sha256').update(bytes).digest('hex')});
  if(!code.test(file))continue;
  let tree;try{tree=parse(source,{sourceType:'unambiguous',plugins:['decorators-legacy',...(!/\.ts$/.test(file)?['jsx']:[]),...( /\.tsx?$/.test(file)?['typescript']:[])]})}catch(error){parseErrors.push({file,line:error.loc?.line,reason:error.reasonCode||'PARSE_ERROR'});continue;}
  walk(tree,(node,context)=>{
   const location={file,line:node.loc?.start.line,context};
   if(node.type==='AssignmentExpression'&&node.left?.object?.name==='exports'&&node.right?.type==='CallExpression'
     &&/^(?:onRequest|onCall)$/.test(leaf(node.right.callee)))apiRoutes.push({...location,method:'FIREBASE_HTTPS_DECLARATION',path:node.left.property?.name||'DYNAMIC_OR_OMITTED'});
   if(node.type==='FunctionDeclaration'&&/(?:View|Workspace|Dashboard|Center|Screen)$/.test(node.id?.name||''))modules.push({...location,name:node.id.name});
   if(node.type==='StringLiteral'&&knownRole.test(node.value)){const key=node.value;if(!roles.has(key))roles.set(key,[]);roles.get(key).push({file,line:node.loc?.start.line});}
   if(node.type==='Decorator'&&node.expression?.type==='CallExpression'&&/^(?:Controller|Get|Post|Put|Patch|Delete)$/.test(leaf(node.expression.callee))){
    const route=node.expression.arguments[0];apiRoutes.push({...location,method:leaf(node.expression.callee),path:route?.type==='StringLiteral'&&/^[A-Za-z0-9_/:.\-]*$/.test(route.value)&&route.value.length<=100?route.value:'DYNAMIC_OR_OMITTED'});
   }
   if(!['CallExpression','OptionalCallExpression'].includes(node.type))return;
   const name=leaf(node.callee);
   if(name==='findMany'){
    const properties=node.arguments[0]?.type==='ObjectExpression'?node.arguments[0].properties.map(property=>property.key?.name||property.key?.value).filter(Boolean):[];
    queries.push({...location,name:'prisma.findMany',constraints:properties,explicitLimit:properties.includes('take'),cursor:properties.includes('cursor'),offsetCandidate:properties.includes('skip'),dynamicConstraints:!properties.length,status:'STATIC_CANDIDATE_NOT_RUNTIME_PROOF'});
   }
   if(/^(?:query|firebaseQuery)$/.test(name)){
    const constraints=node.arguments.slice(1).filter(arg=>arg.type==='CallExpression').map(arg=>leaf(arg.callee));
    queries.push({...location,name,constraints,explicitLimit:constraints.some(x=>/^(?:limit|firebaseLimit|limitToLast)$/.test(x)),cursor:constraints.some(x=>/^(?:startAfter|startAt|endBefore|endAt)$/.test(x)),dynamicConstraints:node.arguments.some(x=>x.type==='SpreadElement'),status:'STATIC_CANDIDATE_NOT_RUNTIME_PROOF'});
   }
   if(/^(?:fetch|getDocs|firebaseGetDocs|getDoc|firebaseGetDoc|onSnapshot|firebaseOnSnapshot|setDoc|firebaseSetDoc|updateDoc|deleteDoc|runTransaction|firebaseRunTransaction|findMany|findFirst|findUnique|aggregate|groupBy|count|\$transaction|setInterval|setTimeout|readFileSync|writeFileSync|parse|stringify)$/.test(name))calls.push({...location,callee:callName(node.callee),kind:/Snapshot$/.test(name)?'listener':/Transaction|transaction|setDoc|SetDoc|updateDoc|deleteDoc/.test(name)?'write':/^(?:parse|stringify)$/.test(name)?'serialization':/Timeout|Interval/.test(name)?'timer':'read-or-io'});
  });
 }
}
const dimensions=['frontend','backend','firebase','firestore-data-model','component-tree','state-management','data-fetching','cache','realtime','authentication','authorization','security-rules','network','memory','javascript','rendering','images','offline','error-recovery','build-deployment'];
const result={at:new Date(),status:'AUDIT_IN_PROGRESS_NOT_ACCEPTED',repositoryStates,scope:'VCS source/configuration inventory of HD Manager plus the nested VPS repository. Excludes dependencies, generated artifacts, backup payloads and credential files. Only code symbols, standard roles and HTTP route definitions are exported, never credentials or business records. Static calls are candidates, never runtime request counts or proof of missing limits through aliases.',files,parseErrors,modules,apiRoutes,roleCandidates:[...roles].map(([role,locations])=>({role,locations})),queries,calls,dimensions:dimensions.map(name=>({name,status:'REQUIRES_SEMANTIC_REVIEW'})),summary:{files:files.length,layers:Object.fromEntries([...new Set(files.map(x=>x.layer))].map(layer=>[layer,files.filter(x=>x.layer===layer).length])),moduleDeclarations:modules.length,apiRouteDeclarations:apiRoutes.length,queryCandidates:queries.length,queriesWithoutLocalLimit:queries.filter(x=>!x.explicitLimit).length,listenerCallSites:calls.filter(x=>x.kind==='listener').length,largestCodeFiles:files.filter(x=>code.test(x.file)).sort((a,b)=>b.bytes-a.bytes).slice(0,15).map(x=>({file:x.file,bytes:x.bytes,lines:x.lines}))}};
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'source-inventory.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({output,summary:result.summary,parseErrorCount:parseErrors.length}));
