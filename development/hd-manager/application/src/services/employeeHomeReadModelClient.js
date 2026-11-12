import {validateEmployeeHomeScreenDto} from './employeeHomeScreenDto.js';
const maxBytes=131072;
const failure=(code,httpStatus)=>Object.assign(new Error(code),{code,httpStatus});
const abort=()=>new DOMException('Employee Home request cancelled.','AbortError');
const identifier=value=>typeof value==='string'&&value.length>0&&value.length<=512&&!value.includes('/');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const validReadTime=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/.test(value)
 &&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,19)===value.slice(0,19);

export function getEmployeeHomeReadModelUrl(projectId){
 if(typeof projectId!=='string'||!/^[a-z][a-z0-9-]{3,62}$/.test(projectId))throw new TypeError('Invalid employee Home project.');
 return `https://asia-southeast1-${projectId}.cloudfunctions.net/employeeHomeBootstrapRegional`;
}

async function readJson(response,signal){
 if(Number(response.headers?.get?.('content-length'))>maxBytes)throw failure('home_response_limit');
 const reader=response.body?.getReader?.();let bytes=0,text;
 if(reader){
  const chunks=[],cancel=()=>{void reader.cancel().catch(()=>{})};signal.addEventListener('abort',cancel,{once:true});
  try{
   for(;;){if(signal.aborted)throw abort();const step=await reader.read();if(step.done)break;
    if(!(step.value instanceof Uint8Array)||(bytes+=step.value.byteLength)>maxBytes)throw failure('home_response_limit');chunks.push(step.value)}
   const combined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.byteLength}
   text=new TextDecoder('utf-8',{fatal:true}).decode(combined);
  }catch(error){cancel();throw error}finally{signal.removeEventListener('abort',cancel);reader.releaseLock()}
 }else{
  text=await response.text();if(new TextEncoder().encode(text).byteLength>maxBytes)throw failure('home_response_limit');
 }
 if(signal.aborted)throw abort();try{return JSON.parse(text)}catch{throw failure('invalid_home_response')}
}

// Inactive groundwork: no caller in App, no default network request. Does not
// sign in/out, mutate source arrays or fabricate legacy collection readiness.
export async function readEmployeeHomeScreenModel({projectId,appId,actor,date,timeZone,domainVersion,getIdToken,
 signal,isCurrent,fetchImpl=globalThis.fetch,nonceFactory=()=>crypto.randomUUID(),timeoutMs=4500}){
 const url=getEmployeeHomeReadModelUrl(projectId);
 if(!identifier(appId)||!actor||!['uid','companyId','employeeId'].every(k=>identifier(actor[k]))
  ||!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date
  ||typeof timeZone!=='string'||timeZone.length>80||!/^[a-f0-9]{64}$/.test(domainVersion)||typeof getIdToken!=='function'
  ||typeof fetchImpl!=='function'||typeof isCurrent!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw new TypeError('Verified employee Home request required.');
 try{new Intl.DateTimeFormat('en',{timeZone}).format(0)}catch{throw new TypeError('Invalid employee Home timezone.')}
 const captured={uid:actor.uid,companyId:actor.companyId,employeeId:actor.employeeId,date,timeZone,monthKey:date.slice(0,7),nonce:nonceFactory()};
 if(typeof captured.nonce!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(captured.nonce))throw new TypeError('Secure employee Home request nonce required.');
 if(signal?.aborted||!isCurrent())throw abort();
 const controller=new AbortController();let timer,timedOut=false,rejectAbort,tokenStage=true;
 const cancelled=new Promise((_resolve,reject)=>{rejectAbort=reject});
 const externalAbort=()=>controller.abort();
 const internalAbort=()=>rejectAbort(timedOut?failure('home_request_timeout'):abort());
 controller.signal.addEventListener('abort',internalAbort,{once:true});signal?.addEventListener('abort',externalAbort,{once:true});
 const check=()=>{if(controller.signal.aborted||!isCurrent()||['uid','companyId','employeeId'].some(k=>actor[k]!==captured[k])){controller.abort();throw abort()}};
 timer=setTimeout(()=>{timedOut=true;controller.abort()},timeoutMs);
 const operation=async()=>{
  const token=await getIdToken();check();if(typeof token!=='string'||!token||token.length>65536||!/^[A-Za-z0-9._-]+$/.test(token))throw failure('home_identity_token_required');tokenStage=false;
  const response=await fetchImpl(url,{method:'POST',mode:'cors',credentials:'omit',cache:'no-store',signal:controller.signal,
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({appId,date,timeZone,nonce:captured.nonce})});
  check();if(!response?.ok)throw failure('home_http_error',response?.status);
  const value=await readJson(response,controller.signal);check();
  if(!exact(value,['success','kind','domainVersion','model','readTime','scope'])||value.success!==true||value.kind!=='hd-employee-home-model-v1'
   ||value.domainVersion!==domainVersion||!validReadTime(value.readTime)
   ||!exact(value.scope,Object.keys(captured))||Object.keys(captured).some(k=>value.scope[k]!==captured[k]))throw failure('home_response_scope_mismatch');
  try{validateEmployeeHomeScreenDto(value.model)}catch{throw failure('invalid_home_response')}
  if(value.model.monthKey!==captured.monthKey)throw failure('home_response_period_mismatch');
  check();return freeze(value);
 };
 try{return await Promise.race([operation(),cancelled])}catch(error){
  if(timedOut)throw failure('home_request_timeout');
  if(controller.signal.aborted||error?.name==='AbortError')throw abort();
  const allowed=['home_response_limit','invalid_home_response','home_response_scope_mismatch','home_response_period_mismatch','home_identity_token_required','home_http_error'];
  throw failure(allowed.includes(error?.code)?error.code:tokenStage?'home_identity_token_required':'home_request_failed',
   [400,401,403,404,409,413,429,500,503].includes(error?.httpStatus)?error.httpStatus:undefined);
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',externalAbort);controller.signal.removeEventListener('abort',internalAbort);controller.abort()}
}
