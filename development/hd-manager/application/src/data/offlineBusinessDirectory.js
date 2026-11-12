/**
 * Read-only directory over the EXISTING completed Home feed. No connection, DDL,
 * ingestion, listeners, commands, debt allocation, payroll calculation or totals.
 * Attach later: createOfflineBusinessDirectory({database,session,authorize,clock}).
 * database.transaction is the existing native owner; authorize is its existing
 * signed grant/lease authorizer. A home.read verification supplies the verified
 * grant; the additional source capability below is checked on EVERY operation.
 * Missing module capabilities fail closed (no role/home.read-based expansion).
 * Capability names match performance/home-offline/start-workspace-services.mjs;
 * no new permissions or authorizer mappings are introduced here.
 *
 * Audit: homeFeedContract.js + offlineHomeFeedStorage.publish; date priorities in
 * features/customers/productCRMShared.jsx (resolveEntityDateKey/payment candidates),
 * App.jsx resolveCashflowDateKey/getEmployeeAttendanceEntriesForMonth; warehouse
 * writers store date; payroll uses monthKey/periodId/employeeId, not a work day.
 * Explicit zoned instants convert to Asia/Ho_Chi_Minh; unzoned business dates are
 * already Vietnam wall time. Never consult device timezone or substitute today.
 *
 * page(source,{from,to,text,customerId,employeeId,status,monthKey,limit,cursor,
 *              checkpoint,includeCount}) -- [from,to), YYYY-MM-DD; max 100 rows.
 * lookup(source,ids,{checkpoint}) -- exact IDs, max 25, same safe scalar columns.
 * checkpoint is returned metadata.checkpoint; pass it to pin related lookups.
 * pageBatch([{source,options},...]) is explicit: max 2, sum(limit+1)<=100.
 * readQuery uses one compound SELECT snapshot; fallback rejects mixed heads.
 * Cursors also bind session, query, source and the entire completed checkpoint.
 * Dates sort descending, then BINARY ID descending. No OFFSET or JS filtering.
 * List/lookup strings are bounded previews (1024 chars); arrays, credentials,
 * bank details and full document bodies never cross the bridge. These pages
 * MUST NOT be passed to ledger/dashboard/payroll calculators, even if hasMore=false.
 */
import{salaryAdvanceMonthSql}from'./salaryAdvanceDirectorySql.js';
import {normalizeSearchText} from '../services/searchEngine.js';
import {BUSINESS_SEARCH_VERSION,BUSINESS_SEARCH_FIELDS,ORDER_SEARCH_TABLE,ORDER_FEED_KEYS_INDEX,orderFeedScopeSql} from './offlineBusinessSearchProjection.js';
import {currentSearchTrace,searchMark} from './crmSearchTrace.js';

const LIMIT = 100, LOOKUP_LIMIT = 25, TEXT_LIMIT = 1024;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const error = (code, message) => Object.assign(new Error(message), {code});
const invalid = () => { throw error('invalid-argument', 'Invalid business directory query'); };
const stale = () => { throw error('stale-checkpoint', 'Completed Home checkpoint changed; restart query'); };
const deny = () => { throw error('permission-denied', 'Business directory permission or session changed'); };
const missingSearchSchema=failure=>/no such table:\s*(?:\w+\.)?offline_business_search(?:_coverage)?_v1\b/i.test(String(failure?.message||failure));
const missingOrderProjection=failure=>/no such (?:table|index):\s*(?:\w+\.)?(?:offline_business_search_order_v2|offline_home_feed_keys_seq_v2|offline_business_order_sort_v2)\b/i.test(String(failure?.message||failure));
const j = path => `json_extract(r.body,'$.${path}')`;
const first = fields => `COALESCE(${fields.map(f => `NULLIF(${j(f)},'')`).join(',')},'')`;
import {entityDates,dateSql,ordersStrictIsoDateSql} from './businessDirectoryDateSql.js';
const cashDates = ['cashflowDate','paymentDate','paidDate','transactionDate','transactionDateTime','bankTransactionDate',
  'paidAt','transactionAt','transactedAt','transactionTime','bankTransactionTime','paymentTime','completedTime','completedAt',
  'date','approvedAt','createdAt','updatedAt','timestamp'];
const paymentDates = [
  'paymentDate','transactionDate','transactionDateTime','bankTransactionDate',
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt'].map(f => 'webData.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt','createdAt'].map(f => 'webLatest.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt','createdAt'].map(f => 'webLinked.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt','createdAt'].map(f => 'webLink.' + f),
  ...['transactionDateTime','transactionDate','paymentTime','completedTime','paidAt'].map(f => 'webhook.' + f),
  'paidAt','transactionAt','transactedAt','paymentTime','completedTime','completedAt','webData.createdAt','webhook.createdAt',
  'date','createdAt','updatedAt','timestamp',
];
const needsCustomers = (source, o) => source === 'orders' && (o.employeeId !== null || o.tokens.length > 0);
const common = ['companyId','date','status','customerId','customerName','empId','createdByEmpId','isArchived'];
const approvalFields = ['requiresApproval','approvalStatus','handoverStatus','sourceType','createdByRole',
  'isPaymentIntent','paymentIntent','isCustomerDebtPaymentIntent','paymentStatus','settlementStatus','reconciliationStatus','type'];
const specs = {
  orders: {cap:'home.orders.read',also:['orders.read'],dates:entityDates,customer:true,employee:['salesEmpId','createdByEmpId','empId'],
    fields:[...common,'code','orderCode','invoiceCode','paymentCode','customerPhone','branchId','branchName','customerBranchName','salesEmpId','salesEmpName','note','paymentStatus','sourceDispatchDate','amount','total','totalAmount','grandTotal'],
    search:['code','orderCode','invoiceCode','paymentCode','customerName','customerPhone','branchName','customerBranchName','salesEmpName','note','notes'],items:true},
  payments: {cap:'home.cashflow.read',dates:cashDates,payment:true,approval:true,customer:true,employee:['empId','createdByEmpId','collectorId'],
    fields:[...common,...approvalFields,'orderId','orderCode','paymentCode','method','paymentMethod','paymentProvider','cashflowDate','paidDate','paymentDate','transactionDate','sourceLabel','collectorName','note','amount'],
    search:['customerName','orderCode','paymentCode','collectorName','note','sourceLabel']},
  expenses: {cap:'home.cashflow.read',dates:cashDates,payment:true,approval:true,customer:true,employee:['empId','createdByEmpId','createdByEmployeeId'],
    fields:[...common,...approvalFields,'category','note','cashflowDate','paidDate','paymentDate','paymentProvider','method','paymentMethod','sourceLabel','relatedDeliveryReportId','assetId','amount'],
    search:['customerName','category','note','sourceLabel','assetName','assetPlate']},
  warehouseImports: {cap:'home.imports.read',dates:entityDates,customer:true,employee:['empId','createdByEmpId'],
    fields:[...common,'productId','productName','supplierName','warehouseId','warehouseName','note','quantity','totalQuantity','totalKg','weightKg'],search:['productName','supplierName','warehouseName','note']},
  warehouseDispatches: {cap:'home.dispatches.read',dates:entityDates,customer:true,employee:['empId','createdByEmpId'],
    fields:[...common,'productId','productName','customerNameSnapshot','sourceOrderRequestId','branchId','branchName','warehouseId','note','quantity','totalQuantity','totalKg','weightKg'],
    search:['customerName','customerNameSnapshot','productName','branchName','note']},
  warehouseStockCounts: {cap:'home.stock.read',dates:entityDates,employee:['empId','createdByEmpId'],
    fields:[...common.filter(f => !['customerId','customerName'].includes(f)),'productId','productName','warehouseId','warehouseName','note','reason'],
    search:['productName','warehouseName','note','reason']},
  deliveryReports: {cap:'home.quick-report.read',dates:entityDates,employee:['empId','createdByEmpId'],fields:[...common,'createdByEmpId','dispatchId','warehouseDispatchId','orderId','customerNameSnapshot','productId','productNameSnapshot','reviewStatus','resolutionStatus','deliveryStatus','trackingStatus','deliveredAt','driverId','assignedDriverId','driverNameSnapshot','assignedDriverNameSnapshot','expectedWeightKg','actualWeightKg','differenceKg','expectedQuantity','expectedQuantityUnit','actualQuantity','actualQuantityUnit','actualPackageCount','actualPackageUnit','orderedUnit','pricingUnit','unitPrice','pricingQuantity','pricingAmount','amount','collectedAmount','collectedMethod','note'],search:['customerNameSnapshot','productNameSnapshot','driverNameSnapshot','assignedDriverNameSnapshot','note']},
  employees: {cap:'home.payroll.read',precision:'none',employee:['id'],
    fields:['companyId','name','displayName','employeeCode','code','phone','position','role','department','status','isArchived'],
    search:['name','displayName','employeeCode','code','phone','position','department']},
  attendance: {cap:'home.payroll.read',attendance:true,dates:['date','dateKey','createdAt','updatedAt'],employee:['employeeId','empId','targetEmployeeId'],
    fields:['companyId','date','dateKey','employeeId','empId','targetEmployeeId','status','checkIn','checkOut','workRole'],search:['employeeName','status','workRole']},
  payrollPeriods: {cap:'home.payroll.read',precision:'month',
    fields:['companyId','monthKey','status','lockedAt','lockedByEmployeeId','lockedByName','employeeCount'],search:['monthKey','status','lockedByName']},
  advances: {cap:'home.payroll.read',precision:'month',dates:['salaryMonth','deductionMonth','payrollMonth','date','createdAt'],employee:['empId'],fields:['companyId','empId','amount','reason','salaryMonth','deductionMonth','payrollMonth','date','status','isArchived','linkedFinancialRecordId','financialRecordId'],search:['reason']},
  payrollSnapshots: {cap:'home.payroll.read',precision:'month',employee:['employeeId'],
    fields:['companyId','monthKey','periodId','employeeId','employeeName','status'],search:['monthKey','employeeName']},
  // Explicit related-record lookup sources already present in the same feed.
  customers: {cap:'home.debt.read',also:['customers.read'],precision:'none',customer:true,employee:['empId'],
    fields:['companyId','name','phone','address','empId','isArchived'],search:['name','phone','address']},
  products: {cap:'home.stock.read',precision:'none',fields:['companyId','name','code','sku','unit','isArchived'],search:['name','code','sku']},
  orderRequests: {cap:'home.orders.read',also:['orders.read'],dates:entityDates,customer:true,employee:['empId','createdByEmpId'],items:true,
    fields:[...common,'requestDate','productId','productName','branchId','branchName','note'],search:['customerName','productName','branchName','note']},
};
for(const [source,spec] of Object.entries(specs))if(JSON.stringify(spec.search)!==JSON.stringify(BUSINESS_SEARCH_FIELDS[source]))throw Error('Search projection field version differs from directory');
export const OFFLINE_BUSINESS_SOURCES = Object.freeze(Object.fromEntries(Object.entries(specs).map(([source, s]) =>
  [source, Object.freeze({capability:s.cap,requiredCapabilities:Object.freeze(['home.read',s.cap,...(s.also || [])]),datePrecision:s.precision || 'day',
    statusFilter:s.approval ? 'cashflow-approval-v1' : 'raw-status',
    dateFields:Object.freeze(s.attendance ? ['id:YYYY-MM-DD_employeeId',...s.dates] :
      (s.payment ? [...cashDates,...paymentDates.map(path => path.replace(/^webData\./,'(rawWebhook|rawPayload).data.')
        .replace(/^webLatest\./,'(rawWebhook|rawPayload)[.data].latestTransaction.')
        .replace(/^webLinked\./,'(rawWebhook|rawPayload)[.data].paymentLink.transactions[latest].')
        .replace(/^webLink\./,'(rawWebhook|rawPayload)[.data].paymentLink.')
        .replace(/^webhook\./,'(rawWebhook|rawPayload).'))] : [...(s.dates || (s.precision === 'month' ? ['monthKey'] : []))])),
    fields:Object.freeze([...new Set(s.fields)])})])));

