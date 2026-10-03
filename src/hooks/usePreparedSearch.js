import { useEffect, useState } from 'react';
import { createSearchRecordIndexAsync, hasSearchQuery } from '../services/searchEngine.js';

export function usePreparedSearch(records, getFields, query, orderedRecords, membership, orderRanks) {
  const [prepared, setPrepared] = useState(null);
  const [failure, setFailure] = useState(null);
  const [answer, setAnswer] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setFailure(null);
    createSearchRecordIndexAsync(records, getFields, { signal: controller.signal })
      .then(index => { if (!controller.signal.aborted) setPrepared({ records, getFields, index }); })
      .catch(error => { if (!controller.signal.aborted) setFailure({ records, getFields, error }); });
    return () => controller.abort();
  }, [records, getFields]);
  const ready = prepared?.records === records && prepared?.getFields === getFields;
  const index = ready ? prepared.index : null;
  useEffect(() => {
    if (!index || !hasSearchQuery(query)) return;
    const controller = new AbortController();
    index.searchAsync(query, { signal: controller.signal, orderedRecords, membership, orderRanks })
      .then(results => { if (!controller.signal.aborted) setAnswer({ index, query, orderedRecords, membership, orderRanks, results }); })
      .catch(error => { if (!controller.signal.aborted) setFailure({ records, getFields, index, query, orderedRecords, membership, orderRanks, error }); });
    return () => controller.abort();
  }, [index, query, orderedRecords, membership, orderRanks, records, getFields]);
  const answerReady = answer?.index === index && answer?.query === query
    && answer?.orderedRecords === orderedRecords && answer?.membership === membership && answer?.orderRanks === orderRanks;
  const failureCurrent = !failure?.index || (failure.index === index && failure.query === query
    && failure.orderedRecords === orderedRecords && failure.membership === membership && failure.orderRanks === orderRanks && !answerReady);
  const error = failureCurrent && failure?.records === records && failure?.getFields === getFields ? failure.error : null;
  return { index, results: answerReady ? answer.results : [], pending: hasSearchQuery(query) && !answerReady && !error, error };
}
