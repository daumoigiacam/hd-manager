import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {readEmployeeHomeScreenModel} from '../services/employeeHomeReadModelClient.js';

// Optional, currently unconnected to App. Availability is NOT readiness: the
// actual model renderer must acknowledge the exact object after its DOM commit.
// This owns no legacy collection flags, authentication state or cached money.
export function useEmployeeHomeReadModel({enabled,projectId,appId,actor,date,timeZone,domainVersion,getIdToken,revision,
 read=readEmployeeHomeScreenModel,timeoutMs=4500}){
 const [attempt,setAttempt]=useState(0),[state,setState]=useState(null),[committed,setCommitted]=useState(null);
 const request=useMemo(()=>({enabled:Boolean(enabled),projectId,appId,actor:{uid:actor?.uid,companyId:actor?.companyId,employeeId:actor?.employeeId},
  date,timeZone,domainVersion,getIdToken,read,timeoutMs,revision}),
 [enabled,projectId,appId,actor?.uid,actor?.companyId,actor?.employeeId,date,timeZone,domainVersion,getIdToken,read,timeoutMs,revision,attempt]);
 const latest=useRef(request);latest.current=request;
 const current=enabled&&state?.request===request;
 const available=current&&!state.error&&state.result;
 const publication=useRef(null);publication.current=available?{request,result:state.result}:null;
 useEffect(()=>{
  if(!request.enabled)return;
  let active=true;const controller=new AbortController();
  const isCurrent=()=>active&&!controller.signal.aborted&&latest.current===request;
  void Promise.resolve().then(()=>{
   if(!isCurrent())return null;
   return request.read({...request,signal:controller.signal,isCurrent});
  }).then(result=>{
   if(!isCurrent())return;
   if(!result?.model||result.kind!=='hd-employee-home-model-v1')throw new TypeError('Invalid employee Home publication.');
   setState({request,result});
  }).catch(error=>{if(isCurrent())setState({request,error})});
  return()=>{active=false;controller.abort()};
 },[request]);
 const acknowledgeCommit=useCallback(result=>{
  const live=publication.current;
  if(!request.enabled||latest.current!==request||live?.request!==request||live.result!==result)return false;
  setCommitted(previous=>previous?.request===request&&previous.result===result?previous:{request,result});return true;
 },[request]);
 const ready=Boolean(available&&committed?.request===request&&committed.result===state.result);
 return {status:!enabled?'disabled':current&&state.error?'error':ready?'ready':available?'available':'pending',
  result:available?state.result:null,error:current?state.error||null:null,ready,acknowledgeCommit,retry:()=>setAttempt(value=>value+1)};
}