function id(value) { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value); }
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
function optionsFor(source, input = {}, exactIds = null) {
  const s = specs[source];
  if (!own(specs, source) || !input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const allowed = ['from','to','text','customerId','employeeId','status','monthKey','limit','cursor','checkpoint','includeCount'];
  if (Object.keys(input).some(k => !allowed.includes(k))) invalid();
  const {from = null,to = null,text = '',customerId = null,employeeId = null,status = null,monthKey = null,
    limit = 50,cursor = null,checkpoint = null,includeCount = false} = input;
  if (!Number.isInteger(limit) || limit < 1 || limit > LIMIT || typeof includeCount !== 'boolean'
      || typeof text !== 'string' || text.length > 128 || (cursor !== null && (typeof cursor !== 'string' || cursor.length > 8192))
      || (from !== null && !day(from)) || (to !== null && !day(to)) || (from && to && from >= to)
      || ((from || to) && s.precision) || (monthKey !== null && (typeof monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) || s.precision !== 'month'))
      || (customerId !== null && (!id(customerId) || !s.customer))
      || (employeeId !== null && (!id(employeeId) || !s.employee)) || (status !== null && !id(status))) invalid();
  if (s.approval && status !== null && !['pending','approved','rejected'].includes(status)) invalid();
  const tokens = [...new Set(normalizeSearchText(text).split(' ').filter(Boolean))];
  if (tokens.length > 12) invalid();
  if (exactIds && (cursor || Object.keys(input).some(k => k !== 'checkpoint'))) invalid();
  return {from,to,tokens,customerId,employeeId,status,monthKey,limit,cursor,checkpoint,includeCount,exactIds};
}

// Fixed finite transliteration table generated from Unicode, never source rows.
// A recursive replace avoids SQLite's shallow parser stack with 130+ nested
// replace() calls. Depth is constant; all original text is searched, never a JS
// page/whole-source filter or truncated search key. ASCII lower follows folding.
const folds = [];
for (let code = 0x00c0; code <= 0x1eff; code++) {
  const ch = String.fromCharCode(code);
  const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (/^[a-zA-Z]$/.test(folded) && ch !== folded) folds.push([ch,folded]);
}
folds.push(['đ','d'],['Đ','D']);
for (let code = 0x0300; code <= 0x036f; code++) folds.push([String.fromCharCode(code),'']);
const foldChars = folds.map(([ch]) => ch).join('');
const foldValues = folds.map(([,value]) => value || ' ').join('');
function foldSql(expression) {
  return `(WITH RECURSIVE fold(i,v) AS (SELECT 1,COALESCE(${expression},'') UNION ALL
    SELECT i+1,CASE WHEN instr(v,substr('${foldChars}',i,1))=0 THEN v ELSE
    replace(v,substr('${foldChars}',i,1),CASE WHEN unicode(substr('${foldChars}',i,1)) BETWEEN 768 AND 879
    THEN '' ELSE substr('${foldValues}',i,1) END) END FROM fold WHERE i<=${folds.length})
    SELECT lower(v) FROM fold ORDER BY i DESC LIMIT 1)`;
}

// Query normalization produces only [a-z0-9]+. Outside combining marks/NUL,
// every finite fold is one source character -> one ASCII letter. These bound
// GLOB classes are its exact preimage, including ASCII upper/lower case only.
function tokenGlobPattern(token) {
  if(!/^[a-z0-9]+$/.test(token))invalid();
  return '*'+[...token].map(ch=>{
    if(/[0-9]/.test(ch))return ch;
    const chars=[...new Set([ch,ch.toUpperCase(),...folds.filter(([,value])=>value&&value.toLowerCase()===ch).map(([value])=>value)])].join('');
    if([...chars].some(value=>"[]-'^".includes(value)))throw Error('Unsafe fixed search GLOB character');
    return '['+chars+']';
  }).join('')+'*';
}
function searchMatchSql(expression,token,params) {
  params.push(token,tokenGlobPattern(token));
  // Deleting combining marks can join characters; embedded NUL has adapter
  // edge cases. Retain the EXACT original SQL fold for both exceptional cases.
  return `(CASE WHEN instr(${expression},char(0))>0 OR ${expression} GLOB '*[\u0300-\u036f]*'
    THEN instr(${foldSql(expression)},?)>0 ELSE ${expression} GLOB ? END)`;
}

function paymentExpressions() {
  const webhook = `COALESCE(${j('rawWebhook')},${j('rawPayload')},'{}')`;
  const data = `COALESCE(json_extract(${webhook},'$.data'),'{}')`;
  const link = `COALESCE(json_extract(${webhook},'$.paymentLink'),json_extract(${data},'$.paymentLink'),'{}')`;
  const latest = `COALESCE(json_extract(${webhook},'$.latestTransaction'),json_extract(${data},'$.latestTransaction'),'{}')`;
  const linked = `(SELECT value FROM json_each(${link},'$.transactions') ORDER BY
    COALESCE(json_extract(value,'$.transactionDateTime'),json_extract(value,'$.transactionDate'),json_extract(value,'$.createdAt'),'') COLLATE BINARY DESC,key ASC LIMIT 1)`;
  const objects = {webhook,webData:data,webLink:link,webLatest:latest,webLinked:linked};
  return paymentDates.map(path => {
    const [prefix,field] = path.split('.');
    return field ? `json_extract(${objects[prefix]},'$.${field}')` : j(path);
  });
}

