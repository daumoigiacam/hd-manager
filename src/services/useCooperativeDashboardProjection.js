import {hasSameDashboardProjectionScope} from './homeProjectionScope.js';
import {createHomePerformanceProbe} from './homePerformanceProbe.js';
import {createOnlineHomeProjectionClient} from './onlineHomeProjectionClient.js';
import {useEffect,useLayoutEffect,useRef,useState,startTransition} from 'react';
import {createSalesRevenueIndexScope} from '../utils/salesRevenuePeriod.js';
import {createExecutiveDashboardSnapshotIterator} from './executiveDashboardService.js';
import {createHomePrimarySnapshotIterator} from './executiveDashboardService.js';
import {restoreHomeSessionReport,saveHomeSessionReport} from './homeSessionReport.js';
import {runCooperativeReportProjection as runCooperativeProjection} from './cooperativeReportProjection.js';

const equalInputs=(a,b)=>a===b || Boolean(a && b && Object.keys(a).length===Object.keys(b).length
  && Object.keys(b).every(key=>Object.is(a[key],b[key])));

export function useCooperativeDashboardProjection(inputs,cache,buildPayrollSteps,{enabled=true,primaryReady=false}={}) {
 const probe=useRef(null);if(!probe.current)probe.current=createHomePerformanceProbe('full');
 useEffect(()=>()=>probe.current.close(),[]);
 const calculationOwner=useRef(null);
 useEffect(()=>()=>{calculationOwner.current?.close();calculationOwner.current=null;},[]);
  const [result,setResult]=useState(()=>hasSameDashboardProjectionScope(cache.cooperativeProjection?.inputs,inputs)?cache.cooperativeProjection:restoreHomeSessionReport(inputs));
  const [failure,setFailure]=useState(null);
  const [attempt,setAttempt]=useState(0);
  const latest=useRef(inputs);latest.current=inputs;
  useEffect(()=>{
    let active=true;
    const isCurrent=()=>active && latest.current===inputs;
    const publish=projection=>{
      if(!isCurrent())return;
      probe.current.start('render-commit');cache.cooperativeProjection=projection;
      startTransition(()=>setResult(previous=>isCurrent()?projection:previous));
    };
    setFailure(null);
    // Initial hydration updates many raw source props independently. Do not
    // rebuild financial/payroll reports for incomplete prefixes of the data.
    // A retained same-scope report remains pending, never newly authoritative.
    const mode=enabled?'full':primaryReady?'primary':null;
    if(!mode)return()=>{active=false};
    if(cache.cooperativeProjection?.mode===mode&&equalInputs(cache.cooperativeProjection?.inputs,inputs)) {
      publish({...cache.cooperativeProjection,inputs});
      return()=>{active=false};
    }
    void (async()=>{
    probe.current.once('sources-ready');if(cache.cooperativeProjection?.inputs)probe.current.once('cache-recalculation',{changedInputs:Object.keys(inputs).filter(key=>!Object.is(cache.cooperativeProjection.inputs[key],inputs[key]))});const calculationSpan=probe.current.start('calculation');
    let payrollCosts,snapshot,workerTimings,clientTimings;
    try {
     if(!calculationOwner.current)calculationOwner.current=createOnlineHomeProjectionClient();
     ({payrollCosts,snapshot,timings:workerTimings,clientTimings}=await calculationOwner.current.calculate(inputs,mode));
    } catch(error) {
     if(error.name==='AbortError'||!isCurrent())throw error;
     // Older WebViews or non-cloneable provider values retain the proven path.
      const runStep=createSalesRevenueIndexScope();
      payrollCosts=await runCooperativeProjection(buildPayrollSteps(inputs),{isCurrent,runStep});
      snapshot=await runCooperativeProjection((mode==='primary'?createHomePrimarySnapshotIterator:createExecutiveDashboardSnapshotIterator)({...inputs,payrollCosts}),{isCurrent});

    }
    probe.current.end('calculation',{current:isCurrent(),projectionMode:mode,execution:workerTimings?'worker':'cooperative',workerTimings,clientTimings},calculationSpan);
      if(isCurrent())publish({inputs,snapshot,mode});
    })().catch(error=>{if(isCurrent() && error.name!=='AbortError')setFailure({inputs})});
    return()=>{active=false};
  },[inputs,cache,buildPayrollSteps,attempt,enabled,primaryReady]);
  // A previous tenant/permission snapshot must disappear in this render, before
  // effect cleanup or a new calculation. Same-scope old data remains visibly busy.
  const sameScope=hasSameDashboardProjectionScope(result?.inputs,inputs);
 useLayoutEffect(()=>{if(result?.snapshot&&sameScope){probe.current.once('first-data-commit',{restored:result.restored===true,projectionMode:result.mode||'full'});probe.current.end('render-commit');}},[result,sameScope]);
 // Persist only after publication, on a background task; never in the source
 // ACK or save/commit path. Cleanup prevents an old scope saving after logout.
 useEffect(()=>{if(!sameScope||!result?.snapshot||result.restored)return undefined;
  const timer=setTimeout(()=>{const span=probe.current.start('session-report-save');const saved=saveHomeSessionReport(result);probe.current.end('session-report-save',{saved});},0);return()=>clearTimeout(timer);
 },[result,sameScope]);
  return {snapshot:sameScope?result?.snapshot:null,pending:!enabled || !sameScope || !equalInputs(result?.inputs,inputs),
    failed:failure?.inputs===inputs,retry:()=>setAttempt(n=>n+1)};
}
