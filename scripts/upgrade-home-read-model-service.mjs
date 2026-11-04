// LOCAL QA ONLY. No socket or Emulator request at import / --self-test.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createHomeReadModelEmulatorAdapter, readParityEvidence } from './upgrade-home-read-model-emulator.mjs';
import { createHomeReadModelPrototype, HOME_READ_MODEL_PROJECT } from '../performance/upgrade-20261103/pilots/home-read-model.mjs';
import { extractEmployeeHomeDomain } from './helpers/employee-home-domain-extraction.mjs';
import { getCashExpenseFinance, getReportPeriod } from '../src/features/business-report/reportViewModel.js';

const HOST = '127.0.0.1', PORT = 5003, AUTH_PROJECT = 'demo-hdm-perf-verification';
const AUTH_URL = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:lookup?key=fictional-home-qa';
const FIRESTORE_PREFIX = `http://127.0.0.1:8185/v1/projects/${HOME_READ_MODEL_PROJECT}/`;
const ORIGINS = new Set(['https://localhost', 'http://127.0.0.1', 'http://127.0.0.1:5003']);
const TOKEN_MAX = 16384, BODY_MAX = TOKEN_MAX + 128, RESPONSE_MAX = 128 * 1024;
const scopeKeys = ['principalId','tenantId','permissionKey','sessionId','dayKey','timeZone','timezoneOffsetMinutes'];
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const sameScope = (a,b) => a && b && scopeKeys.every(key => a[key] === b[key]);
const error = (code,status=503) => Object.assign(new Error(code),{code,status});
const requireValue = (ok,code,status) => { if(!ok)throw error(code,status); };
function environment() {
  requireValue(!process.env.FIRESTORE_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8185','foreign-firestore-port');
  requireValue(!process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST==='127.0.0.1:9199','foreign-auth-port');
}
async function boundedResponse(response,limit) {
  const chunks=[];let size=0;
  if(response.body){const reader=response.body.getReader();try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;
    if(size>limit){await reader.cancel();throw error('upstream-response-too-large');}chunks.push(Buffer.from(item.value));}}finally{reader.releaseLock();}}
  try{return JSON.parse(Buffer.concat(chunks,size).toString('utf8')||'{}');}catch{throw error('invalid-upstream-response');}
}
export function canonicalVietnamClock(now=Date.now()) {
  const date=new Date(now),zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  requireValue(['Asia/Saigon','Asia/Ho_Chi_Minh'].includes(zone)&&date.getTimezoneOffset()===-420,'runtime-timezone-mismatch');
  const parts=new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const dayKey=['year','month','day'].map(key=>parts.find(p=>p.type===key)?.value).join('-');
  const local=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  requireValue(dayKey===local,'clock-scope-mismatch');return {dayKey,timeZone:'Asia/Ho_Chi_Minh',timezoneOffsetMinutes:-420};
}
export async function verifyManagerToken(idToken,{fetchImpl=globalThis.fetch,clock=Date.now,signal,permissionKey='owner'}={}) {
  environment();
  requireValue(typeof idToken==='string'&&idToken.length>0&&idToken.length<=TOKEN_MAX&&!/[\r\n]/.test(idToken),'invalid-token',401);
  let response,lookup;
  try{response=await fetchImpl(AUTH_URL,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken}),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000)});
    if(!response.ok)throw error('auth-denied',401);lookup=await boundedResponse(response,65536);
  }catch(e){if(e.code==='auth-denied')throw e;throw error('auth-emulator-unavailable');}
  requireValue(Array.isArray(lookup.users)&&lookup.users.length===1,'auth-denied',401);
  const account=lookup.users[0];
  requireValue(account.localId==='verification-manager'&&account.disabled!==true,'access-denied',403);
  // Deliberately decode ONLY AFTER successful Emulator lookup/account checks.
  // The Emulator is the QA authority; this is not production JWT signature verification.
  let claims;try{const parts=idToken.split('.');requireValue(parts.length===3,'invalid-token',401);
    const text=Buffer.from(parts[1],'base64url').toString('utf8');requireValue(Buffer.byteLength(text)<=12288,'invalid-token',401);claims=JSON.parse(text);
  }catch{throw error('invalid-token',401);}
  requireValue(claims.aud===AUTH_PROJECT&&claims.iss===`https://securetoken.google.com/${AUTH_PROJECT}`,'wrong-project',403);
  requireValue(claims.sub===account.localId&&(!claims.uid||claims.uid===account.localId)&&(!claims.user_id||claims.user_id===account.localId)
    &&claims.companyId==='phase2-fictional'&&claims.accountType==='employee'&&claims.role==='super_admin'
    &&claims.appUserId==='fixture-manager','access-denied',403);
  const seconds=Math.floor(clock()/1000),validSince=Number(account.validSince||0);
  requireValue(Number.isSafeInteger(claims.auth_time)&&claims.auth_time>0&&claims.auth_time<=seconds
    &&Number.isSafeInteger(claims.iat)&&claims.iat>=claims.auth_time&&claims.iat<=seconds+30
    &&Number.isSafeInteger(claims.exp)&&claims.exp>seconds&&Number.isFinite(validSince)&&claims.auth_time>=validSince,'auth-expired-or-revoked',401);
  if(account.customAttributes){let stored;try{stored=JSON.parse(account.customAttributes);}catch{throw error('access-denied',403);}
    for(const key of ['companyId','accountType','role'])if(Object.prototype.hasOwnProperty.call(stored,key))requireValue(stored[key]===claims[key],'access-denied',403);}
  requireValue(permissionKey==='owner','unexpected-manager-role-key',403);
  return {scope:{principalId:account.localId,tenantId:claims.companyId,permissionKey,sessionId:String(claims.auth_time),...canonicalVietnamClock(clock())},
    expiresAt:claims.exp*1000,currentUser:{id:claims.appUserId,role:claims.role,companyId:claims.companyId,accountType:claims.accountType}};
}

