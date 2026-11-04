import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {getAuth,onIdTokenChanged} from 'firebase/auth';
import BusinessReportWorkspace from '../../../src/features/business-report/BusinessReportWorkspace.jsx';
import {encodeHomePrimaryCompactCache,decodeHomePrimaryCompactCache,HOME_PRIMARY_COMPACT_MAX_TTL_MS} from '../../../src/services/homePrimaryCompactCache.js';

export const HOME_READ_MODEL_PILOT_API='http://127.0.0.1:5003/home';
const project='demo-hdm-perf-verification',capabilities='four-cards-line-only';
const failure=code=>Object.assign(Error(code),{code});
const requireValue=(ok,code)=>{if(!ok)throw failure(code)};
export function canonicalPilotClock(clock,now=Date.now()){
 requireValue(clock&&['Asia/Saigon','Asia/Ho_Chi_Minh'].includes(clock.timeZone)&&clock.timezoneOffsetMinutes===-420,'scope-mismatch');
 for(const timeZone of[clock.timeZone,'Asia/Ho_Chi_Minh']){
  let parts;try{parts=new Intl.DateTimeFormat('en-GB-u-ca-gregory-nu-latn',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now)}catch{throw failure('scope-mismatch')}
  const fields={};for(const key of['year','month','day','hour','minute','second']){
   const matches=parts.filter(part=>part.type===key);requireValue(matches.length===1&&/^\d{1,4}$/.test(matches[0].value),'scope-mismatch');fields[key]=Number(matches[0].value);
  }
  const day=`${fields.year}-${String(fields.month).padStart(2,'0')}-${String(fields.day).padStart(2,'0')}`;
  const wall=Date.UTC(fields.year,fields.month-1,fields.day,fields.hour,fields.minute,fields.second);
  requireValue(day===clock.dayKey&&fields.hour<=23&&(Math.floor(now/1000)*1000-wall)/60000===-420,'scope-mismatch');
 }
 return {...clock,timeZone:'Asia/Ho_Chi_Minh'};
}
export function pilotClock(now=Date.now()){
 const date=new Date(now);
 try{return canonicalPilotClock({dayKey:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,
  timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,timezoneOffsetMinutes:date.getTimezoneOffset()},now)}catch{return {dayKey:'',timeZone:'',timezoneOffsetMinutes:null}};
}
function privacyIdentity(value,tenantId){
 let fields;try{fields=JSON.parse(value)}catch{throw failure('invalid-privacy-scope')}
 requireValue(Array.isArray(fields)&&fields[0]==='dashboard-read-scope-v1'&&fields[1]===tenantId
  &&typeof fields[2]==='string'&&fields[2]&&typeof fields[5]==='string'&&fields[5],'invalid-privacy-scope');
 // permissionKey is the existing App role-permission key (owner/accounting).
 // The entire opaque privacyScope remains the local grant/session boundary.
 return {permissionKey:fields[5]};
}
const sameScope=(a,b)=>a&&b&&['principalId','tenantId','permissionKey','sessionId','dayKey','timeZone','timezoneOffsetMinutes'].every(key=>a[key]===b[key]);
const sameClock=(a,b)=>a.dayKey===b.dayKey&&a.timeZone===b.timeZone&&a.timezoneOffsetMinutes===b.timezoneOffsetMinutes;
const matches=(entry,privacyScope,scope)=>entry?.inputs?.privacyScope===privacyScope&&sameScope(entry?.pilot?.scope,scope);
const terminal=error=>['access-denied','scope-mismatch','invalid-response','invalid-privacy-scope','auth-changed','wrong-project'].includes(error.code)
 ||['auth/unauthenticated','auth/user-disabled','auth/user-token-expired','auth/invalid-user-token'].includes(error.code);

