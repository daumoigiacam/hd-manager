/**
 * Shared, client-side search engine for HD Manager entities already loaded in
 * memory. It never mutates source records or causes Firestore reads.
 */

const isSearchableValue = (value) => value !== null && value !== undefined && `${value}`.trim() !== '';

export const normalizeSearchText = (value = '') => `${value}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\u0111/g, 'd')
  .replace(/\u0110/g, 'D')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

export const collapseSearchText = (value = '') => normalizeSearchText(value).replace(/\s+/g, '');

export const tokenizeSearchQuery = (value = '') => normalizeSearchText(value)
  .split(' ')
  .filter(Boolean);

export const hasSearchQuery = (value = '') => tokenizeSearchQuery(value).length > 0 || /\d/.test(`${value || ''}`);

const normalizeDigits = (value = '') => `${value || ''}`.replace(/\D/g, '');
const asList = (value) => Array.isArray(value) ? value : [value];
const unique = (values = []) => [...new Set(values.filter(isSearchableValue).map(value => `${value}`.trim()))];
const collectValues = (fields = []) => fields.flatMap((field) => asList(field?.value ?? field?.values ?? []));
const buildInitials = (value = '') => tokenizeSearchQuery(value).map(token => token.charAt(0)).join('');

const buildFieldIndex = (field = {}) => {
  const values = unique(asList(field?.value ?? field?.values ?? []));
  const normalizedValues = values.map(normalizeSearchText).filter(Boolean);
  const tokenSet = new Set(normalizedValues.flatMap(value => value.split(' ')));
  return {
    key: field?.key || 'other',
    priority: Number(field?.priority) || 10,
    values,
    normalizedValues,
    collapsedValues: normalizedValues.map(value => value.replace(/\s+/g, '')).filter(Boolean),
    tokenSet,
    tokens: [...tokenSet],
    digits: normalizeDigits(values.join(' ')),
    numericMatch: field?.numericMatch === 'tokens' ? 'tokens' : 'substring',
  };
};

const prepareSearchFields = (fields) => fields.map(buildFieldIndex).filter(field => field.normalizedValues.length > 0);

const prepareSearchQuery = (query) => {
  const normalizedQuery = normalizeSearchText(query);
  return {
    normalizedQuery,
    collapsedQuery: normalizedQuery.replace(/\s+/g, ''),
    tokens: normalizedQuery.split(' ').filter(Boolean),
  };
};

const getBestTokenMatch = (token, fields) => {
  let best = null;

  fields.forEach((field) => {
    if (!token) return;
    if (/^\d+$/.test(token)) {
      if (field.numericMatch === 'tokens') {
        const exact = field.tokenSet.has(token);
        if (exact || field.tokens.some(candidate => candidate.startsWith(token))) {
          const score = (exact ? 100 : 20) + field.priority;
          if (!best || score > best.score) best = { field, kind: exact ? 'exact' : 'prefix', score };
        }
      } else if (field.digits.includes(token)) {
        const score = 55 + field.priority;
        if (!best || score > best.score) best = { field, kind: 'digits', score };
      }
      return;
    }

    if (field.tokenSet.has(token)) {
      const score = 70 + field.priority;
      if (!best || score > best.score) best = { field, kind: 'exact', score };
      return;
    }

    const hasPrefix = field.tokens.some(candidate => candidate.startsWith(token));
    if (hasPrefix) {
      const score = 45 + field.priority;
      if (!best || score > best.score) best = { field, kind: 'prefix', score };
    }
  });

  return best;
};

const buildSearchResult = (record, index, query, indexedFields) => {
  const { normalizedQuery, collapsedQuery, tokens } = query;
  const tokenMatches = tokens.map(token => getBestTokenMatch(token, indexedFields));
  if (tokenMatches.some(match => !match)) return null;

  let score = 0;
  const primary = indexedFields.find(field => field.key === 'primary') || indexedFields[0];
  const directExact = indexedFields.some(field => (
    field.normalizedValues.includes(normalizedQuery)
    || (collapsedQuery && field.collapsedValues.includes(collapsedQuery))
  ));
  const primaryExact = Boolean(primary && (
    primary.normalizedValues.includes(normalizedQuery)
    || (collapsedQuery && primary.collapsedValues.includes(collapsedQuery))
  ));
  const primaryPrefix = Boolean(primary && normalizedQuery && primary.normalizedValues.some(value => value.startsWith(normalizedQuery)));

  if (primaryExact) score += 2000;
  else if (directExact) score += 1500;
  else if (primaryPrefix) score += 1100;
  else score += tokens.length > 1 ? 700 : 450;

  tokenMatches.forEach(match => {
    score += match.score;
    if (match.field.key === 'primary') score += match.kind === 'exact' ? 35 : 15;
  });

  const matchedFields = [...new Set(tokenMatches.map(match => match.field.key))];
  return { record, index, score, matchedFields, exact: primaryExact || directExact };
};

const emptySearchResult = (record, index) => ({ record, index, score: 0, matchedFields: [], exact: false });
const compareSearchResults = (left, right) => right.score - left.score || left.index - right.index;

const addSearchPosting = (postings, token, index) => {
  const indices = postings.get(token);
  if (!indices) postings.set(token, [index]);
  // Entries are visited in source order, so duplicate fields need no extra Set.
  else if (indices[indices.length - 1] !== index) indices.push(index);
};

const lowerBoundSearchToken = (vocabulary, token) => {
  let low = 0;
  let high = vocabulary.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (vocabulary[middle] < token) low = middle + 1;
    else high = middle;
  }
  return low;
};

const getSearchTokenCandidates = (token, tokenPostings, vocabulary, digitPostings) => {
  if (/^\d+$/.test(token)) return digitPostings.get(token.slice(0, 3)) || [];
  const start = lowerBoundSearchToken(vocabulary, token);
  // Normalized vocabulary is ASCII alphanumeric; '{' sorts after every suffix.
  const end = lowerBoundSearchToken(vocabulary, `${token}{`);
  if (start === end) return [];
  if (end === start + 1) return tokenPostings.get(vocabulary[start]);
  const candidates = new Set();
  for (let position = start; position < end; position++) {
    tokenPostings.get(vocabulary[position]).forEach(index => candidates.add(index));
  }
  return [...candidates].sort((left, right) => left - right);
};

const intersectSearchCandidates = (left, right) => {
  const intersection = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] < right[rightIndex]) leftIndex++;
    else if (left[leftIndex] > right[rightIndex]) rightIndex++;
    else {
      intersection.push(left[leftIndex]);
      leftIndex++;
      rightIndex++;
    }
  }
  return intersection;
};

import { createProjectionScheduler, sortProjection } from './cooperativeProjection.js';
import {getAdaptivePerformancePolicy} from './adaptivePerformance.js';

/**
 * Explicit snapshot of membership, order and prepared fields. getFields runs
 * once per present record at creation (including for empty-query searches).
 * Rebuild after record/field edits or changes to getFields' external context.
 * Results retain the original record references; records are not cloned/frozen.
 * rank(query) returns ranked metadata; search(query) returns only records.
 * Postings select candidates; the shared scorer still verifies every query token.
 */
const createSearchIndexBuilder = (getFields) => {
  const entries = [];
  const tokenPostings = new Map();
  const digitPostings = new Map();
  const append = (record, index = entries.length) => {
    const entry = { record, index, fields: prepareSearchFields(getFields(record) || []) };
    entries[index] = entry;
    entry.fields.forEach((field) => {
      field.tokens.forEach(token => addSearchPosting(tokenPostings, token, entry.index));
      // Token-mode numbers only match prefixes, not inner year/code digits.
      // Phone/default fields retain substring grams spanning field values.
      if (field.numericMatch === 'tokens') {
        field.tokens.forEach(token => {
          const digits = token.match(/^\d+/)?.[0] || '';
          for (let length = 1; length <= Math.min(3, digits.length); length++) {
            addSearchPosting(digitPostings, digits.slice(0, length), entry.index);
          }
        });
        return;
      }
      // Only 10 + 100 + 1000 distinct gram keys can exist, with one posting per
      // source position/key. Long numeric queries use their first trigram.
      for (let length = 1; length <= 3; length++) {
        for (let start = 0; start + length <= field.digits.length; start++) {
          addSearchPosting(digitPostings, field.digits.slice(start, start + length), entry.index);
        }
      }
    });
  };
  const finish = (vocabulary = [...tokenPostings.keys()].sort()) => {
  const rank = (query = '') => {
    const preparedQuery = prepareSearchQuery(query);
    if (!preparedQuery.tokens.length) return entries.map(entry => emptySearchResult(entry.record, entry.index));
    const postings = [];
    for (const token of new Set(preparedQuery.tokens)) {
      const candidates = getSearchTokenCandidates(token, tokenPostings, vocabulary, digitPostings);
      if (!candidates.length) return [];
      postings.push(candidates);
    }
    postings.sort((left, right) => left.length - right.length);
    let candidates = postings[0];
    for (let position = 1; position < postings.length && candidates.length; position++) {
      candidates = intersectSearchCandidates(candidates, postings[position]);
    }
    return candidates
      .map((index) => {
        const entry = entries[index];
        return buildSearchResult(entry.record, entry.index, preparedQuery, entry.fields);
      })
      .filter(Boolean)
      .sort(compareSearchResults);
  };
    const searchAsync = async (query = '', { signal, yieldTask,
      budgetMs = getAdaptivePerformancePolicy().workBudgetMs, maxOperations = getAdaptivePerformancePolicy().maxOperations, now = () => performance.now(), orderedRecords, membership, orderRanks } = {}) => {
      if (!Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isInteger(maxOperations) || maxOperations <= 0) {
        throw new RangeError('Search budgets must be positive finite values');
      }
      const preparedQuery = prepareSearchQuery(query);
      function* work() {
        const postings=[];
        for (const token of new Set(preparedQuery.tokens)) {
          let found;
          if (/^\d+$/.test(token)) {
            found=digitPostings.get(token.slice(0,3))||[];
          } else {
            const start=lowerBoundSearchToken(vocabulary,token);
            const end = lowerBoundSearchToken(vocabulary, `${token}{`);
            if(start===end)return [];
            if(end===start+1)found=tokenPostings.get(vocabulary[start]);
            else {
              let union=new Set(),dense=null;
              for(let position=start;position<end;position++){
                for(const index of tokenPostings.get(vocabulary[position])){
                  if(dense)dense[index]=1;
                  else{
                    union.add(index);
                    // Dense broad prefixes need source-ordered membership, not
                    // a merge-sort of thousands of one-element SKU postings.
                    // Selective/sparse queries keep the small Set path.
                    if(union.size>=256&&entries.length<=union.size*4&&entries.length<=1000000){
                      dense=new Uint8Array(entries.length);
                      for(const member of union){dense[member]=1;yield;}
                      union=null;
                    }
                  }
                  yield;
                }
              }
              const values=[];
              if(dense){for(let index=0;index<dense.length;index++){if(dense[index])values.push(index);yield;}found=values;}
              else{for(const index of union){values.push(index);yield;}found=yield* sortProjection(values,(a,b)=>a-b);}
            }
          }
          if(!found.length)return [];
          postings.push(found);
          yield;
        }
        // Posting arrays are immutable and already in source order. Start
        // with the smallest, then binary-probe larger lists; do not build and
        // delete full 50k Sets for broad words before seeing a unique SKU.
        postings.sort((a,b)=>a.length-b.length);
        let candidates=postings[0]||null;
        for(let position=1;position<postings.length;position++){
          const right=postings[position],intersection=[];
          if(right.length<=candidates.length*8){
            let leftIndex=0,rightIndex=0;
            while(leftIndex<candidates.length&&rightIndex<right.length){
              const left=candidates[leftIndex],value=right[rightIndex];
              if(left<value)leftIndex++;else if(left>value)rightIndex++;else{intersection.push(left);leftIndex++;rightIndex++;}
              yield;
            }
          }else for(const index of candidates){
              let low=0,high=right.length;
              while(low<high){const middle=(low+high)>>>1;if(right[middle]<index)low=middle+1;else high=middle;yield;}
              if(right[low]===index)intersection.push(index);
              yield;
            }
          candidates=intersection;if(!candidates.length)return [];
        }
        const results = [];
        const compare=(a,b)=>(orderRanks?orderRanks.get(a.record)-orderRanks.get(b.record):0)||compareSearchResults(a,b);
        let alreadySorted=true,previous=null;
        const positions = candidates || entries.keys();
        for (const index of positions) {
          const entry = entries[index];
          if (entry && (!membership || membership.has(entry.record))) {
            const result = preparedQuery.tokens.length
              ? buildSearchResult(entry.record, entry.index, preparedQuery, entry.fields)
              : emptySearchResult(entry.record, entry.index);
            if (result) {
              if(previous&&compare(previous,result)>0)alreadySorted=false;
              results.push(result);previous=result;
            }
          }
          yield;
        }
        if (orderedRecords && !orderRanks) {
          const matches = new Set();
          for (const result of results) { matches.add(result.record); yield; }
          const ordered = [];
          for (const record of orderedRecords) { if (matches.has(record)) ordered.push(record); yield; }
          return ordered;
        }
        let from = results;
        let to = alreadySorted?null:new Array(from.length);
        for (let width = 1; !alreadySorted&&width < from.length; width *= 2) {
          for (let offset = 0; offset < from.length; offset += width * 2) {
            let left = offset;
            const middle = Math.min(offset + width, from.length);
            let right = middle;
            const end = Math.min(offset + width * 2, from.length);
            for (let position = offset; position < end; position++) {
              to[position] = left < middle && (right >= end || compare(from[left], from[right]) <= 0)
                ? from[left++] : from[right++];
              yield;
            }
          }
          [from, to] = [to, from];
        }
        const records = [];
        for (const result of from) { records.push(result.record); yield; }
        return records;
      }
      const iterator = work();
      const scheduler = yieldTask ? { yieldTask, close() {} } : createProjectionScheduler();
      try {
      while (true) {
        if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
        const start = now();
        for (let count = 0; count < maxOperations; count++) {
          const next = iterator.next();
          if (next.done) return next.value;
          if (now() - start >= budgetMs) break;
        }
        await scheduler.yieldTask();
      }
      } finally { scheduler.close(); iterator.return?.(); }
    };
    // A bounded synchronous lane avoids two effect/paint cycles for selective
    // loaded-data queries. Broad/expensive queries explicitly return null and
    // keep using the cancellable cooperative path; no partial answer escapes.
    const searchIfSmall=(query='',maxCandidates=128)=>{
      if(!Number.isSafeInteger(maxCandidates)||maxCandidates<1||maxCandidates>256)throw new RangeError('Invalid fast-search bound');
      const prepared=prepareSearchQuery(query),tokens=[...new Set(prepared.tokens)];
      if(!tokens.length||tokens.length>16)return null;
      const lists=[];let work=0;
      for(const token of tokens){
        let list;
        if(/^\d+$/.test(token))list=digitPostings.get(token.slice(0,3))||[];
        else{
          const start=lowerBoundSearchToken(vocabulary,token),end=lowerBoundSearchToken(vocabulary,`${token}{`);
          if(start===end)return [];
          if(end===start+1)list=tokenPostings.get(vocabulary[start]);
          else{
            if(end-start>16)return null;
            const union=new Set();
            for(let p=start;p<end;p++)for(const id of tokenPostings.get(vocabulary[p])){if(++work>4096)return null;union.add(id);if(union.size>maxCandidates)return null}
            list=[...union].sort((a,b)=>a-b);
          }
        }
        if(!list.length)return [];lists.push(list);
      }
      lists.sort((a,b)=>a.length-b.length);
      if(lists[0].length>maxCandidates)return null;
      let candidates=lists[0];
      for(let p=1;p<lists.length;p++){
        const right=lists[p],intersection=[];
        for(const id of candidates){let lo=0,hi=right.length;
          while(lo<hi){if(++work>4096)return null;const middle=(lo+hi)>>>1;if(right[middle]<id)lo=middle+1;else hi=middle}
          if(right[lo]===id)intersection.push(id);
        }
        candidates=intersection;if(!candidates.length)return [];
      }
      const results=[];
      for(const id of candidates){const entry=entries[id],result=buildSearchResult(entry.record,entry.index,prepared,entry.fields);if(result)results.push(result)}
      return results.sort(compareSearchResults).map(result=>result.record);
    };
    return Object.freeze({ rank, search: (query = '') => rank(query).map(result => result.record), searchAsync, searchIfSmall });
  };
  return { append, finish, tokens: () => tokenPostings.keys() };
};

export const createSearchRecordIndex = (records = [], getFields = () => []) => {
  const builder = createSearchIndexBuilder(getFields);
  (Array.isArray(records) ? records : []).forEach(builder.append);
  return builder.finish();
};

// Build outside render, yielding within both field preparation and vocabulary sort.
export const createSearchRecordIndexAsync = async (records = [], getFields = () => [], {
  signal, budgetMs = getAdaptivePerformancePolicy().workBudgetMs, maxRecordsPerTurn = getAdaptivePerformancePolicy().searchRows,
  now = () => performance.now(),
  yieldTask,
} = {}) => {
  const scheduler = yieldTask ? { yieldTask, close() {} } : createProjectionScheduler();
  yieldTask = scheduler.yieldTask;
  try {
  const check = () => { if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError'); };
  const builder = createSearchIndexBuilder(getFields);
  const source = Array.isArray(records) ? records : [];
  let start = now();
  let processed = 0;
  for (let position = 0; position < source.length; position++) {
    check();
    if (position in source) builder.append(source[position], position);
    if (++processed >= maxRecordsPerTurn || now() - start >= budgetMs) {
      await yieldTask();
      check();
      start = now();
      processed = 0;
    }
  }
  const vocabulary = [];
  for (const token of builder.tokens()) {
    check();
    vocabulary.push(token);
    if (++processed >= 256 || now() - start >= budgetMs) {
      await yieldTask();
      check();
      start = now();
      processed = 0;
    }
  }
  // Merge sort avoids one large final native sort on a 50k-record vocabulary.
  let from = vocabulary;
  let to = new Array(from.length);
  for (let width = 1; width < from.length; width *= 2) {
    for (let offset = 0; offset < from.length; offset += width * 2) {
      let left = offset;
      const middle = Math.min(offset + width, from.length);
      let right = middle;
      const end = Math.min(offset + width * 2, from.length);
      for (let position = offset; position < end; position++) {
        to[position] = left < middle && (right >= end || from[left] <= from[right]) ? from[left++] : from[right++];
        if (++processed >= 256 || now() - start >= budgetMs) {
          await yieldTask();
          check();
          start = now();
          processed = 0;
        }
      }
    }
    [from, to] = [to, from];
  }
  check();
  return builder.finish(from);
  } finally { scheduler.close(); }
};

/**
 * Returns ranked records without modifying the records themselves. Ties retain
 * the original order so views stay stable while the user types.
 */
export const rankSearchRecords = (records = [], query = '', getFields = () => []) => {
  const source = Array.isArray(records) ? records : [];
  const preparedQuery = prepareSearchQuery(query);
  if (!preparedQuery.tokens.length) return source.map(emptySearchResult);

  return source
    .map((record, index) => buildSearchResult(record, index, preparedQuery, prepareSearchFields(getFields(record) || [])))
    .filter(Boolean)
    .sort(compareSearchResults);
};

export const searchRecords = (records = [], query = '', getFields = () => []) => (
  rankSearchRecords(records, query, getFields).map(result => result.record)
);

const customerAliases = (customer = {}) => [
  customer?.name,
  customer?.plainName,
  customer?.displayName,
  customer?.customerHonorific,
  customer?.shopName,
  customer?.storeName,
  customer?.businessName,
  customer?.companyName,
  customer?.contactName,
  customer?.contactPerson,
  customer?.searchAliases,
];

const getCustomerBranchSearchValues = (customer = {}) => [
  ...(Array.isArray(customer?.branches) ? customer.branches : []),
  ...(Array.isArray(customer?.customerBranches) ? customer.customerBranches : []),
  ...(Array.isArray(customer?.deliveryBranches) ? customer.deliveryBranches : []),
].flatMap(branch => [branch?.name, branch?.branchName, branch?.label, branch?.code, branch?.phone, branch?.address, branch?.locationInput]);

export const getCustomerSearchFields = (customer = {}) => [
  { key: 'primary', priority: 100, values: customerAliases(customer) },
  { key: 'phone', priority: 82, values: [customer?.phone, customer?.phoneNumber, customer?.zaloContact, customer?.zaloPhone] },
  { key: 'code', priority: 78, values: [customer?.code, customer?.customerCode, customer?.id] },
  { key: 'address', priority: 42, values: [customer?.address, customer?.locationInput, customer?.area, customer?.region, customer?.route, customer?.routeName, ...getCustomerBranchSearchValues(customer)] },
  { key: 'other', priority: 25, values: [customer?.customerGroup, customer?.group, customer?.groupName, customer?.managerName, customer?.note, customer?.notes, customer?.searchText] },
];

export const searchCustomers = (customers = [], query = '') => searchRecords(customers, query, getCustomerSearchFields);
export const rankCustomerSearchResults = (customers = [], query = '') => rankSearchRecords(customers, query, getCustomerSearchFields);

export const getProductSearchFields = (product = {}) => [
  { key: 'primary', priority: 100, values: [product?.name, product?.productName, product?.shortName, product?.productShortName, product?.alias, product?.abbreviation, buildInitials(product?.name || product?.productName || '')] },
  { key: 'code', priority: 82, values: [product?.code, product?.sku, product?.barcode, product?.id] },
  { key: 'other', priority: 35, values: [product?.category, product?.mainGroup, product?.unit, product?.attributes, product?.productAttributes, product?.variants, product?.attributeOptions] },
];

export const searchProducts = (products = [], query = '') => searchRecords(products, query, getProductSearchFields);

const getOrderCode = (order = {}) => order?.orderCode || order?.invoiceCode || order?.code || order?.paymentCode || order?.id || '';

const getDisplayedOrderCode = (order = {}) => {
  const orderId = `${order?.id || ''}`.trim();
  return orderId ? `HD${orderId.slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, '')}` : '';
};

export const getOrderSearchFields = (order = {}, { getItemText, getCustomerText } = {}) => {
  const itemText = typeof getItemText === 'function'
    ? getItemText(order)
    : (order?.items || []).flatMap(item => [item?.description, item?.productName, item?.productNameSnapshot, item?.productCode, item?.sku, item?.barcode]);
  const customerText = typeof getCustomerText === 'function' ? getCustomerText(order) : [];
  return [
    { key: 'primary', priority: 100, values: [getOrderCode(order), getDisplayedOrderCode(order), order?.invoiceCode, order?.orderCode, order?.paymentCode] },
    { key: 'customer', priority: 78, values: [order?.customerName, order?.customer?.name, order?.customerPhone, order?.customer?.phone, order?.branchName, order?.customerBranchName, customerText] },
    { key: 'product', priority: 68, values: itemText },
    { key: 'other', priority: 30, values: [order?.date, order?.salesOwner?.name, order?.salesEmpName, order?.note, order?.notes] },
  ];
};

export const searchOrders = (orders = [], query = '', options = {}) => searchRecords(
  orders,
  query,
  order => getOrderSearchFields(order, options)
);

export const searchInvoices = searchOrders;

export const getEmployeeSearchFields = (employee = {}) => [
  { key: 'primary', priority: 100, values: [employee?.name, employee?.displayName, employee?.username, employee?.alias] },
  { key: 'phone', priority: 82, values: [employee?.phone, employee?.phoneNumber, employee?.email] },
  { key: 'code', priority: 75, values: [employee?.employeeCode, employee?.code, employee?.id] },
  { key: 'other', priority: 30, values: [employee?.position, employee?.role, employee?.department, employee?.address, employee?.searchText] },
];

export const searchEmployees = (employees = [], query = '') => searchRecords(employees, query, getEmployeeSearchFields);

export const buildSearchIndexTokens = (record = {}, getFields = () => []) => {
  const fields = getFields(record) || [];
  return [...new Set(tokenizeSearchQuery(collectValues(fields).join(' ')))];
};