export async function prepareService({sourceSnapshot,parityEvidence}={}) {
  environment();const evidence=await readParityEvidence(parityEvidence);
  requireValue((await fs.stat(sourceSnapshot)).size<=33*1024*1024,'source-export-too-large');
  const loaded=JSON.parse(await fs.readFile(sourceSnapshot,'utf8'));
  requireValue(loaded.kind==='fictional-home-input-export-v1'&&loaded.inputSha256===hash(JSON.stringify(loaded.input))
    &&loaded.fixture?.project===AUTH_PROJECT&&loaded.input?.company?.id==='phase2-fictional'
    &&loaded.sourceRevision===evidence.sourceRevision&&loaded.domainSourceSha256===evidence.domainSourceSha256,'source-parity-mismatch');
  requireValue(loaded.input.orders?.length===2000&&loaded.input.customers?.length===1000&&loaded.input.payments?.length===2000,'fictional-workload-mismatch');
  requireValue(Array.isArray(loaded.input.customerComplaints)&&loaded.input.attendanceLoaded===true&&loaded.input.complaintsLoaded===true,'incomplete-authoritative-source');
  const modulePath=path.resolve(loaded.domainModulePath);
  requireValue(hash(await fs.readFile(modulePath))===loaded.domainModuleSha256,'domain-module-changed');
  const domain=await import(pathToFileURL(modulePath).href);
  const source=await fs.readFile('src/App.jsx','utf8');
  const roleSource=extractEmployeeHomeDomain(source,path.resolve('src'),['getEmployeeRolePermissionKey']);
  requireValue(!/^import /m.test(roleSource),'unexpected-role-helper-import');
  const role=await import('data:text/javascript;base64,'+Buffer.from(roleSource).toString('base64'));
  const manager=loaded.input.employees.find(row=>row.id==='fixture-manager');
  requireValue(manager?.companyId==='phase2-fictional'&&manager.role==='super_admin'&&loaded.input.company.ownerId===manager.id,'manager-fixture-mismatch');
  const permissionKey=role.getEmployeeRolePermissionKey(manager,{id:manager.id,companyId:manager.companyId,role:'super_admin',accountType:'employee'});
  requireValue(permissionKey==='owner','unexpected-manager-role-key');
  const raw=Object.fromEntries(Object.entries(loaded.input).filter(([key])=>!['payrollCosts','debtLedger','cashExpenseRecords'].includes(key)));
  requireValue(evidence.dayKey===canonicalVietnamClock().dayKey,'parity-day-mismatch');
  // No payroll/debt/financial projection is computed at startup. Only source and
  // already extracted domain modules are loaded; the first measured request builds.
  const calculateInput=async rawInput=>{
    const input=clone(rawInput);input.now=new Date();
    input.expenses=input.expenses.filter(domain.isCashflowOfficial);input.payments=input.payments.filter(domain.isCashflowOfficial);
    for(const row of Object.values(input.attendance||{})){row.checkIn=row.checkIn?new Date(row.checkIn):null;row.checkOut=row.checkOut?new Date(row.checkOut):null;}
    requireValue(!(input.payrollPeriods||[]).some(row=>['locked','finalized','closed'].includes(row.status)),'complete-locked-payroll-reader-required');
    const steps=domain.buildDashboardPayrollCostSteps(input);let operations=0;
    for(;;){const step=steps.next();if(step.done){input.payrollCosts=step.value;break;}if(++operations%64===0)await new Promise(setImmediate);}
    const ledger=domain.buildCustomerReconciledLedgerMap(input.customers,input.orders,input.payments,input.warehouseImports,input.expenses);
    requireValue(input.customers.every(row=>row.isArchived||ledger[row.id]&&Number.isFinite(ledger[row.id].currentDebt)),'incomplete-ledger');
    input.debtLedger=input.customers.filter(row=>!row.isArchived).map(row=>({id:row.id,debt:ledger[row.id].currentDebt}));
    input.cashExpenseRecords=input.expenses.map(row=>({...row,date:domain.resolveCashflowDateKey(row)}));return input;
  };
  return {raw,calculateInput,permissionKey,dayKey:evidence.dayKey,evidence,deriveRole:role.getEmployeeRolePermissionKey,manager};
}

