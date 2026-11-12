import {startupMark} from '../services/offlineStartupTrace.js';
const fields=['projectId','tenantId','principalId','permissionRevision','sessionId','deviceId'];
export function eligibleLaunchCache(packet,{scope,capabilities,now=Date.now(),expiresAtMs,dayKey}){
 if(!packet||packet.version!==1||!Number.isSafeInteger(expiresAtMs)||now>=expiresAtMs)return false;
 if(!fields.every(k=>typeof scope[k]==='string'&&scope[k]&&packet.scope?.[k]===scope[k]))return false;
 if(!capabilities.includes('home.read')||JSON.stringify([...capabilities].sort())!==JSON.stringify(packet.capabilities))return false;
 const r=packet.result;
 return Boolean(r?.overviewVersion&&r.snapshot?.finance&&r.periodReports&&r.pendingIncluded===false&&r.status==='LOCAL_COPY'&&r.dayKey===dayKey&&Number.isSafeInteger(r.capturedAt)&&r.capturedAt<=now&&Number.isSafeInteger(packet.savedAt)&&packet.savedAt<=now&&now-packet.savedAt<=3600000);
}
export function createNativeHomeLaunchCache({readEncrypted,writeEncrypted,digest,secureStore,clock=Date.now}){
 let lastSaved='';
 const key=async scope=>'offline-home-launch-v1:'+await digest(JSON.stringify([scope.projectId,scope.tenantId,scope.principalId,scope.permissionRevision,scope.deviceId]));
 const day=now=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
 return Object.freeze({
  async read(context){
   const end=()=>startupMark('home.launch-cache-read.end');startupMark('home.launch-cache-read.start');
   try{const packet=await readEncrypted(await key(context.scope));if(!eligibleLaunchCache(packet,{...context,now:clock(),dayKey:day(clock())})){startupMark('home.launch-cache-miss');return null;}startupMark('home.launch-cache-hit');return packet.result;}catch{startupMark('home.launch-cache-unavailable');return null;}finally{end();}
  },
  async save(context,result){
   if(!context.isCurrent()||!result?.overviewVersion||result.pendingIncluded!==false)return;
   const id=JSON.stringify([context.scope,result.generation,result.feedSeq,result.capturedAt]);if(id===lastSaved)return;
   const packet={version:1,scope:{...context.scope},capabilities:[...context.capabilities].sort(),savedAt:clock(),result};
   if(!eligibleLaunchCache(packet,{...context,now:clock(),dayKey:day(clock())}))return;
   const json=JSON.stringify(packet);if(json.length>262144)return;
   await secureStore.withRecord(async record=>{
    if(!context.isCurrent()||record?.revoked||!fields.every(k=>record?.identity?.[k]===context.scope[k]))return;
    await writeEncrypted(await key(context.scope),json);if(context.isCurrent()){lastSaved=id;startupMark('home.launch-cache-saved');}
   });
  },
 });
}
