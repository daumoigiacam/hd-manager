import {runCooperativeProjection} from './cooperativeProjection.js';

const checkCurrent = isCurrent => {
  if(!isCurrent())throw Object.assign(new Error('Report projection superseded.'),{name:'AbortError'});
};

// Use the existing scheduler. Restore per-job synchronous caches before every
// task boundary, and reject superseded results before they can be published.
export function runCooperativeReportProjection(iterator, {
  isCurrent=()=>true,runStep=calculate=>calculate(),yieldWork,now,budgetMs=4,
}={}) {
  if(!iterator || typeof iterator.next!=='function')throw new TypeError('Invalid report iterator.');
  return runCooperativeProjection(()=>({
    next(){checkCurrent(isCurrent);const step=runStep(()=>iterator.next());checkCurrent(isCurrent);return step},
    return(){return typeof iterator.return==='function'?runStep(()=>iterator.return()):{done:true}},
  }),{signal:{get aborted(){return !isCurrent()}},yieldTask:yieldWork,now,budgetMs});
}