function approvalSql() {
  // Exact requiresCashflowApproval/getCashflowApprovalMeta predicates from
  // productCRMShared/App. Approval is distinct from payment completion: raw
  // paymentStatus and intent flags remain in the projection for the original
  // isCashflowOfficial function. No ledger effects are inferred here.
  const requires = `CASE json_type(r.body,'$.requiresApproval')
    WHEN 'true' THEN 1 WHEN 'false' THEN 0 WHEN 'null' THEN 0
    WHEN 'text' THEN length(${j('requiresApproval')})>0
    WHEN 'integer' THEN ${j('requiresApproval')}<>0 WHEN 'real' THEN ${j('requiresApproval')}<>0
    WHEN 'object' THEN 1 WHEN 'array' THEN 1 ELSE 0 END`;
  return `CASE WHEN NOT COALESCE((${requires} OR ${j('approvalStatus')} IN ('pending_handover','rejected')
    OR ${j('handoverStatus')} IN ('pending','handed_over')
    OR ${j('sourceType')} IN ('driver_delivery_expense','employee_reported_expense','employee_reported_income')
    OR (${j('sourceType')}='driver_cash' AND ${j('createdByRole')}='driver')),0)
    OR ${j('approvalStatus')}='approved' THEN 'approved'
    WHEN ${j('approvalStatus')}='rejected' THEN 'rejected' ELSE 'pending' END`;
}

function recordCte(source, scope, cp, o, atomic = false, useSearchProjection = true) {
  const s = specs[source];
  const projected=atomic&&useSearchProjection&&o.tokens.length>0;
  const keyed = "CASE WHEN substr(r.id,1,11) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_' AND length(r.id)>11 THEN substr(r.id,1,10) END";
  const dates = (s.dates || []).map(j);
  // resolveEntityDateKey selects the first nonempty business field, then falls
  // back to timestamps if it cannot parse that value. Cashflow selects one
  // nonempty date source; it does not reinterpret createdAt after an invalid one.
  if (s.dates === entityDates) dates.splice(0,7,first(entityDates.slice(0,7)));
  if (s.dates === cashDates) dates.splice(0,dates.length,first(cashDates));
  if (s.attendance) dates.unshift(keyed);
  let date = s.precision ? "''" : dateSql(dates);
  if (source === 'orders') date = ordersStrictIsoDateSql(dates);
  if (s.payment) {
    const provider = `lower(${first(['paymentProvider','sourceType','method','paymentMethod','sourceLabel'])})`;
    date = `CASE WHEN instr(${provider},'sepay')>0 OR instr(${provider},'payos')>0
      THEN COALESCE(${dateSql(paymentExpressions())},${date}) ELSE ${date} END`;
  }
  const sort = s.precision === 'month' ? `COALESCE(${source==='advances'?salaryAdvanceMonthSql(j):j('monthKey')},'')` : `COALESCE(${date},'')`;
  let employee = s.employee ? first(s.employee) : "''";
  if (s.attendance) employee = `COALESCE(NULLIF(${first(s.employee)},''),CASE WHEN ${keyed} IS NOT NULL THEN substr(r.id,12) END,'')`;
  // Orders UI's responsible salesperson precedence includes the exact customer
  // assignment. Require its separate signed capability, not home.read alone.
  if (source === 'orders' && o.employeeId) employee = `COALESCE(NULLIF(${j('salesEmpId')},''),
    (SELECT NULLIF(json_extract(c.body,'$.empId'),'') FROM offline_home_feed_records_v1 c
      WHERE c.tenant_id=r.tenant_id AND c.principal_id=r.principal_id AND c.generation=r.generation
      AND c.source='customers' AND c.id=${j('customerId')} AND json_extract(c.body,'$.companyId')=r.tenant_id
      AND c.seq<=${cp.seq} LIMIT 1),NULLIF(${j('createdByEmpId')},''),NULLIF(${j('empId')},''),'')`;
  // The atomic SELECT reads generation/sequence from its materialized head,
  // not from a preceding bridge call. Keep source at params[3] in both paths.
  const params = atomic ? [scope.tenantId,scope.principalId,scope.permissionRevision,source,scope.tenantId]
    : [scope.tenantId,scope.principalId,cp.generation,source,cp.seq,scope.tenantId];
  const projectionParams=atomic?[]:[...params];
  const rowScope = atomic
    ? 'r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=(SELECT generation FROM directory_ready) AND r.source=?4 AND r.seq<=(SELECT seq FROM directory_ready) AND json_extract(r.body,\'$.companyId\')=?5'
    : "r.tenant_id=? AND r.principal_id=? AND r.generation=? AND r.source=? AND r.seq<=? AND json_extract(r.body,'$.companyId')=?";
  const filterParams=[];
  let predicate = '';
  if (o.exactIds) { predicate += ` AND r.id IN (${o.exactIds.map(() => '?').join(',')})`; filterParams.push(...o.exactIds); }
  const fields = [...new Set(s.fields)].map(field => {
    const value = j(field);
    return `'${field}',CASE WHEN json_type(r.body,'$.${field}') IN ('true','false')
      THEN json(CASE WHEN json_type(r.body,'$.${field}')='true' THEN 'true' ELSE 'false' END)
      WHEN json_type(r.body,'$.${field}') IN ('text','integer','real')
      THEN CASE WHEN typeof(${value})='text' THEN substr(${value},1,${TEXT_LIMIT}) ELSE ${value} END END`;
  }).join(',');
  let search = ['r.id',...s.search.map(j)].map(v => `COALESCE(${v},'')`).join("||' '||");
  if (source === 'orders' && o.tokens.length) search += `||' '||COALESCE((SELECT
    COALESCE(json_extract(c.body,'$.name'),'')||' '||COALESCE(json_extract(c.body,'$.phone'),'')
    FROM offline_home_feed_records_v1 c WHERE c.tenant_id=r.tenant_id AND c.principal_id=r.principal_id
    AND c.generation=r.generation AND c.source='customers' AND c.id=${j('customerId')}
    AND json_extract(c.body,'$.companyId')=r.tenant_id AND c.seq<=${cp.seq} LIMIT 1),'')`;
  // Apply the existing body predicates before computing dates. Materialize only
  // id/seq/sort_key so a date used by range, cursor and ORDER BY is evaluated
  // once. No full body, unused lookup columns or JSON preview enters the sort.
  const add = (sql,value) => { predicate += ' AND ' + sql; filterParams.push(value); };
  if (o.customerId) add(`${j(source === 'customers' ? 'id' : 'customerId')}=?`,o.customerId);
  if (o.employeeId) add(`${employee}=?`,o.employeeId);
  if (o.status) {
    if(source==='attendance'){
      // One attendance document may contain several independent work roles.
      // Match in SQLite before LIMIT, rather than dropping rows whose primary
      // status differs from a secondary role. Never sum these preview rows.
      predicate+=` AND (${j('status')}=? COLLATE BINARY OR EXISTS(SELECT 1
        FROM json_each(CASE WHEN json_type(r.body,'$.workRoles')='object'
          THEN json_extract(r.body,'$.workRoles') ELSE '{}' END) role
        WHERE CASE WHEN role.type='object' THEN json_extract(role.value,'$.status') END=? COLLATE BINARY))`;
      filterParams.push(o.status,o.status);
    }else add(`${s.approval ? approvalSql() : j('status')}=? COLLATE BINARY`,o.status);
  }
  if (o.monthKey) add(`${source==='advances'?salaryAdvanceMonthSql(j):j('monthKey')}=?`,o.monthKey);
  let searchCtes='',recordFrom='offline_home_feed_records_v1 r',recordWhere=`${rowScope} AND json_extract(r.body,'$.id')=r.id${predicate}`;
  if(!projected)params.push(...filterParams);
  if(o.tokens.length){
    if(projected){
      const customer=source==='orders';
      searchCtes=`search_coverage AS MATERIALIZED (SELECT 1 FROM offline_business_search_coverage_v1 coverage
        WHERE coverage.tenant_id=?1 AND coverage.principal_id=?2 AND coverage.revision=?3
        AND coverage.generation=(SELECT generation FROM directory_ready) AND coverage.source=?4
        AND coverage.version=${BUSINESS_SEARCH_VERSION} AND coverage.target_seq=(SELECT seq FROM directory_ready) AND coverage.complete=1
        ${customer?`AND EXISTS (SELECT 1 FROM offline_business_search_coverage_v1 cc WHERE cc.tenant_id=?1 AND cc.principal_id=?2 AND cc.revision=?3
          AND cc.generation=coverage.generation AND cc.source='customers' AND cc.version=${BUSINESS_SEARCH_VERSION} AND cc.target_seq=coverage.target_seq AND cc.complete=1)`:''}),
      search_eligible AS MATERIALIZED (SELECT p.id,p.seq,${customer?"p.root_text||' '||COALESCE(customer.linked_text,'')":'p.root_text'} AS normalized,p.items_json
        FROM offline_business_search_v1 p${customer?`
        LEFT JOIN offline_home_feed_records_v1 customer_record
          ON customer_record.tenant_id=p.tenant_id AND customer_record.principal_id=p.principal_id AND customer_record.generation=p.generation
          AND customer_record.source='customers' AND customer_record.id=p.customer_key COLLATE BINARY
          AND customer_record.seq<=(SELECT seq FROM directory_ready) AND json_extract(customer_record.body,'$.companyId')=?5
        LEFT JOIN offline_business_search_v1 customer
          ON customer.tenant_id=p.tenant_id AND customer.principal_id=p.principal_id AND customer.generation=p.generation
          AND customer.source='customers' AND customer.id=customer_record.id AND customer.seq=customer_record.seq AND customer.version=${BUSINESS_SEARCH_VERSION}`:''}
        WHERE p.tenant_id=?1 AND p.principal_id=?2 AND p.generation=(SELECT generation FROM directory_ready) AND p.source=?4
          AND p.version=${BUSINESS_SEARCH_VERSION} AND p.seq<=(SELECT seq FROM directory_ready) AND p.eligible=1 AND EXISTS (SELECT 1 FROM search_coverage)
          ${customer?'AND (customer_record.id IS NULL OR customer.linked_eligible=1)':''}),\n`;
      // Materialize only uncovered keys before fetching any fallback body.
      const keyScope='r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=(SELECT generation FROM directory_ready) AND r.source=?4 AND r.seq<=(SELECT seq FROM directory_ready)';
      searchCtes+=`search_uncovered_keys AS MATERIALIZED (SELECT r.id,r.seq FROM offline_home_feed_records_v1 r
        WHERE ${keyScope} AND NOT EXISTS (SELECT 1 FROM search_eligible eligible WHERE eligible.id=r.id AND eligible.seq=r.seq)),
      search_base AS MATERIALIZED (SELECT r.id,r.seq,r.body,${search} AS search_text
      FROM search_uncovered_keys uncovered CROSS JOIN offline_home_feed_records_v1 r
        WHERE r.id=uncovered.id AND r.seq=uncovered.seq AND ${rowScope} AND json_extract(r.body,'$.id')=r.id),\n    `;
    }
    else searchCtes+=`search_base AS MATERIALIZED (SELECT r.id,r.seq,r.body,${search} AS search_text
      FROM offline_home_feed_records_v1 r WHERE ${recordWhere}),\n`;
    if(s.items)searchCtes+=`search_items AS MATERIALIZED (SELECT r.id AS record_id,item.key AS item_key,
      COALESCE(json_extract(item.value,'$.description'),'')||' '||COALESCE(json_extract(item.value,'$.productName'),'')||' '||COALESCE(json_extract(item.value,'$.productCode'),'')||' '||COALESCE(json_extract(item.value,'$.sku'),'') AS search_text
      FROM search_base r CROSS JOIN json_each(COALESCE(json_extract(r.body,'$.items'),
        json_extract(r.body,'$.lines'),json_extract(r.body,'$.products'),'[]')) item WHERE item.type='object'),\n`;
    recordFrom='search_base r';recordWhere='1=1';
  }
  if(projected){
    const matches=o.tokens.map(token=>{
      params.push(token);
      let match='instr(e.normalized,?)>0';
      if(s.items){params.push(token);match+=' OR EXISTS (SELECT 1 FROM json_each(e.items_json) item WHERE instr(item.value,?)>0)';}
      return '('+match+')';
    });
    searchCtes+=`search_projected_matches AS MATERIALIZED (SELECT e.id,e.seq FROM search_eligible e WHERE ${matches.join(' AND ')}),\n`;
  }
  for (const token of o.tokens) {
    let match = searchMatchSql('r.search_text',token,params);
    if (s.items) {
      match += ` OR EXISTS (SELECT 1 FROM search_items item WHERE item.record_id=r.id AND ${searchMatchSql('item.search_text',token,params)})`;
    }
    recordWhere += ' AND (' + match + ')';
  }
  if(projected){
    searchCtes+=`search_matches AS MATERIALIZED (SELECT id,seq FROM search_projected_matches UNION ALL SELECT r.id,r.seq FROM search_base r WHERE ${recordWhere}),\n`;
    // Keep matched keys outermost: one full-PK body/date read per match.
    recordFrom='search_matches matched CROSS JOIN offline_home_feed_records_v1 r';
    recordWhere=`matched.id=r.id AND matched.seq=r.seq AND ${rowScope} AND json_extract(r.body,'$.id')=r.id${predicate}`;
    params.push(...filterParams);
  }
  let cte = `WITH ${searchCtes}records AS MATERIALIZED (SELECT r.id,r.seq,${sort} AS sort_key
    FROM ${recordFrom}
    WHERE ${recordWhere}),
    filtered AS (SELECT id,seq,sort_key FROM records r WHERE 1=1`;
  if(o.from){cte+=' AND sort_key>=?';params.push(o.from);}
  if(o.to){cte+=" AND sort_key<>'' AND sort_key<?";params.push(o.to);}
  return {cte:cte+')',params,projection:`json_object(${fields})`,rowScope,projectionParams};
}