export function createLocalHomeService({prepared,fetchImpl=globalThis.fetch,clock=Date.now,host=HOST,port=PORT,ttlMinutes=60,statusFile,
  adapterFactory=createHomeReadModelEmulatorAdapter,coreFactory=createHomeReadModelPrototype}={}) {
  environment();requireValue(host===HOST&&port===PORT,'foreign-service-port');
  requireValue(Number.isInteger(ttlMinutes)&&ttlMinutes>=1&&ttlMinutes<=60,'invalid-service-ttl');
  requireValue(prepared?.permissionKey==='owner'&&prepared.raw?.company?.id==='phase2-fictional'&&typeof prepared.calculateInput==='function','invalid-prepared-source');
  const startedAt=clock(),expiresAt=startedAt+ttlMinutes*60000,sessions=new Map();let closed=false,inFlight=0,currentSignal=null,currentAuth=null,activeController=null,server=null,timer=null,statusTimer=null;
  const counts={requests:0,verifiedRequests:0,deniedRequests:0,newSessionSourcesSeeded:0,modelMissRequests:0,modelPublished:0,modelReadHits:0,modelBuilds:0,failures:0};
  let statusPath=null,statusTask=null;
  if(statusFile){statusPath=path.resolve(statusFile);requireValue(statusPath.startsWith(path.resolve('test-results')+path.sep),'status-outside-test-results');}
  const status=()=>({status:closed?'STOPPED_LOCAL_QA':'READY_LOCAL_QA',host,port,project:HOME_READ_MODEL_PROJECT,authProject:AUTH_PROJECT,
    startedAt,expiresAt,sessionCount:sessions.size,inFlight,...counts,qualification:'Frozen fictional source; no production event bridge. No token/email logging.'});
  const writeStatus=async()=>{if(!statusPath)return;if(statusTask)return statusTask;const temporary=statusPath+'.tmp';
    statusTask=(async()=>{await fs.writeFile(temporary,JSON.stringify(status(),null,2));await fs.rename(temporary,statusPath);})().finally(()=>{statusTask=null;});return statusTask;};
  function live(){requireValue(!closed&&clock()<expiresAt,'service-expired');requireValue(!currentSignal?.aborted,'request-cancelled');}
  function syncCounts(session){for(const [stat,counter]of [['publications','modelPublished'],['domainBuilds','modelBuilds']]){
    const value=session.adapter.stats[stat]||0;counts[counter]+=value-(session.reported[stat]||0);session.reported[stat]=value;}}
  async function sessionFor(auth){
    const key=JSON.stringify(scopeKeys.map(name=>auth.scope[name]));if(sessions.has(key))return sessions.get(key);
    requireValue(sessions.size<32,'session-capacity');live();
    const appId='fictional-native-home-'+randomUUID();
    const scopedFetch=async(url,options)=>{
      requireValue(String(url).startsWith(FIRESTORE_PREFIX),'foreign-firestore-url');
      const cleanup=String(url).endsWith(':rollback');if(!cleanup)live();
      let outgoing=options;
      // The imported generic QA adapter has an additional fictional test actor.
      // This HTTP pilot bootstrap retains ONLY the actual verified manager.
      if(options.body){const body=JSON.parse(options.body);let changed=false;
        for(const item of body.writes||[])if(item.update?.name.endsWith('/homePrototypeHeads/current')){
          const head=JSON.parse(item.update.fields.payload.stringValue);
          requireValue(head.sourceTenantId===auth.scope.tenantId&&sameScope(head.actors[0].scope,auth.scope),'head-scope-mismatch');
          head.actors=[{id:'owner',allowed:true,scope:auth.scope}];item.update.fields.payload.stringValue=JSON.stringify(head);changed=true;
        }if(changed)outgoing={...options,body:JSON.stringify(body)};}
      return fetchImpl(url,{...outgoing,signal:cleanup?options.signal:AbortSignal.any([options.signal,currentSignal])});
    };
    const adapter=adapterFactory({appId,calculateInput:prepared.calculateInput,fetchImpl:scopedFetch,clock});
    await adapter.seed(prepared.raw,auth.scope,{sourceRevision:prepared.evidence.sourceRevision,domainSourceSha256:prepared.evidence.domainSourceSha256,
      appSourceSha256:prepared.evidence.appSourceSha256,mode:'frozen-fictional-local-only'});live();counts.newSessionSourcesSeeded++;
    const context={verified:true,allowed:true,projectId:HOME_READ_MODEL_PROJECT,appId,scope:auth.scope};
    const callbacks={...adapter.callbacks,clock,ttlMs:900000,yieldWork:()=>new Promise(setImmediate),
      verifyContext:async()=>{live();requireValue(sameScope(currentAuth?.scope,auth.scope),'scope-changed');
        const owner=await adapter.callbacks.verifyContext({actor:'owner'});requireValue(owner.verified&&owner.allowed&&sameScope(owner.scope,auth.scope),'head-scope-mismatch');return context;},
      // Read time is the ACTUAL completed read of this frozen fixture generation,
      // not a synthetic production event. Revision CAS stays with the real head.
      readVersion:async ctx=>({...await adapter.callbacks.readVersion(ctx),readTime:clock()}),
      readInputs:async ctx=>{const value=await adapter.callbacks.readInputs(ctx);return {...value,version:{...value.version,readTime:clock()}};},
    };
    const session={adapter,api:coreFactory(callbacks),reported:{}};sessions.set(key,session);return session;
  }
  const reply=(statusCode,body,origin)=>{
    const serverTime=clock();requireValue(Number.isSafeInteger(serverTime),'invalid-server-clock');
    if(body?.current){requireValue(Number.isFinite(Date.parse(body.generatedAt))&&Date.parse(body.generatedAt)<=serverTime,'future-financial-timestamp');
      requireValue(Number.isSafeInteger(body.expiresAt)&&body.expiresAt>serverTime,'projection-expired-at-reply');}
    return {statusCode,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',
      ...(origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'}:{})},
      body:body===null?null:{...body,serverTime}};
  };
  async function dispatch({method='POST',url='/home',headers={},remoteAddress=HOST,body='{}',signal}={}){
    let origin,controller,timeout,session;
    try{
      requireValue([HOST,'::ffff:127.0.0.1'].includes(remoteAddress),'non-loopback-peer',403);
      requireValue(headers.host===`${HOST}:${PORT}`,'invalid-host',403);
      origin=headers.origin;requireValue(!origin||ORIGINS.has(origin),'origin-denied',403);
      requireValue(url==='/home','not-found',404);
      if(method==='OPTIONS'){requireValue(origin&&headers['access-control-request-method']==='POST','invalid-preflight',403);
        const requested=String(headers['access-control-request-headers']||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
        requireValue(requested.every(x=>['content-type','authorization'].includes(x)),'invalid-preflight',403);return reply(204,null,origin);}
      requireValue(method==='POST','method-not-allowed',405);requireValue(!closed&&clock()<expiresAt,'service-expired');
      requireValue(counts.requests<256,'request-capacity',429);counts.requests++;
      requireValue(inFlight===0,'request-in-flight',429);
      requireValue(typeof body==='string'&&Buffer.byteLength(body)<=BODY_MAX,'body-too-large',413);
      let payload;try{payload=JSON.parse(body);}catch{throw error('invalid-body',400);}
      requireValue(payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.keys(payload).every(key=>key==='idToken'),'caller-scope-forbidden',400);
      const authorization=headers.authorization;
      requireValue(!authorization||(typeof authorization==='string'&&authorization.startsWith('Bearer ')),'invalid-token',401);
      const bearer=authorization?authorization.slice(7):undefined;
      requireValue(!(bearer&&payload.idToken&&bearer!==payload.idToken),'conflicting-tokens',401);
      const token=bearer||payload.idToken;
      controller=new AbortController();timeout=setTimeout(()=>controller.abort(),15000);
      if(signal){if(signal.aborted)controller.abort();else signal.addEventListener('abort',()=>controller.abort(),{once:true});}
      inFlight=1;activeController=controller;currentSignal=controller.signal;
      const auth=await verifyManagerToken(token,{fetchImpl,clock,signal:currentSignal,permissionKey:prepared.permissionKey});
      requireValue(auth.scope.dayKey===prepared.dayKey,'frozen-source-day-expired');
      if(prepared.deriveRole)requireValue(prepared.deriveRole(prepared.manager,auth.currentUser)===auth.scope.permissionKey,'permission-key-mismatch',403);
      currentAuth=auth;counts.verifiedRequests++;live();session=await sessionFor(auth);
      let result=await session.api.read({});
      if(result.current)counts.modelReadHits++;
      else{if(result.state==='missing')counts.modelMissRequests++;result=await session.api.refresh({});}
      live();
      const again=await verifyManagerToken(token,{fetchImpl,clock,signal:currentSignal,permissionKey:prepared.permissionKey});
      requireValue(sameScope(auth.scope,again.scope),'scope-changed',403);
      if(result.current){const finance=getCashExpenseFinance(result.snapshot.finance);
        for(const period of ['today','week','month','quarter','year']){const expected=prepared.evidence.periods?.actualApp?.[period]||(period==='today'?prepared.evidence.actualApp:null);
          if(expected){const report=getReportPeriod(finance,period);requireValue(['revenue','expense','profit','receivables'].every(key=>Object.is(report[key],expected[key])),'financial-parity-failed');}}}
      const response={state:result.state,current:result.current===true,reason:/^[a-z0-9-]{1,96}$/.test(result.reason||'')?result.reason:'projection-unavailable',
        replayed:result.replayed===true,snapshot:result.snapshot||null,scope:auth.scope,projectionVersion:1,version:result.sourceVersion||null,
        generatedAt:result.generatedAt||result.snapshot?.generatedAt||null,expiresAt:result.expiresAt||null,capabilities:'four-cards-line-only',
        qualification:'LOCAL QA: frozen fictional source, warm service/modules; no production event bridge or App speed acceptance'};
      requireValue(Buffer.byteLength(JSON.stringify(response))<=RESPONSE_MAX,'response-too-large');return reply(result.current?200:503,response,origin);
    }catch(e){if(e.status===401||e.status===403)counts.deniedRequests++;else counts.failures++;
      const reason=typeof e.code==='string'&&/^[a-z0-9-]{1,96}$/.test(e.code)?e.code:'service-unavailable';
      return reply(e.status||503,{state:e.status===401?'unauthenticated':e.status===403?'denied':'error',current:false,snapshot:null,reason,projectionVersion:1,capabilities:'four-cards-line-only'},ORIGINS.has(origin)?origin:undefined);
    }finally{if(session)syncCounts(session);if(controller){clearTimeout(timeout);inFlight=0;activeController=null;currentSignal=null;currentAuth=null;}}
  }
  async function handle(req,res){const cancelled=new AbortController();req.once('aborted',()=>cancelled.abort());res.once('close',()=>{if(!res.writableEnded)cancelled.abort();});
    try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>BODY_MAX)throw error('body-too-large',413);chunks.push(chunk);}
      const result=await dispatch({method:req.method,url:req.url,headers:req.headers,remoteAddress:req.socket.remoteAddress,body:Buffer.concat(chunks).toString('utf8'),signal:cancelled.signal});
      if(!res.destroyed){res.writeHead(result.statusCode,result.headers);res.end(result.body===null?'':JSON.stringify(result.body));}
    }catch{if(!res.destroyed){res.writeHead(413,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"state":"error","current":false,"snapshot":null,"reason":"invalid-body"}');}}}
  async function close(){if(closed)return;closed=true;clearTimeout(timer);clearInterval(statusTimer);activeController?.abort();
    sessions.clear();if(server){server.close();server.closeAllConnections();}await writeStatus();await writeStatus();}
  async function listen(){requireValue(!server,'already-listening');if(statusPath){await fs.mkdir(path.dirname(statusPath),{recursive:true});const file=await fs.open(statusPath,'wx');await file.close();}
    server=http.createServer({maxHeaderSize:24576},handle);server.headersTimeout=5000;server.requestTimeout=10000;server.keepAliveTimeout=2000;server.maxRequestsPerSocket=64;server.maxConnections=4;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,HOST,resolve);});
    timer=setTimeout(()=>{void close();},Math.min(expiresAt-clock(),3600000));statusTimer=setInterval(()=>{void writeStatus().catch(()=>{});},5000);
    await writeStatus();return status();}
  return {dispatch,handle,listen,close,status};
}