// Wire contract: projectionVersion=1; scope.sessionId=String(verified auth_time),
// permissionKey=the verified App role-permission key; expiresAt is epoch ms.
// No caller scope/grant is sent as authority. Server verifies the ID token.
export function pilotLocalDeadline(body,receivedAt,roundTripMs){
 requireValue(Number.isSafeInteger(body.serverTime)&&Number.isSafeInteger(receivedAt)
  &&Math.abs(body.serverTime-receivedAt)<=5000,'clock-unavailable');
 requireValue(Number.isFinite(roundTripMs)&&roundTripMs>=0,'clock-unavailable');
 return Math.min(body.expiresAt,receivedAt+(body.expiresAt-body.serverTime)-roundTripMs);
}
export function verifyPilotResponse(body,scope,now=Date.now(),{receivedAt=now,roundTripMs=0}={}){
 requireValue(body&&body.state!=='denied'&&body.state!=='unauthenticated','access-denied');
 requireValue(body.projectionVersion===1&&body.capabilities===capabilities,'invalid-response');
 requireValue(sameScope(canonicalPilotClock(body.scope,now),scope),'scope-mismatch');
 requireValue(body.state==='current'&&body.current===true,'not-current');
 const localDeadline=pilotLocalDeadline(body,receivedAt,roundTripMs);
 const generated=Date.parse(body.generatedAt);
 requireValue(typeof body.generatedAt==='string'&&Number.isFinite(generated)&&generated<=body.serverTime
  &&Number.isSafeInteger(body.expiresAt)&&body.expiresAt>body.serverTime&&body.expiresAt>generated
  &&body.expiresAt-generated<=HOME_PRIMARY_COMPACT_MAX_TTL_MS
  &&body.snapshot?.generatedAt===body.generatedAt,'invalid-response');
 requireValue(localDeadline>now,'projection-expired');
 // Server time validates transport freshness only. Calendar/owner matching above
 // still uses the real local business day; generatedAt remains untouched.
 const encoded=encodeHomePrimaryCompactCache(body.snapshot,scope,{now:body.serverTime,ttlMs:body.expiresAt-generated});
 requireValue(encoded.ok,'invalid-response');
 const decoded=decodeHomePrimaryCompactCache(encoded.serialized,scope,{now:body.serverTime});
 requireValue(decoded.ok,'invalid-response');
 return decoded.snapshot;
}