function boundedProjection(query, where) {
  // CROSS JOIN fixes bounded keys as the outer loop; the EXISTING feed primary
  // key supplies each complete body only after LIMIT. This is one statement and
  // one snapshot, not a second RPC, body cache, schema or index.
  return `directory_keys AS MATERIALIZED (
      SELECT id,seq,sort_key FROM filtered${where}
      ORDER BY sort_key COLLATE BINARY DESC,id COLLATE BINARY DESC LIMIT ?),
    directory_page AS MATERIALIZED (
      SELECT substr(k.id,1,257) AS id,k.seq,substr(k.sort_key,1,11) AS sort_key,${query.projection} AS document
      FROM directory_keys k CROSS JOIN offline_home_feed_records_v1 r
      WHERE ${query.rowScope} AND r.id=k.id AND r.seq=k.seq AND json_extract(r.body,'$.id')=r.id)`;
}

// Exact same completed feed and original SQL fallback, with derived v2 keys.
// Covering feed PK+seq reads detect EVERY missing/stale row without body reads.
// Only unsupported/uncovered records execute the original body/date expression.
function orderProjectionCte(scope,cp,o,after,readProof=null,proveSearch=false){
  const raw=recordCte('orders',scope,cp,o,true,false),params=[...raw.params];
  const bind=value=>{params.push(value);return '?'+params.length;};
  const customer=needsCustomers('orders',o)||proveSearch,search=o.tokens.length>0||proveSearch,employee=!!o.employeeId;
  const rawStatement=raw.cte+' SELECT id,seq,sort_key FROM filtered WHERE ?3=?3';
  const rawSql=rebaseParameters(rawStatement,0,raw.params.length).replace(/FROM offline_home_feed_records_v1 r\s+WHERE /,
    'FROM order_uncovered_keys uncovered CROSS JOIN offline_home_feed_records_v1 r WHERE uncovered.id=r.id AND uncovered.seq=r.seq AND ');
  if(rawSql===rebaseParameters(rawStatement,0,raw.params.length))throw Error('Original Orders fallback stage missing');
  const predicates=[];
  if(o.exactIds)predicates.push(`v.id IN (${o.exactIds.map(bind).join(',')})`);
  if(o.customerId)predicates.push(`v.customer_key=${bind(o.customerId)}`);
  if(o.employeeId)predicates.push(`COALESCE(NULLIF(v.sales_emp_id,''),NULLIF(v.customer_emp_id,''),NULLIF(v.created_emp_id,''),NULLIF(v.emp_id,''),'')=${bind(o.employeeId)}`);
  if(o.status)predicates.push(`v.status=${bind(o.status)} COLLATE BINARY`);
  if(!readProof)for(const token of o.tokens)predicates.push(`(instr(v.normalized,${bind(token)})>0 OR EXISTS (SELECT 1 FROM json_each(v.items_json) item WHERE instr(item.value,${bind(token)})>0))`);
  if(o.from)predicates.push(`v.sort_key>=${bind(o.from)}`);
  if(o.to)predicates.push(`v.sort_key<>'' AND v.sort_key<${bind(o.to)}`);
  // Top K from each disjoint arm contains top K of their UNION. includeCount
  // deliberately retains all matches; cursor never changes matching_count.
  if(after&&!o.includeCount)predicates.push(`(v.sort_key COLLATE BINARY,v.id COLLATE BINARY)<(${bind(after.sort)},${bind(after.id)})`);
  const cap=o.includeCount?'':` LIMIT ${bind((o.exactIds?LOOKUP_LIMIT:o.limit)+1)}`;
  if(readProof){
    // Only the existing owner queue may supply this proof. Its write revision
    // invalidates it BEFORE any write, including failed/rolled-back writes.
    // No rows or search results are cached in JS. The current head is still
    // read by this SELECT and checked again before any result is published.
    const customers=[],matches=[];
    for(const [index,token]of o.tokens.entries()){
      const name=`order_customer_matches_${index}`;
      customers.push(`${name} AS MATERIALIZED (SELECT linked.id FROM offline_business_search_v1 linked
        JOIN offline_home_feed_records_v1 customer_record INDEXED BY ${ORDER_FEED_KEYS_INDEX}
         ON customer_record.tenant_id=?1 AND customer_record.principal_id=?2 AND customer_record.generation=(SELECT generation FROM directory_ready)
          AND customer_record.source='customers' AND customer_record.id=linked.id AND customer_record.seq=linked.seq
          AND customer_record.seq<=(SELECT seq FROM directory_ready) AND ${orderFeedScopeSql('customer_record.body')}=?5
        WHERE linked.tenant_id=?1 AND linked.principal_id=?2 AND linked.generation=(SELECT generation FROM directory_ready)
         AND linked.source='customers' AND linked.version=1 AND linked.linked_eligible=1 AND instr(linked.linked_text,${bind(token)})>0)`);
      matches.push(`(instr(q.root_text,${bind(token)})>0 OR EXISTS (SELECT 1 FROM json_each(q.items_json) item WHERE instr(item.value,${bind(token)})>0)
        OR q.customer_key IN (SELECT id FROM ${name}))`);
    }
    const cte=`WITH ${customers.length?customers.join(',')+',':''}
      ${o.tokens.length?`order_search_candidates AS MATERIALIZED (SELECT q.id,q.seq FROM offline_business_search_v1 q
       WHERE q.tenant_id=?1 AND q.principal_id=?2 AND q.generation=(SELECT generation FROM directory_ready)
        AND q.source=?4 AND q.version=1 AND q.eligible=1 AND ${matches.join(' AND ')}),`:''}
      order_projection_valid AS ${o.tokens.length?'MATERIALIZED':'NOT MATERIALIZED'} (SELECT p.id,p.seq,p.sort_key,p.customer_key,p.status,p.sales_emp_id,p.created_emp_id,p.emp_id,NULL AS customer_emp_id
       FROM ${o.tokens.length?`order_search_candidates candidate CROSS JOIN ${ORDER_SEARCH_TABLE} p`:`${ORDER_SEARCH_TABLE} p INDEXED BY offline_business_order_sort_v2`}
       CROSS JOIN offline_home_feed_records_v1 r INDEXED BY ${ORDER_FEED_KEYS_INDEX}
       WHERE p.tenant_id=?1 AND p.principal_id=?2 AND p.generation=(SELECT generation FROM directory_ready) AND p.source=?4
        ${o.tokens.length?'AND p.id=candidate.id AND p.seq=candidate.seq':''} AND p.version=2 AND p.eligible=1 AND p.scope_valid=1
        AND r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=p.generation AND r.source=?4 AND r.id=p.id AND r.seq=p.seq
        AND r.seq<=(SELECT seq FROM directory_ready) AND ${orderFeedScopeSql()}=?5 AND ${orderFeedScopeSql('r.body','id')}=r.id),
      order_projected_page AS MATERIALIZED (SELECT v.id,v.seq,v.sort_key FROM order_projection_valid v
       WHERE ${predicates.join(' AND ')||'1=1'} ORDER BY v.sort_key COLLATE BINARY DESC,v.id COLLATE BINARY DESC${cap}),
      filtered AS (SELECT id,seq,sort_key FROM order_projected_page)`;
    return {...raw,cte,params,orderProjection:true,readProof,validatesOrderSearch:true};
  }
  // Whole-feed readiness/authority stays in directory_ready. Projection
  // progress is NOT read authority: every projected row proves live PK/seq and
  // scope below; the exact uncovered complement always takes original SQL.
  const proofReady=proveSearch&&!needsCustomers('orders',o)?` WHERE EXISTS (SELECT 1 FROM json_each(sources) WHERE value='customers')
    AND json_type(counts,'$.customers') IN ('integer','real') AND json_extract(counts,'$.customers')>=0
    AND json_extract(counts,'$.customers')=CAST(json_extract(counts,'$.customers') AS INTEGER)`:'';
  const cte=`WITH order_projection_ready AS MATERIALIZED (SELECT 1 FROM directory_ready${proofReady}),
   order_feed_keys AS MATERIALIZED (SELECT r.id,r.seq,${orderFeedScopeSql()} AS company_id,${orderFeedScopeSql('r.body','id')} AS body_id FROM offline_home_feed_records_v1 r INDEXED BY ${ORDER_FEED_KEYS_INDEX}
    WHERE r.tenant_id=?1 AND r.principal_id=?2 AND r.generation=(SELECT generation FROM directory_ready) AND r.source=?4 AND r.seq<=(SELECT seq FROM directory_ready)),
   order_projection_valid AS MATERIALIZED (SELECT p.id,p.seq,p.sort_key,p.customer_key,p.status,p.sales_emp_id,p.created_emp_id,p.emp_id,
    ${employee?"CASE WHEN c.scope_valid=1 THEN c.emp_id END":"NULL"} AS customer_emp_id
    ${search?",q.root_text||' '||COALESCE(linked.linked_text,'') AS normalized,q.items_json":''}
    FROM order_feed_keys k CROSS JOIN ${ORDER_SEARCH_TABLE} p
    ${customer?`LEFT JOIN offline_home_feed_records_v1 customer_record INDEXED BY ${ORDER_FEED_KEYS_INDEX}
     ON customer_record.tenant_id=p.tenant_id AND customer_record.principal_id=p.principal_id AND customer_record.generation=p.generation
      AND customer_record.source='customers' AND customer_record.id=p.customer_key COLLATE BINARY AND customer_record.seq<=(SELECT seq FROM directory_ready)
      AND ${orderFeedScopeSql('customer_record.body')}=?5`:''}
    ${employee?`LEFT JOIN ${ORDER_SEARCH_TABLE} c ON c.tenant_id=p.tenant_id AND c.principal_id=p.principal_id AND c.generation=p.generation AND c.source='customers'
      AND c.id=customer_record.id AND c.seq=customer_record.seq AND c.version=2`:''}
    ${search?`LEFT JOIN offline_business_search_v1 q ON q.tenant_id=p.tenant_id AND q.principal_id=p.principal_id AND q.generation=p.generation
      AND q.source='orders' AND q.id=p.id AND q.seq=p.seq AND q.version=1
     LEFT JOIN offline_business_search_v1 linked ON linked.tenant_id=p.tenant_id AND linked.principal_id=p.principal_id AND linked.generation=p.generation
      AND linked.source='customers' AND linked.id=customer_record.id AND linked.seq=customer_record.seq AND linked.version=1`:''}
    WHERE p.tenant_id=?1 AND p.principal_id=?2 AND p.generation=(SELECT generation FROM directory_ready) AND p.source=?4
     AND p.version=2 AND p.eligible=1 AND p.scope_valid=1 AND p.id=k.id AND p.seq=k.seq AND k.company_id=?5 AND k.body_id=k.id AND EXISTS (SELECT 1 FROM order_projection_ready)
     ${search?'AND q.eligible=1':''}
     ${customer?`AND (customer_record.id IS NULL OR (${employee?'c.eligible=1 AND c.scope_valid=1':'1'} AND ${search?'linked.linked_eligible=1':'1'}))`:''}),
   order_uncovered_keys AS MATERIALIZED (SELECT k.id,k.seq FROM order_feed_keys k
    WHERE NOT EXISTS (SELECT 1 FROM order_projection_valid p WHERE p.id=k.id AND p.seq=k.seq)),
   order_projected_page AS MATERIALIZED (SELECT v.id,v.seq,v.sort_key FROM order_projection_valid v
    WHERE ${predicates.join(' AND ')||'1=1'} ORDER BY v.sort_key COLLATE BINARY DESC,v.id COLLATE BINARY DESC${cap}),
   order_raw_keys AS MATERIALIZED (${rawSql}),
   records AS MATERIALIZED (SELECT id,seq,sort_key FROM order_projected_page UNION ALL SELECT id,seq,sort_key FROM order_raw_keys),
   filtered AS (SELECT id,seq,sort_key FROM records)`;
  return {...raw,cte,params,orderProjection:true,validatesOrderSearch:search&&!employee};
}

