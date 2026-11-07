import {createOnlineHomeProjectionClient} from './onlineHomeProjectionClient.js';
import {useEffect,useRef,useState,startTransition} from 'react';
import {createSalesRevenueIndexScope} from '../utils/salesRevenuePeriod.js';
import {runCooperativeReportProjection} from './cooperativeReportProjection.js';
import {createHomePrimarySnapshotIterator} from './executiveDashboardService.js';
const equalInputs=(a,b)=>a===b||Boolean(a&&b&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(key=>Object.is(a[key],b[key])));
export const hasSameHomeProjectionScope=(previous,next)=>Boolean(previous&&next
 &&typeof next.privacyScope==='string'&&next.privacyScope
 &&typeof next.dashboardDayKey==='string'&&next.dashboardDayKey
 &&typeof next.dashboardClockScope==='string'&&next.dashboardClockScope
 &&previous.privacyScope===next.privacyScope
 &&previous.dashboardDayKey===next.dashboardDayKey
 &&previous.dashboardClockScope===next.dashboardClockScope);
// Reuse the authenticated dashboard-cache owner; no additional data store or
// subscription. Only a complete, same-scope read projection can be retained.
export function useHomePrimaryProjection(inputs,cache,buildPayrollSteps,{enabled=false}={}){
 const calculationOwner=useRef(null);
 useEffect(()=>()=>{calculationOwner.current?.close();calculationOwner.current=null;},[]);
 const [result,setResult]=useState(()=>hasSameHomeProjectionScope(cache.homePrimaryProjection?.inputs,inputs)?cache.homePrimaryProjection:null);
 const [failure,setFailure]=useState(null),[attempt,setAttempt]=useState(0);
 const latest=useRef(inputs);latest.current=inputs;
 useEffect(()=>{
  let active=true;const isCurrent=()=>active&&latest.current===inputs;
  setFailure(null);
  const publish=value=>{if(!isCurrent())return;cache.homePrimaryProjection=value;startTransition(()=>setResult(previous=>isCurrent()?value:previous))};
  if(enabled){
   if(equalInputs(cache.homePrimaryProjection?.inputs,inputs))publish({...cache.homePrimaryProjection,inputs});
   else void(async()=>{
    let payrollCosts,snapshot;
    try {
     if(!calculationOwner.current)calculationOwner.current=createOnlineHomeProjectionClient();
     ({payrollCosts,snapshot}=await calculationOwner.current.calculate(inputs,'primary'));
    } catch(error) {
     if(error.name==='AbortError'||!isCurrent())throw error;
     // Older WebViews or non-cloneable provider values retain the proven path.
    payrollCosts=await runCooperativeReportProjection(buildPayrollSteps(inputs),{isCurrent,runStep:createSalesRevenueIndexScope()});
    snapshot=await runCooperativeReportProjection(createHomePrimarySnapshotIterator({...inputs,payrollCosts}),{isCurrent});

    }
    publish({inputs,snapshot});
   })().catch(error=>{if(isCurrent()&&error.name!=='AbortError')setFailure({inputs})});
  }
  return()=>{active=false};
 },[inputs,cache,buildPayrollSteps,enabled,attempt]);
 const sameScope=hasSameHomeProjectionScope(result?.inputs,inputs);
 return {snapshot:sameScope?result.snapshot:null,pending:!enabled||!sameScope||!equalInputs(result?.inputs,inputs),failed:failure?.inputs===inputs,retry:()=>setAttempt(n=>n+1)};
}
