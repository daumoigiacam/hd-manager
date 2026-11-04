import {useEffect,useRef,useState,startTransition} from 'react';
import {createSalesRevenueIndexScope} from '../utils/salesRevenuePeriod.js';
import {createExecutiveDashboardSnapshotIterator} from './executiveDashboardService.js';
import {runCooperativeReportProjection as runCooperativeProjection} from './cooperativeReportProjection.js';

const equalInputs=(a,b)=>a===b || Boolean(a && b && Object.keys(a).length===Object.keys(b).length
  && Object.keys(b).every(key=>Object.is(a[key],b[key])));

export function useCooperativeDashboardProjection(inputs,cache,buildPayrollSteps,{enabled=true}={}) {
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
    // Initial hydration updates many raw source props independently. Do not
    // rebuild financial/payroll reports for incomplete prefixes of the data.
    // A retained same-scope report remains pending, never newly authoritative.
    if(!enabled)return()=>{active=false};
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
  },[inputs,cache,buildPayrollSteps,attempt,enabled]);
  // A previous tenant/permission snapshot must disappear in this render, before
  // effect cleanup or a new calculation. Same-scope old data remains visibly busy.
  const sameScope=result?.inputs.company?.id===inputs.company?.id && result?.inputs.employee?.id===inputs.employee?.id
    && (typeof inputs.privacyScope==='string' ? result?.inputs.privacyScope===inputs.privacyScope
      : result?.inputs.company===inputs.company && result?.inputs.employee===inputs.employee);
  return {snapshot:sameScope?result?.snapshot:null,pending:!enabled || !sameScope || !equalInputs(result?.inputs,inputs),
    failed:failure?.inputs===inputs,retry:()=>setAttempt(n=>n+1)};
}