function fingerprint(scope, source, o) {
  return JSON.stringify([scope.tenantId,scope.principalId,scope.permissionRevision,scope.sessionId,source,
    o.from,o.to,o.tokens,o.customerId,o.employeeId,o.status,o.monthKey]);
}
function same(a,b) {
  return !!a && !!b && ['tenantId','principalId','permissionRevision','sessionId',
    'generation','seq','capturedAt','dayKey','sourceProfile'].every(k => a[k] === b[k]);
}

// SQLite numbers anonymous parameters after the highest preceding ?N. Rebase
// each bounded arm without touching SQL literals, quoted identifiers/comments.
// This accepts only internally generated SQL, never a caller statement.
function rebaseParameters(statement, offset, expected, allowUnused=false) {
  let result='',highest=0,index=0;
  const seen=new Set();
  while(index<statement.length){
    const char=statement[index],next=statement[index+1];
    if(char==="'"||char==='"'||char==='`'||char==='['){
      const close=char==='['?']':char;let end=index+1,closed=false;
      while(end<statement.length){if(statement[end]===close){if(statement[end+1]===close){end+=2;continue;}end++;closed=true;break;}end++;}
      if(!closed)throw error('invalid-data','Unclosed internal directory SQL literal');
      result+=statement.slice(index,end);index=end;continue;
    }
    if(char==='-'&&next==='-'){
      const end=statement.indexOf('\n',index+2),stop=end<0?statement.length:end;
      result+=statement.slice(index,stop);index=stop;continue;
    }
    if(char==='/'&&next==='*'){
      const end=statement.indexOf('*/',index+2);if(end<0)throw error('invalid-data','Unclosed internal directory SQL comment');
      result+=statement.slice(index,end+2);index=end+2;continue;
    }
    if(char==='?'){
      let end=index+1;while(/[0-9]/.test(statement[end]||''))end++;
      const number=end===index+1?highest+1:Number(statement.slice(index+1,end));
      if(!Number.isSafeInteger(number)||number<1||number>expected)throw error('invalid-data','Invalid internal directory parameter');
      highest=Math.max(highest,number);seen.add(number);result+='?'+(offset+number);index=end;continue;
    }
    result+=char;index++;
  }
  if(highest!==expected||(!allowUnused&&seen.size!==expected))throw error('invalid-data','Invalid internal directory parameter count');
  return result;
}

