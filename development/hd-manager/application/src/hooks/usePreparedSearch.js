import { useEffect, useMemo, useState } from 'react';
import { createSearchRecordIndexAsync, hasSearchQuery } from '../services/searchEngine.js';
const EMPTY_SEARCH_ROWS=Object.freeze([]);

export function usePreparedSearch(records, getFields, query, orderedRecords, membership, orderRanks, {warmup=false}={}) {
  const [prepared, setPrepared] = useState(null);
  const [failure, setFailure] = useState(null);
  const [answer, setAnswer] = useState(null);
  const requested=hasSearchQuery(query);
  useEffect(() => {
    // Opening a list with no search must not normalize every historical row.
    // A retained matching index can still serve the next nonempty query.
    if((!requested&&!warmup)||prepared?.records===records&&prepared?.getFields===getFields)return;
    const controller = new AbortController();
    let timer=null,idle=null;
    const prepare=()=>{
     if(controller.signal.aborted)return;
     setFailure(null);
     createSearchRecordIndexAsync(records, getFields, { signal: controller.signal })
      .then(index => { if (!controller.signal.aborted) setPrepared({ records, getFields, index }); })
      .catch(error => { if (!controller.signal.aborted) setFailure({ records, getFields, error }); });
    };
    // Optional view-owned warmup starts after the first commit and yields in
    // bounded batches. It shares the same index as on-demand search. Hidden
    // views and unmounts cancel it; no second cache or stale result is exposed.
    const schedule=()=>{if(document.hidden)return;document.removeEventListener('visibilitychange',schedule);
     timer=setTimeout(()=>{if(typeof requestIdleCallback==='function')idle=requestIdleCallback(prepare,{timeout:2000});else prepare()},250)};
    if(requested)prepare();else if(document.hidden)document.addEventListener('visibilitychange',schedule);else schedule();
    return () => {controller.abort();clearTimeout(timer);if(idle!==null&&typeof cancelIdleCallback==='function')cancelIdleCallback(idle);document.removeEventListener('visibilitychange',schedule)};
  }, [records, getFields, requested, prepared,warmup]);
  const ready = prepared?.records === records && prepared?.getFields === getFields;
  const index = ready ? prepared.index : null;
  const fastAnswer=useMemo(()=>index&&requested&&!orderedRecords&&!membership&&!orderRanks
    ?index.searchIfSmall(query):null,[index,requested,query,orderedRecords,membership,orderRanks]);
  useEffect(() => {
    if (!index || !hasSearchQuery(query)||fastAnswer!==null) return;
    const controller = new AbortController();
    index.searchAsync(query, { signal: controller.signal, orderedRecords, membership, orderRanks })
      .then(results => { if (!controller.signal.aborted) setAnswer({ index, query, orderedRecords, membership, orderRanks, results }); })
      .catch(error => { if (!controller.signal.aborted) setFailure({ records, getFields, index, query, orderedRecords, membership, orderRanks, error }); });
    return () => controller.abort();
  }, [index, query, orderedRecords, membership, orderRanks, records, getFields,fastAnswer]);
  const answerReady = fastAnswer!==null || answer?.index === index && answer?.query === query
    && answer?.orderedRecords === orderedRecords && answer?.membership === membership && answer?.orderRanks === orderRanks;
  const failureCurrent = !failure?.index || (failure.index === index && failure.query === query
    && failure.orderedRecords === orderedRecords && failure.membership === membership && failure.orderRanks === orderRanks && !answerReady);
  const error = requested && failureCurrent && failure?.records === records && failure?.getFields === getFields ? failure.error : null;
  return { index, results: fastAnswer??(answerReady ? answer.results : EMPTY_SEARCH_ROWS), pending: requested && !answerReady && !error, error };
}