export default function LocalHomeReadModelView(props){
 const {privacyScope,company,dashboardCache,isActive,primaryMode}=props;
 const [state,setState]=useState({status:'pending',entry:null,scope:null});
 const [attempt,setAttempt]=useState(0),[clock,setClock]=useState(pilotClock);
 const [routeHome,setRouteHome]=useState(false);
 const workspace=useRef(null);
 const mainIsHome=()=>workspace.current?.closest('main[data-hd-module]')?.getAttribute('data-hd-module')==='home';
 const latest=useRef();latest.current={privacyScope,tenantId:company?.id,active:isActive===true&&primaryMode===true&&routeHome,dashboardCache};
 // RetainedReadOnlyHome intentionally freezes props while hidden. Observe the
 // real shell route as well, so those frozen props cannot keep a read alive.
 useEffect(()=>{const main=workspace.current?.closest('main[data-hd-module]');
  const update=()=>setRouteHome(main?.getAttribute('data-hd-module')==='home');update();
  if(!main)return;
  const observer=new MutationObserver(update);observer.observe(main,{attributes:true,attributeFilter:['data-hd-module']});
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{const tick=()=>setClock(old=>{const next=pilotClock();return sameClock(old,next)?old:next});
  const timer=setInterval(tick,1000);return()=>clearInterval(timer)},[]);
 useEffect(()=>{
  let active=true,controller,timer,expiry,unsubscribe=()=>{},generation=0;
  const captured=latest.current;
  const current=()=>active&&captured.privacyScope===latest.current.privacyScope&&captured.tenantId===latest.current.tenantId
   &&captured.dashboardCache===latest.current.dashboardCache&&latest.current.active&&mainIsHome()&&sameClock(clock,pilotClock())&&document.visibilityState!=='hidden';
  const clearRequest=()=>{controller?.abort();clearTimeout(timer);clearTimeout(expiry)};
  const clearEntry=()=>{const entry=dashboardCache?.homePrimaryProjection;if(entry?.inputs?.privacyScope===privacyScope&&entry?.pilot)delete dashboardCache.homePrimaryProjection};
  const hidden=()=>{if(document.visibilityState==='hidden'){generation++;clearRequest();setState({status:'pending',entry:null,scope:null})}else if(active)setAttempt(n=>n+1)};
  document.addEventListener('visibilitychange',hidden);
  setState({status:'pending',entry:null,scope:null});
  if(captured.active&&window.__hdLocalHomeReadModelPilot===true){
   try{
    const auth=getAuth();requireValue(auth.app.options.projectId===project,'wrong-project');
    requireValue(clock.timeZone==='Asia/Ho_Chi_Minh','scope-mismatch');
    const identity=privacyIdentity(privacyScope,company?.id);
    requireValue(dashboardCache&&typeof dashboardCache==='object','invalid-privacy-scope');
    unsubscribe=onIdTokenChanged(auth,user=>{
     const sequence=++generation;clearRequest();
     setState({status:'pending',entry:null,scope:null});
     if(!user){clearEntry();setState({status:'denied',entry:null,scope:null});return}
     const request=new AbortController();controller=request;
     const valid=()=>current()&&generation===sequence&&!request.signal.aborted&&auth.currentUser===user;
     let scope,retained=null;
     const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(failure('timeout'));request.abort()},10000)});
     const work=async()=>{
      const claims=await user.getIdTokenResult();if(!valid())return;
      requireValue(Number.isSafeInteger(claims.claims.auth_time)&&claims.claims.auth_time>0,'auth-changed');
      scope={principalId:user.uid,tenantId:company.id,...identity,sessionId:String(claims.claims.auth_time),...clock};
      const cached=dashboardCache.homePrimaryProjection;
      retained=matches(cached,privacyScope,scope)?cached:null;
      if(retained)setState({status:'pending',entry:retained,scope});
      const idToken=await user.getIdToken();if(!valid())return;
      requireValue(claims.token===idToken,'auth-changed');
      const sentTick=performance.now();
      const response=await fetch(HOME_READ_MODEL_PILOT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken}),signal:request.signal,credentials:'omit',cache:'no-store',redirect:'error'});
      if(!valid())return;
      if(response.status===401||response.status===403)throw failure('access-denied');
      if(!response.ok)throw failure('unavailable');
      const body=await response.json();if(!valid())return;
      const receivedAt=Date.now(),receivedTick=performance.now(),roundTripMs=receivedTick-sentTick;
      const freshClaims=await user.getIdTokenResult();if(!valid())return;
      requireValue(String(freshClaims.claims.auth_time)===scope.sessionId,'auth-changed');
      const snapshot=verifyPilotResponse(body,scope,Date.now(),{receivedAt,roundTripMs});
      const localExpiresAt=pilotLocalDeadline(body,receivedAt,roundTripMs);
      const monotonicExpiresAt=receivedTick+(localExpiresAt-receivedAt);
      requireValue(monotonicExpiresAt>performance.now(),'projection-expired');
      if(!valid())return;
      const entry={inputs:{privacyScope,dashboardDayKey:clock.dayKey,dashboardClockScope:JSON.stringify([clock.dayKey,clock.timeZone,clock.timezoneOffsetMinutes])},
       snapshot,pilot:{scope,expiresAt:body.expiresAt,localExpiresAt,monotonicExpiresAt,
        resultReason:['published','verified-source-revisions','idempotent-replay'].includes(body.reason)?body.reason:''}};
      dashboardCache.homePrimaryProjection=entry;
      setState({status:'current',entry,scope});
      expiry=setTimeout(()=>{if(current()&&generation===sequence)setState({status:'pending',entry,scope})},Math.max(0,Math.min(localExpiresAt-Date.now(),monotonicExpiresAt-performance.now())));
     };
     void Promise.race([work(),timeout]).catch(error=>{
      // The timeout aborts the transport, but must still retire readiness.
      if(!current()||generation!==sequence||auth.currentUser!==user)return;
      if(terminal(error)){clearEntry();setState({status:'denied',entry:null,scope:null})}
      else setState({status:error.code==='clock-unavailable'?'clock-unavailable':'unavailable',entry:retained,scope});
     }).finally(()=>{if(generation===sequence)clearTimeout(timer)});
    });
   }catch{clearEntry();setState({status:'denied',entry:null,scope:null})}
  }
  return()=>{active=false;generation++;clearRequest();unsubscribe();document.removeEventListener('visibilitychange',hidden)};
 },[privacyScope,company?.id,dashboardCache,isActive,primaryMode,routeHome,attempt,clock]);
 let authUser=null;try{authUser=getAuth().currentUser}catch{}
 const visible=latest.current.active&&mainIsHome()&&document.visibilityState!=='hidden'&&window.__hdLocalHomeReadModelPilot===true
  &&state.scope?.principalId===authUser?.uid&&state.scope?.tenantId===company?.id
  &&sameClock(clock,pilotClock())&&matches(state.entry,privacyScope,{...state.scope,...clock});
 const ready=Boolean(visible&&state.status==='current'&&state.entry.pilot.localExpiresAt>Date.now()&&state.entry.pilot.monotonicExpiresAt>performance.now());
 useLayoutEffect(()=>{workspace.current?.querySelectorAll('.business-report-kpi,.business-report-text-action,.business-report-assistant-fab').forEach(button=>{
  button.disabled=true;button.setAttribute('data-hd-qa-unavailable','QA: phân tích chi tiết và AI chưa được hỗ trợ.');
 })});
 return <section data-hd-home-read-model-ready={String(ready)} data-hd-home-read-model-state={state.status} data-hd-home-read-model-principal={visible?state.scope.principalId:''}
  data-hd-home-read-model-tenant={visible?state.scope.tenantId:''} data-hd-home-read-model-capabilities={capabilities}
  data-hd-home-read-model-result={ready&&state.entry.pilot.resultReason?state.entry.pilot.resultReason:undefined} aria-busy={!ready}>
  <p role={state.status==='denied'?'alert':'status'}>QA cục bộ · Chỉ bốn chỉ số và biểu đồ; chưa chứng minh tương đương toàn ứng dụng.
   {' '}{state.status==='denied'?'Không có quyền đọc báo cáo.':state.status==='clock-unavailable'?'Nguồn chưa khả dụng: chưa xác minh được đồng hồ thiết bị.':ready?'Đã đối chiếu nguồn hiện tại.':visible?'Số liệu lưu trong RAM · Đang đối chiếu / nguồn chưa khả dụng.':'Nguồn chưa khả dụng · Đang đối chiếu.'}</p>
  <button type="button" onClick={()=>setAttempt(n=>n+1)}>Đối chiếu lại</button>
  {/* Capture detail/AI clicks before the workspace can switch to an unsupported
      route. Date/chart controls and explicit shell navigation remain usable. */}
  <div ref={workspace} onClickCapture={event=>{const button=event.target.closest?.('button');if(button&&(button.classList.contains('business-report-kpi')||button.classList.contains('business-report-text-action')||button.classList.contains('business-report-assistant-fab'))){event.preventDefault();event.stopPropagation()}}}>
   <BusinessReportWorkspace snapshot={visible?state.entry.snapshot:null} sourcePending={!ready} detailsError="QA: phân tích chi tiết và AI chưa được hỗ trợ."
    employee={props.employee} accountName={props.accountName} companyName={company?.name||'Doanh nghiệp'}
    companyLogoUrl={company?.logoUrl||''} notificationUnreadCount={props.notificationUnreadCount} setActiveTab={props.setActiveTab}/>
  </div>
 </section>;
}