export function createOfflineBusinessDirectory({database,session,authorize,clock = Date.now,sourceProfile = 'legacy-v1',sourceScope=null}) {
  if (typeof database?.transaction !== 'function' || typeof session?.isCurrent !== 'function'
      || typeof authorize !== 'function' || typeof clock !== 'function'
      || !['tenantId','principalId','permissionRevision','sessionId'].every(k => id(session.scope?.[k]))) invalid();
  if(sourceScope!==null&&sourceScope!=='warehouseImports')invalid();
  const scope = Object.freeze({...session.scope});
  // A constant-size read proof, never a row/result cache or an access grant.
  let verifiedOrderProjection=null;
  const current = () => {
    if (!session.isCurrent(scope) || !['tenantId','principalId','permissionRevision','sessionId'].every(k => session.scope[k] === scope[k])) deny();
  };
  function checkedPermission(grant, source, o) {
    current();
    if(sourceScope&&source!==sourceScope)deny();
    if (!grant || !Number.isSafeInteger(grant.expiresAtMs) || clock() >= grant.expiresAtMs
        || !['tenantId','principalId','permissionRevision','sessionId'].every(k => grant[k] === scope[k])
        || !Array.isArray(grant.capabilities) || (!sourceScope&&!grant.capabilities.includes('home.read'))
        || !(sourceScope?[OFFLINE_BUSINESS_SOURCES[source].capability]:OFFLINE_BUSINESS_SOURCES[source].requiredCapabilities).every(cap => grant.capabilities.includes(cap))
        || (needsCustomers(source,o) && !OFFLINE_BUSINESS_SOURCES.customers.requiredCapabilities.every(cap => grant.capabilities.includes(cap)))
        || (grant.appSession?.sourceProfile || 'legacy-v1') !== sourceProfile) deny();
    return grant;
  }
  async function permission(source, o) {
    current();
    const grant = await authorize({scope,kind:sourceScope?'app.session':'home.read'});
    return checkedPermission(grant,source,o);
  }
  async function head(db, source, o) {
    const rows = await db.query(`SELECT h.generation,h.captured_at,h.day_key,
      json_extract(h.snapshot_json,'$.feedGeneration') AS feed_generation,
      json_extract(h.snapshot_json,'$.feedSeq') AS seq,
      COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1') AS profile,
      ${sourceScope?"json_extract(h.snapshot_json,'$.kind') AS module_kind,":''}
      json_extract(h.snapshot_json,'$.availableSources') AS sources,
      json_extract(h.snapshot_json,'$.sourceCounts') AS counts,c.applied_seq,c.reported_seq
      FROM offline_home_head_v1 h LEFT JOIN offline_home_feed_checkpoint_v1 c
      ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
      WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=? LIMIT 1`,[scope.tenantId,scope.principalId,scope.permissionRevision]);
    return checkedHead(rows[0],source,o);
  }
  function checkedHead(h, source, o) {
    if(sourceScope&&h?.module_kind!=='warehouse-imports-pages-v2')stale();
    if (!h || !id(h.generation) || h.feed_generation !== h.generation || h.profile !== sourceProfile
        || sourceProfile !== 'legacy-v1' || !Number.isSafeInteger(h.seq) || h.seq < 0
        || h.applied_seq !== h.seq || (h.reported_seq !== h.seq&&!(sourceScope&&h.reported_seq===-1)) || !day(h.day_key)
        || !Number.isSafeInteger(h.captured_at)) stale();
    let sources,counts;
    try { sources = JSON.parse(h.sources); counts = JSON.parse(h.counts); } catch { stale(); }
    for (const name of [source,...(needsCustomers(source,o) ? ['customers'] : [])]) {
      if (!Array.isArray(sources) || !sources.includes(name) || !Number.isSafeInteger(counts?.[name]) || counts[name] < 0) {
        throw error('source-unavailable', 'Business source is not in the completed Home checkpoint');
      }
    }
    return {tenantId:scope.tenantId,principalId:scope.principalId,permissionRevision:scope.permissionRevision,sessionId:scope.sessionId,
      generation:h.generation,seq:h.seq,capturedAt:h.captured_at,dayKey:h.day_key,sourceProfile:h.profile};
  }
  function atomicPlan(source, o, useSearchProjection = true,useOrderProjection = true,readProof=null,proveSearch=false) {
    const key = fingerprint(scope,source,o);
    let after = null;
    if (o.cursor) {
      try { after = JSON.parse(o.cursor); } catch { invalid(); }
      if (!after || after.v !== 1 || after.key !== key) stale();
      if (!id(after.id) || typeof after.sort !== 'string' || after.sort.length > 10) invalid();
    }
    const required = [source,...(needsCustomers(source,o) ? ['customers'] : [])];
    // These are fixed spec names, never caller SQL. SQL gates rows on the same
    // completed head; JS still validates its metadata and error distinctions.
    const sourcesReady = required.map(name => `EXISTS (SELECT 1 FROM json_each(sources) WHERE value='${name}')
      AND json_type(counts,'$.${name}') IN ('integer','real')
      AND json_extract(counts,'$.${name}') BETWEEN 0 AND 9007199254740991
      AND json_extract(counts,'$.${name}')=CAST(json_extract(counts,'$.${name}') AS INTEGER)`).join(' AND ');
    const cp={seq:'(SELECT seq FROM directory_ready)'};
    const query = source==='orders'&&useOrderProjection?orderProjectionCte(scope,cp,o,after,readProof,proveSearch):recordCte(source,scope,cp,o,true,useSearchProjection);
    const params = [...query.params];
    let where = '';
    if (after) {where = ' WHERE (sort_key COLLATE BINARY,id COLLATE BINARY)<(?,?)';params.push(after.sort,after.id);}
    const limit = o.exactIds ? LOOKUP_LIMIT : o.limit;
    params.push(limit+1,...query.projectionParams);
    let statement = `WITH directory_head AS MATERIALIZED (
      SELECT h.tenant_id,h.principal_id,h.revision,h.generation,h.captured_at,h.day_key,
        json_extract(h.snapshot_json,'$.feedGeneration') AS feed_generation,
        json_extract(h.snapshot_json,'$.feedSeq') AS seq,
        COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1') AS profile,
        ${sourceScope?"json_extract(h.snapshot_json,'$.kind') AS module_kind,":''}
      json_extract(h.snapshot_json,'$.availableSources') AS sources,
        json_extract(h.snapshot_json,'$.sourceCounts') AS counts,c.applied_seq,c.reported_seq
      FROM offline_home_head_v1 h LEFT JOIN offline_home_feed_checkpoint_v1 c
        ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
      WHERE h.tenant_id=?1 AND h.principal_id=?2 AND h.revision=?3 LIMIT 1),
    directory_ready AS MATERIALIZED (SELECT * FROM directory_head
      WHERE ${sourceProfile === 'legacy-v1' ? '1' : '0'} AND profile='legacy-v1' ${sourceScope?"AND module_kind='warehouse-imports-pages-v2'":''}
        AND typeof(generation)='text' AND length(generation) BETWEEN 1 AND 256 AND feed_generation=generation
        AND typeof(seq) IN ('integer','real') AND seq BETWEEN 0 AND 9007199254740991 AND seq=CAST(seq AS INTEGER)
        AND applied_seq=seq AND (reported_seq=seq ${sourceScope?'OR reported_seq=-1':''})
        AND typeof(captured_at) IN ('integer','real') AND captured_at BETWEEN -9007199254740991 AND 9007199254740991 AND captured_at=CAST(captured_at AS INTEGER)
        AND length(day_key)=10 AND date(day_key,'+0 days')=day_key
        AND CASE WHEN json_valid(sources) AND json_valid(counts)
          THEN json_type(sources)='array' AND (${sourcesReady}) ELSE 0 END),
    ${query.cte.slice('WITH '.length)},
    ${boundedProjection(query,where)}
    SELECT ?4 AS source,
      (SELECT json_object('tenant_id',tenant_id,'principal_id',principal_id,'revision',revision,
        'generation',generation,'captured_at',captured_at,'day_key',day_key,'feed_generation',feed_generation,
        'seq',seq,'profile',profile,${sourceScope?"'module_kind',module_kind,":''}'sources',sources||'','counts',counts||'','applied_seq',applied_seq,'reported_seq',reported_seq)
        FROM directory_head) AS head_json,
      (SELECT json_group_array(json_object('id',id,'seq',seq,'sort_key',sort_key,'document',json(document)))
        FROM (SELECT * FROM directory_page ORDER BY sort_key COLLATE BINARY DESC,id COLLATE BINARY DESC)) AS rows_json,
      ${o.includeCount ? '(SELECT COUNT(*) FROM filtered)' : 'NULL'} AS matching_count${query.readProof?`,${query.readProof.orders} AS order_key_count,${query.readProof.customers} AS order_customer_key_count,NULL AS order_complete_count`:query.orderProjection?`,(SELECT COUNT(*) FROM order_feed_keys) AS order_key_count,(SELECT COUNT(*) FROM order_projection_valid) AS order_complete_count${needsCustomers(source,o)||proveSearch?`,
       (SELECT COUNT(*) FROM offline_home_feed_records_v1 r INDEXED BY ${ORDER_FEED_KEYS_INDEX} WHERE r.tenant_id=?1 AND r.principal_id=?2
        AND r.generation=(SELECT generation FROM directory_ready) AND r.source='customers' AND r.seq<=(SELECT seq FROM directory_ready)) AS order_customer_key_count`:',NULL AS order_customer_key_count'}`:''},
      (SELECT data_version FROM pragma_data_version) AS native_data_version`;
    if(query.readProof){
      // The verified snapshot is >2 MB on the current corpus. Reuse ONLY its
      // small metadata under the queue revision, never its rows or results.
      // Live columns/checkpoint and SQLite data_version still gate this SELECT.
      // data_version also invalidates on writes through another connection.
      if(source!=='orders'||sourceScope!==null)invalid();
      const numbered=rebaseParameters(statement,0,params.length,true);
      const readyAt=numbered.indexOf('directory_ready AS MATERIALIZED');
      if(readyAt<0)throw error('invalid-data','Missing current head gate');
      const bind=value=>{params.push(value);return '?'+params.length;};
      const proof=query.readProof,checkpoint=proof.checkpoint;
      const generation=bind(checkpoint.generation),seq=bind(checkpoint.seq),profile=bind(checkpoint.sourceProfile),
        sources=bind(proof.sourcesJson),counts=bind(proof.countsJson),captured=bind(checkpoint.capturedAt),
        dayKey=bind(checkpoint.dayKey),dataVersion=bind(proof.databaseVersion);
      statement=`WITH directory_head AS MATERIALIZED (
        SELECT h.tenant_id,h.principal_id,h.revision,h.generation,h.captured_at,h.day_key,
          ${generation} AS feed_generation,${seq} AS seq,${profile} AS profile,${sources} AS sources,${counts} AS counts,c.applied_seq,c.reported_seq
        FROM offline_home_head_v1 h LEFT JOIN offline_home_feed_checkpoint_v1 c
          ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
        WHERE h.tenant_id=?1 AND h.principal_id=?2 AND h.revision=?3
          AND h.generation=${generation} AND h.captured_at=${captured} AND h.day_key=${dayKey}
          AND (SELECT data_version FROM pragma_data_version)=${dataVersion} LIMIT 1), `+numbered.slice(readyAt);
    }
    return {statement,params,key,after,limit,orderProjection:query.orderProjection,readProof:query.readProof,validatesOrderSearch:query.validatesOrderSearch};
  }
  function decodeEnvelope(source, o, plan, envelope) {
    const {key,after,limit}=plan;
    if (!envelope || envelope.source !== source) throw error('invalid-data','Invalid directory envelope');
    let h, rows;
    try {h=JSON.parse(envelope.head_json);rows=JSON.parse(envelope.rows_json);} catch {throw error('invalid-data','Invalid directory JSON envelope');}
    const cp = checkedHead(h,source,o);
    if(plan.orderProjection){
      const counts=JSON.parse(h.counts);
      if(envelope.order_key_count!==counts.orders||(needsCustomers(source,o)&&envelope.order_customer_key_count!==counts.customers))stale();
    }
    if (h.tenant_id !== scope.tenantId || h.principal_id !== scope.principalId || h.revision !== scope.permissionRevision) deny();
    if (o.checkpoint && !same(o.checkpoint,cp)) stale();
    if (after && !same(after.checkpoint,cp)) stale();
    const count = o.includeCount ? envelope.matching_count : undefined;
    if (!Array.isArray(rows) || rows.length > limit+1 || rows.some(row => !row || !id(row.id)
      || typeof row.sort_key !== 'string' || row.sort_key.length > 10
      || !Number.isSafeInteger(row.seq) || row.seq < 0 || row.seq > cp.seq
      || !row.document || typeof row.document !== 'object' || Array.isArray(row.document) || row.document.companyId !== scope.tenantId)
      || (o.includeCount && (!Number.isSafeInteger(count) || count < 0))) throw error('invalid-data','Invalid business directory result');
    const hasMore = rows.length > limit;
    const items = rows.slice(0,limit).map(row => ({id:row.id,seq:row.seq,
      businessDate:specs[source].precision ? null : row.sort_key || null,document:row.document,state:'SERVER_CONFIRMED'}));
    const last = rows[Math.min(limit,rows.length)-1];
    return {items,hasMore,nextCursor:hasMore ? JSON.stringify({v:1,key,checkpoint:cp,sort:last.sort_key,id:last.id}) : null,
      ...(count === undefined ? {} : {count}),
      ...(o.exactIds ? {missingIds:o.exactIds.filter(value => !items.some(item => item.id === value))} : {}),
      metadata:{source,checkpoint:cp,datePrecision:specs[source].precision || 'day',timeZone:'Asia/Ho_Chi_Minh',
        interval:'[from,to)',order:'business-date-desc/id-binary-desc',serverConfirmedOnly:true,
        financialCalculationAllowed:false,projection:'bounded-directory-scalars-v1',stringLimit:TEXT_LIMIT}};
  }
  function unexpired(grants) {
    current();const at=clock();if(grants.some(grant=>at>=grant.expiresAtMs))deny();
  }
  async function atomicRead(source, o, grant, traceId=0) {
    searchMark(traceId,'orders-build-start');
    const canLease=source==='orders'&&!o.employeeId&&database.supportsReadRevision===true;
    // This validates the visible module's search projection, not another
    // module's data. Lacking relationship permission keeps the old read path.
    let proveSearch=false;
    if(canLease)try{checkedPermission(grant,'customers',{});proveSearch=true;}catch{}
    let plan=atomicPlan(source,o,true,true,null,proveSearch);
    searchMark(traceId,'orders-build-end');
    // One SELECT is one SQLite snapshot across head/checkpoint/records/customer
    // lookups. Reuse the owner's existing serialized native read: no BEGIN,
    // second head read, write fence, schema initialization or cached metadata.
    let result,mode=source==='orders'?2:1,readRevision=null,proofMiss=false;
    for(;;){try{
      const fullPlan=plan;
      result=await database.readQuery(fullPlan.statement,fullPlan.params,{traceId,
        prepare:canLease&&mode===2&&!proofMiss?revision=>{
          const proof=verifiedOrderProjection;
          plan=proveSearch&&proof&&proof.revision===revision?atomicPlan(source,o,true,true,proof):fullPlan;
          searchMark(traceId,plan.readProof?'orders-owner-proof-hit':'orders-owner-proof-miss');
          return {statement:plan.statement,params:plan.params};
        }:undefined,
        observed:canLease?revision=>{readRevision=revision;}:undefined,
      });
      if(plan.readProof){
        let matched=false;
        try{
          const h=JSON.parse(result?.[0]?.head_json),counts=JSON.parse(h.counts),cp=checkedHead(h,source,o);
          matched=h.tenant_id===scope.tenantId&&h.principal_id===scope.principalId&&h.revision===scope.permissionRevision
            &&same(plan.readProof.checkpoint,cp)&&counts.orders===plan.readProof.orders&&counts.customers===plan.readProof.customers;
        }catch{}
        if(!matched){
          // Even an out-of-contract writer cannot make a changed head publish
          // a partial/empty fast result. Fall back to the full current proof.
          verifiedOrderProjection=null;proofMiss=true;unexpired([grant]);await permission(source,o);
          plan=atomicPlan(source,o,true,true,null,proveSearch);searchMark(traceId,'orders-owner-proof-head-changed');continue;
        }
      }
      break;
    }catch(failure){
      verifiedOrderProjection=null;
      if(mode===2&&missingOrderProjection(failure))mode=1;
      else if(mode>0&&(o.tokens.length||mode===2)&&missingSearchSchema(failure))mode=0;
      else throw failure;
      unexpired([grant]);await permission(source,o);
      searchMark(traceId,'orders-fallback-build-start');
      plan=atomicPlan(source,o,mode>0,false);
      searchMark(traceId,'orders-fallback-build-end');
    }}
    searchMark(traceId,'orders-db-return');
    current();
    if (clock() >= grant.expiresAtMs) deny();
    searchMark(traceId,'orders-reauthorize-start');
    const confirmedGrant = await permission(source,o);
    searchMark(traceId,'orders-reauthorize-end');
    if (!Array.isArray(result) || result.length !== 1) throw error('invalid-data','Invalid directory envelope');
    searchMark(traceId,'orders-decode-start');
    const page=decodeEnvelope(source,o,plan,result[0]);
    searchMark(traceId,'orders-decode-end',{rows:page.items.length});
    unexpired([grant,confirmedGrant]);
    if(canLease&&proveSearch&&!plan.readProof&&plan.validatesOrderSearch&&mode===2&&Number.isSafeInteger(readRevision)){
      const h=JSON.parse(result[0].head_json),counts=JSON.parse(h.counts);
      let completeSource=false;
      try{checkedPermission(confirmedGrant,'customers',{});checkedHead(h,source,{...o,tokens:['source-proof']});completeSource=true;}catch{}
      if(completeSource&&result[0].order_complete_count===counts.orders&&result[0].order_customer_key_count===counts.customers
        &&Number.isSafeInteger(result[0].native_data_version)&&result[0].native_data_version>=0){
        verifiedOrderProjection=Object.freeze({revision:readRevision,checkpoint:Object.freeze({...page.metadata.checkpoint}),orders:counts.orders,customers:counts.customers,
          sourcesJson:h.sources,countsJson:h.counts,databaseVersion:result[0].native_data_version});
      }else verifiedOrderProjection=null;
    }
    searchMark(traceId,'orders-page-return');
    return page;
  }
  async function read(source, input, exactIds = null) {
    const o = optionsFor(source,input,exactIds);
    return readOptions(source,o);
  }
  async function readOptions(source,o) {
    const {exactIds}=o;
    const traceId=source==='orders'?currentSearchTrace():0;
    // No unauthorized SQL, including while queued on the owner.
    searchMark(traceId,'orders-authorize-start');
    const grant = await permission(source,o);
    searchMark(traceId,'orders-authorize-end');
    if (typeof database.readQuery === 'function') return atomicRead(source,o,grant,traceId);
    return database.transaction(async db => {
      const grant = await permission(source,o);
      const cp = await head(db,source,o);
      if (o.checkpoint && !same(o.checkpoint,cp)) stale();
      const key = fingerprint(scope,source,o);
      let after = null;
      if (o.cursor) {
        try { after = JSON.parse(o.cursor); } catch { invalid(); }
        if (!after || after.v !== 1 || after.key !== key || !same(after.checkpoint,cp)) stale();
        if (!id(after.id) || typeof after.sort !== 'string' || after.sort.length > 10) invalid();
      }
      const query = recordCte(source,scope,cp,o);
      let count;
      if (o.includeCount) count = (await db.query(query.cte + ' SELECT COUNT(*) AS n FROM filtered',query.params))[0]?.n;
      const params = [...query.params];
      let where = '';
      if (after) { where = ' WHERE (sort_key COLLATE BINARY,id COLLATE BINARY)<(?,?)'; params.push(after.sort,after.id); }
      const limit = exactIds ? LOOKUP_LIMIT : o.limit;
      params.push(limit + 1,...query.projectionParams);
      const rows = await db.query(query.cte + ', '+boundedProjection(query,where)
        +' SELECT id,seq,sort_key,document FROM directory_page ORDER BY sort_key COLLATE BINARY DESC,id COLLATE BINARY DESC',params);
      if (rows.length > limit + 1 || rows.some(row => !id(row.id) || typeof row.sort_key !== 'string'
          || row.sort_key.length > 10 || !Number.isSafeInteger(row.seq) || row.seq < 0)
          || (count !== undefined && (!Number.isSafeInteger(count) || count < 0))) throw error('invalid-data','Invalid business directory result');
      const hasMore = rows.length > limit;
      const items = rows.slice(0,limit).map(row => ({id:row.id,seq:row.seq,
        businessDate:specs[source].precision ? null : row.sort_key || null,
        document:JSON.parse(row.document),state:'SERVER_CONFIRMED'}));
      current();
      if (clock() >= grant.expiresAtMs) deny();
      const confirmed = await head(db,source,o);
      if (!same(cp,confirmed)) stale();
      await permission(source,o);
      current();
      const last = rows[Math.min(limit,rows.length)-1];
      return {items,hasMore,nextCursor:hasMore ? JSON.stringify({v:1,key,checkpoint:cp,sort:last.sort_key,id:last.id}) : null,
        ...(count === undefined ? {} : {count}),
        ...(exactIds ? {missingIds:exactIds.filter(value => !items.some(item => item.id === value))} : {}),
        metadata:{source,checkpoint:cp,datePrecision:specs[source].precision || 'day',timeZone:'Asia/Ho_Chi_Minh',
          interval:'[from,to)',order:'business-date-desc/id-binary-desc',serverConfirmedOnly:true,
          financialCalculationAllowed:false,projection:'bounded-directory-scalars-v1',stringLimit:TEXT_LIMIT}};
    });
  }
  async function pageBatch(requests) {
    // Explicit visible-module plan only: no prediction, prefetch, scope input,
    // arbitrary SQL or expansion into an unbounded module/source list.
    if (!Array.isArray(requests) || requests.length<1 || requests.length>2) invalid();
    const plans=[];let bound=0;
    for (const request of requests) {
      if (!request || typeof request!=='object' || Array.isArray(request)
        || Object.keys(request).some(key=>!['source','options'].includes(key))) invalid();
      const source=request.source,o=optionsFor(source,request.options);
      if(o.checkpoint&&typeof o.checkpoint==='object')o.checkpoint={...o.checkpoint};
      bound+=o.limit+1;plans.push({source,o});
    }
    if(bound>100)invalid();
    const grants=[];
    // Authorize EVERY source/relation before the owner receives any SQL.
    for(const {source,o} of plans)grants.push(await permission(source,o));
    for(const {source,o} of plans)checkedPermission(grants[grants.length-1],source,o);
    unexpired(grants);
    let pages;
    if(typeof database.readQuery==='function'){
      const build=(useSearchProjection,useOrderProjection=true)=>{
        const params=[],arms=[];
        for(const [index,entry] of plans.entries()){
          entry.query=atomicPlan(entry.source,entry.o,useSearchProjection,useOrderProjection);
          const sql=rebaseParameters(entry.query.statement,params.length,entry.query.params.length);
          arms.push(`SELECT ${index} AS request_index,request.source,request.head_json,request.rows_json,request.matching_count,
            ${entry.query.orderProjection?'request.order_key_count,request.order_customer_key_count':'NULL AS order_key_count,NULL AS order_customer_key_count'} FROM (${sql}) AS request`);params.push(...entry.query.params);
        }
        return {statement:arms.join(' UNION ALL ')+' ORDER BY request_index',params};
      };
      // Compound SELECT arms share the ONE SQLite statement snapshot. Each
      // arm returns one envelope and at most its declared limit+1 JSON rows.
      let query=build(true),result,mode=plans.some(entry=>entry.source==='orders')?2:1;
      for(;;){try{result=await database.readQuery(query.statement,query.params);break;}catch(failure){
        if(mode===2&&missingOrderProjection(failure))mode=1;
        else if(mode>0&&(plans.some(entry=>entry.o.tokens.length)||mode===2)&&missingSearchSchema(failure))mode=0;
        else throw failure;
        unexpired(grants);for(const {source,o} of plans)grants.push(await permission(source,o));
        for(const {source,o} of plans)checkedPermission(grants[grants.length-1],source,o);
        unexpired(grants);
        query=build(mode>0,false);
      }}
      unexpired(grants);
      for(const {source,o} of plans)grants.push(await permission(source,o));
      if(!Array.isArray(result)||result.length!==plans.length
        ||result.some((envelope,index)=>envelope?.request_index!==index))throw error('invalid-data','Invalid directory batch envelope');
      pages=plans.map((entry,index)=>decodeEnvelope(entry.source,entry.o,entry.query,result[index]));
    }else{
      // Preserve the original per-page transaction and two-head verification.
      // If publication changes BETWEEN those transactions the batch rejects;
      // neither a mixed checkpoint nor a partial result is published.
      pages=[];
      for(const {source,o} of plans)pages.push(await readOptions(source,o));
      for(const {source,o} of plans)grants.push(await permission(source,o));
    }
    if(pages.some(page=>!same(page.metadata.checkpoint,pages[0].metadata.checkpoint)))stale();
    // The latest verified grant must cover the WHOLE plan too: a capability
    // revoked while authorizing the other arm cannot escape publication checks.
    for(const {source,o} of plans)checkedPermission(grants[grants.length-1],source,o);
    unexpired(grants);
    return pages;
  }
  return Object.freeze({
    sources:OFFLINE_BUSINESS_SOURCES,
    async verifyAccess(source,input={}){const options=optionsFor(source,input);await permission(source,options);return true;},
    page:(source,options = {}) => read(source,options),
    pageBatch,
    async lookup(source,ids,options = {}) {
      if (!Array.isArray(ids) || !ids.length || ids.length > LOOKUP_LIMIT || ids.some(value => !id(value)) || new Set(ids).size !== ids.length) invalid();
      return read(source,options,[...ids]);
    },
  });
}