async function selfTest(){const assert=(await import('node:assert/strict')).default;process.env.TZ='Asia/Ho_Chi_Minh';const now=Date.parse('2026-11-04T05:00:00Z'),seconds=now/1000;
  const token=claims=>Buffer.from('{"alg":"none"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.';
  const claims={aud:AUTH_PROJECT,iss:`https://securetoken.google.com/${AUTH_PROJECT}`,sub:'verification-manager',companyId:'phase2-fictional',appUserId:'fixture-manager',accountType:'employee',role:'super_admin',auth_time:seconds-30,iat:seconds-30,exp:seconds+3600};
  const accepted=new Map(),good=token(claims);accepted.set(good,{localId:'verification-manager',disabled:false,validSince:String(seconds-100)});
  let lookups=0,seeds=0,published=0;const lookup=async(url,options)=>{assert.equal(url,AUTH_URL);assert.equal(options.method,'POST');lookups++;
    const account=accepted.get(JSON.parse(options.body).idToken);return new Response(JSON.stringify(account?{users:[account]}:{error:{message:'DENIED'}}),{status:account?200:400});};
  const auth=await verifyManagerToken(good,{fetchImpl:lookup,clock:()=>now});assert.equal(auth.scope.sessionId,String(claims.auth_time));assert.equal(auth.scope.permissionKey,'owner');assert.equal(auth.scope.timeZone,'Asia/Ho_Chi_Minh');
  await assert.rejects(verifyManagerToken('not-a-jwt',{fetchImpl:lookup,clock:()=>now}),e=>e.code==='auth-denied');assert.equal(lookups,2,'forged token reaches lookup before decoding');
  for(const change of [{aud:'production-project'},{iss:'https://securetoken.google.com/foreign'},{sub:'verification-sales'},{uid:'verification-sales'},{companyId:'other'},{appUserId:'other'},{role:'employee'},{accountType:'customer'},{exp:seconds-1},{auth_time:0}]){const bad=token({...claims,...change});accepted.set(bad,accepted.get(good));await assert.rejects(verifyManagerToken(bad,{fetchImpl:lookup,clock:()=>now}));}
  const phoneAccount=token({...claims,iat:seconds-1});accepted.set(phoneAccount,{...accepted.get(good),emailVerified:false});
  assert.equal((await verifyManagerToken(phoneAccount,{fetchImpl:lookup,clock:()=>now})).scope.principalId,'verification-manager','phone/custom-token login requires no email');
  const disabledToken=token({...claims,iat:seconds-2});accepted.set(disabledToken,{...accepted.get(good),disabled:true});
  await assert.rejects(verifyManagerToken(disabledToken,{fetchImpl:lookup,clock:()=>now}),e=>e.code==='access-denied');
  const prepared={raw:{company:{id:'phase2-fictional'}},dayKey:'2026-11-04',permissionKey:'owner',calculateInput(){},evidence:{}};
  const adapterFactory=({appId})=>{const stats={publications:0,domainBuilds:0};return {stats,async seed(raw,scope){seeds++;this.scope=scope;},callbacks:{_testStats:stats,
    verifyContext:async()=>({verified:true,allowed:true,scope:auth.scope}),readVersion:async()=>({schemaVersion:1,revisions:{},readTime:now}),readInputs:async()=>({})}};};
  const coreFactory=callbacks=>{let built=false;const value=()=>({state:'current',current:true,reason:built?'verified-source-revisions':'published',replayed:false,snapshot:{kind:'home-primary-v1',generatedAt:new Date(now).toISOString(),finance:{}},generatedAt:new Date(now).toISOString(),expiresAt:now+60000,sourceVersion:{schemaVersion:1}});
    return {read:async()=>built?value():{state:'missing',current:false},refresh:async()=>{built=true;published++;callbacks._testStats.publications++;callbacks._testStats.domainBuilds++;return value();}};};
  const service=createLocalHomeService({prepared,fetchImpl:lookup,clock:()=>now,adapterFactory,coreFactory});
  const request={headers:{host:'127.0.0.1:5003',origin:'https://localhost'},body:JSON.stringify({idToken:good})};
  const firstReply=await service.dispatch(request);assert.equal(firstReply.statusCode,200);
  assert.equal(firstReply.body.serverTime,now);assert.ok(Number.isSafeInteger(firstReply.body.serverTime));
  assert.equal(firstReply.body.generatedAt,new Date(now).toISOString());assert.equal(firstReply.body.expiresAt,now+60000);
  assert.ok(Date.parse(firstReply.body.generatedAt)>now-666,'phone may be behind: never rewrite the financial timestamp');
  assert.ok(Date.parse(firstReply.body.generatedAt)<=firstReply.body.serverTime);
  assert.equal((await service.dispatch(request)).statusCode,200);assert.equal(seeds,1);assert.equal(published,1);
  assert.equal(service.status().modelReadHits,1);assert.equal(service.status().modelMissRequests,1);assert.equal(service.status().newSessionSourcesSeeded,1);
  assert.equal(service.status().modelPublished,1);assert.equal(service.status().modelBuilds,1);
  const nextToken=token({...claims,auth_time:seconds-29,iat:seconds-29});accepted.set(nextToken,accepted.get(good));
  const next=await service.dispatch({...request,body:JSON.stringify({idToken:nextToken})});assert.equal(next.statusCode,200);assert.equal(next.body.scope.sessionId,String(seconds-29));
  assert.equal(service.status().newSessionSourcesSeeded,2);assert.equal(service.status().modelMissRequests,2);assert.equal(service.status().modelPublished,2);
  const badBody=await service.dispatch({...request,body:JSON.stringify({idToken:good,tenantId:'other'})});assert.equal(badBody.statusCode,400);assert.equal(badBody.body.serverTime,now);
  assert.equal((await service.dispatch({...request,headers:{...request.headers,origin:'https://evil.invalid'}})).statusCode,403);
  assert.equal((await service.dispatch({...request,remoteAddress:'192.0.2.2'})).statusCode,403);
  assert.equal((await service.dispatch({...request,headers:{...request.headers,host:'evil.invalid:5003'}})).statusCode,403);
  assert.equal((await service.dispatch({...request,headers:{...request.headers,authorization:'Bearer other'}})).statusCode,401);
  assert.equal((await service.dispatch({...request,body:'x'.repeat(BODY_MAX+1)})).statusCode,413);
  const preflight=await service.dispatch({method:'OPTIONS',headers:{...request.headers,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});assert.equal(preflight.statusCode,204);assert.notEqual(preflight.headers['Access-Control-Allow-Origin'],'*');
  assert.throws(()=>createLocalHomeService({prepared,port:5004}),/foreign-service-port/);assert.throws(()=>createLocalHomeService({prepared,host:'0.0.0.0'}),/foreign-service-port/);assert.throws(()=>createLocalHomeService({prepared,ttlMinutes:61}),/invalid-service-ttl/);
  const futureService=createLocalHomeService({prepared,fetchImpl:lookup,clock:()=>now,adapterFactory,
    coreFactory:()=>({read:async()=>({state:'current',current:true,snapshot:{generatedAt:new Date(now+1).toISOString(),finance:{}},
      generatedAt:new Date(now+1).toISOString(),expiresAt:now+60000}),refresh:async()=>{throw Error('not-needed');}})});
  const future=await futureService.dispatch(request);assert.equal(future.statusCode,503);assert.equal(future.body.current,false);
  assert.equal(future.body.reason,'future-financial-timestamp');assert.equal(future.body.snapshot,null);assert.equal(future.body.serverTime,now);await futureService.close();
  assert.doesNotMatch(JSON.stringify(service.status()),new RegExp(good.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));await service.close();assert.equal((await service.dispatch(request)).statusCode,503);
  console.log(JSON.stringify({status:'SELF_TEST_PASS_NO_NETWORK_NO_LISTEN',groups:['lookup-before-decode/forged denial','localId/UID/tenant/appUserId/role/audience/issuer/expiry/disabled guards','legitimate phone/custom-token account without email','canonical role/session/TZ wire scope','per-session miss then hit','body/scope/token conflict bounds','loopback/Host/CORS/port/TTL guards','serverTime metadata, unchanged financial time, future-time rejection','safe status + shutdown'],mockAuthLookups:lookups}));
}
const help=`LOCAL QA only. No financial precompute at service startup. Auth Emulator is not production JWT signature verification.
node scripts/upgrade-home-read-model-service.mjs --source-snapshot PATH --parity-evidence PATH --status test-results/UNIQUE/status.json --ttl-minutes 60
node scripts/upgrade-home-read-model-service.mjs --self-test
POST http://127.0.0.1:5003/home with {idToken} OR Bearer + {}. No caller scope fields.
Requires lookup-verified localId verification-manager, enabled super_admin employee, phase2-fictional. No email requirement.
Only 9199 Auth Emulator and 8185 demo read-model project; no Rules/App/functions changes.
Session scope: principal UID, tenant, exact extracted App owner key, String(auth_time), canonical Vietnam clock.
One in-flight request, 32 session contexts, 256 POSTs, 15s request budget, <=60min service TTL.
Frozen fictional source: re-reading head/chunks is NOT a production event bridge; no App speed acceptance.
`;
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--self-test')await selfTest();else if(!args.length||args.includes('--help'))console.log(help);else{
    const flags=new Map();for(let i=0;i<args.length;i++){requireValue(['--source-snapshot','--parity-evidence','--status','--ttl-minutes'].includes(args[i])&&!flags.has(args[i])&&args[i+1]&&!args[i+1].startsWith('--'),'invalid-cli');flags.set(args[i],args[++i]);}
    requireValue(flags.has('--source-snapshot')&&flags.has('--parity-evidence')&&flags.has('--status'),'missing-cli-options');process.env.TZ='Asia/Ho_Chi_Minh';
    const prepared=await prepareService({sourceSnapshot:flags.get('--source-snapshot'),parityEvidence:flags.get('--parity-evidence')});
    const service=createLocalHomeService({prepared,statusFile:flags.get('--status'),ttlMinutes:Number(flags.get('--ttl-minutes')||60)});
    process.once('SIGINT',()=>{void service.close();});process.once('SIGTERM',()=>{void service.close();});console.log(JSON.stringify(await service.listen()));
  }}catch(e){console.error(JSON.stringify({status:'LOCAL_QA_SERVICE_FAILED',reason:typeof e.code==='string'&&/^[a-z0-9-]{1,96}$/.test(e.code)?e.code:'service-unavailable'}));process.exitCode=1;}}
