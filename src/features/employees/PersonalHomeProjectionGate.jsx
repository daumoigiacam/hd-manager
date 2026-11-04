import {useMemo,useEffect,useState,useRef} from 'react';
import {createProjectionCache} from '../../services/cooperativeProjection.js';
import {runPersonalHomeProjection} from '../../services/personalHomeProjectionClient.js';
import {PERSONAL_HOME_INPUT_KINDS} from '../../services/personalHomeProjectionProtocol.js';
import {encodeFirestoreNativeValue,decodeFirestoreNativeValue} from '@hd/personal-home-values';
import {CompletedProjectionGate} from '../../hooks/CompletedProjectionGate.jsx';
const cache=createProjectionCache({maxScopes:4});
const names=Object.keys(PERSONAL_HOME_INPUT_KINDS);

export default function PersonalHomeProjectionGate({input,privacyScope,config,db,enabled,children,onReadinessChange,onTiming,prepareInput}) {
 const timingCallback=useRef(onTiming);timingCallback.current=onTiming;
 const traceEnabled=Boolean(onTiming);
 const refs=names.map(name=>input[name]);
 // Exact immutable source identities + privacy scope/month. No date/amount
 // heuristics, stale result reuse or partial-source readiness.
 const request=useMemo(()=>({input,privacyScope}),[...refs,input.monthKey,privacyScope]);
 const entry=enabled?cache(refs,JSON.stringify([privacyScope,input.monthKey])):null;
 const [state,setState]=useState(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(!enabled||entry.complete)return;
  const controller=new AbortController();
  runPersonalHomeProjection({input:request.input,config,signal:controller.signal,prepareInput,
   onTiming:traceEnabled?data=>timingCallback.current?.(data):undefined,
   encode:value=>encodeFirestoreNativeValue(value,db),decode:value=>decodeFirestoreNativeValue(value,db)})
   .then(value=>{if(!controller.signal.aborted){entry.value=value;entry.complete=true;setState({request,value})}})
   .catch(error=>{if(!controller.signal.aborted)setState({request,error})});
  return ()=>controller.abort();
 },[enabled,request,entry,attempt,config,db,traceEnabled,prepareInput]);
 const ready=!enabled||entry?.complete||state?.request===request&&!state.error&&Boolean(state.value);
 useEffect(()=>{
  onReadinessChange?.(Boolean(ready));
  return ()=>onReadinessChange?.(false);
 },[ready,request,onReadinessChange]);
 if(!enabled)return children(null);
 const current=state?.request===request;
 const value=entry.complete?entry.value:current?state.value:null;
 const error=!entry.complete&&current?state.error:null;
 return <CompletedProjectionGate key={privacyScope} projection={{pending:!entry.complete&&!current,error}}
  retainWhilePending retainIdentity={JSON.stringify([privacyScope,input.monthKey])} disableRetainedInteraction
  onRetry={()=>{setState(null);setAttempt(value=>value+1)}}
  pendingContent={<div data-hd-module-loading aria-busy="true" role="status" className="p-4 text-sm text-slate-600">Đang tính dữ liệu Trang chủ…</div>}
  errorContent="Chưa tính được lương và đánh giá. Vui lòng thử lại.">
  {()=>children(value)}
 </CompletedProjectionGate>;
}
