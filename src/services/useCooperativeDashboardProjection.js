import {useEffect,useRef,useState,startTransition} from 'react';
import {createSalesRevenueIndexScope} from '../utils/salesRevenuePeriod.js';
import {createExecutiveDashboardSnapshotIterator} from './executiveDashboardService.js';
import {runCooperativeReportProjection as runCooperativeProjection} from './cooperativeReportProjection.js';

const equalInputs=(a,b)=>a===b || Boolean(a && b && Object.keys(a).length===Object.keys(b).length
  && Object.keys(b).every(key=>Object.is(a[key],b[key])));

export function useCooperativeDashboardProjection(inputs,cache,buildPayrollSteps) {
  const [result,setResult]=useState(()=>equalInputs(cache.cooperativeProjection?.inputs,inputs)?cache.cooperativeProjection:null);
  const [failure,setFailure]=useState(null);
  const [attempt,setAttempt]=useState(0);
  const latest=useRef(inputs);latest.current=inputs;
  useEffect(()=>{
    let active=true;
    const isCurrent=()=>active && latest.current===inputs;
    const publish=projection=>{
      if(!isCurrent())return;
      cache.cooperativeProjection=projection;
      startTransition(()=>setResult(previous=>isCurrent()?projection:previous));
    };
    setFailure(null);
    if(equalInputs(cache.cooperativeProjection?.inputs,inputs)) {
      publish({...cache.cooperativeProjection,inputs});
      return()=>{active=false};
    }
    void (async()=>{
      const runStep=createSalesRevenueIndexScope();
      const payrollCosts=await runCooperativeProjection(buildPayrollSteps(inputs),{isCurrent,runStep});
      const snapshot=await runCooperativeProjection(createExecutiveDashboardSnapshotIterator({...inputs,payrollCosts}),{isCurrent});
      publish({inputs,snapshot});
    })().catch(error=>{if(isCurrent() && error.name!=='AbortError')setFailure({inputs})});
    return()=>{active=false};
  },[inputs,cache,buildPayrollSteps,attempt]);
  // A previous tenant/permission snapshot must disappear in this render, before
  // effect cleanup or a new calculation. Same-scope old data remains visibly busy.
  const sameScope=result?.inputs.company===inputs.company && result?.inputs.employee===inputs.employee;
  return {snapshot:sameScope?result?.snapshot:null,pending:!sameScope || !equalInputs(result?.inputs,inputs),
    failed:failure?.inputs===inputs,retry:()=>setAttempt(n=>n+1)};
}
