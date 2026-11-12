import {WAREHOUSE_SOURCES} from './offlineWarehouseModel.js';

const fail = (code, message) => { throw Object.assign(Error(message), {code}); };
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fields = Object.freeze([
  'id','companyId','date','status','isArchived','createdAt','updatedAt','empId','createdByEmpId',
  'productId','productName','productNameSnapshot','productCode','name','description','groupName','productGroup',
  'code','supplier','supplierName','supplierCustomerId','customerId','customerName','customerNameSnapshot',
  'warehouseId','warehouseName','branchId','branchName','customerBranchName','sourceOrderRequestId','orderId',
  'assignedDriverId','assignedDriverNameSnapshot','driverId','driverNameSnapshot','deliveryStatus','deliveryStatusKey',
  'deliveryStatusLabel','trackingStatus','fulfillmentStatus','sourceType','sourceLabel','reason','note',
  'quantity','pieceCount','quantityCount','totalQuantity','totalKg','weightKg','actualWeightKg',
  'orderedUnit','quantityUnit','unit','pricingUnit','billingUnit','purchaseUnit',
  'pricingQuantity','billingQuantity','unitPrice','price','amount','totalAmount','lineTotal','pricingAmount',
  'expectedQuantity','actualQuantity','countedQuantity','difference','adjustmentQuantity',
]);
const measureFields = ['unit','quantity','actual','expected','difference','status'];
const scalarSql = (body, keys) => `json_object(${keys.map(key => {
  const path = `'$.${key}'`, value = `json_extract(${body},${path})`;
  return `'${key}',CASE WHEN json_type(${body},${path}) IN ('text','integer','real','true','false') THEN CASE WHEN typeof(${value})='text' THEN substr(${value},1,2048) ELSE ${value} END END`;
}).join(',')})`;

/**
 * Warehouse-only exact-record adapter. Inject the SAME database/session/authorizer
 * and Goodall directory; this never opens SQLite or starts listeners/network.
 * Main may pass the returned object as OfflineWarehouseWorkspace.directory.
 * page/lookup remain Goodall's SQL API. detail returns whitelisted stored scalars
 * and at most 25 original product lines, pinned to metadata.checkpoint. No writes.
 */
export function createOfflineWarehouseRepository({database, session, authorize, directory, clock = Date.now}) {
  if(typeof database?.transaction !== 'function' || typeof session?.isCurrent !== 'function' ||
    typeof authorize !== 'function' || typeof directory?.page !== 'function' || typeof directory?.lookup !== 'function') {
    fail('invalid-argument', 'Warehouse directory requires the existing authorized SQLite owner');
  }
  const sourceScope=directory.sourceScope;
  const scope = Object.freeze({...session.scope});
  const scopeKeys = ['tenantId','principalId','permissionRevision','sessionId'];
  if(!scopeKeys.every(key => id(scope[key]))) fail('invalid-argument', 'Invalid warehouse scope');
  const current = () => {
    if(!session.isCurrent(scope) || !scopeKeys.every(key => session.scope[key] === scope[key])) fail('permission-denied', 'Warehouse session changed');
  };
  async function access(source) {
    current();
    const grant = await authorize({scope, kind: sourceScope?'app.session':'home.read'});
    current();
    if(!grant || !scopeKeys.every(key => grant[key] === scope[key]) || !Number.isSafeInteger(grant.expiresAtMs) || clock() >= grant.expiresAtMs ||
      !grant.capabilities?.includes(WAREHOUSE_SOURCES[source].capability) || (!grant.capabilities.includes('home.read')&&source!=='warehouseImports') ||
      (grant.appSession?.sourceProfile || 'legacy-v1') !== 'legacy-v1') fail('permission-denied', 'Warehouse capability denied');
    return grant;
  }
  async function checkpoint(db, expected) {
    const [head] = await db.query(`SELECT h.generation,h.captured_at,h.day_key,
      ${sourceScope?"json_extract(h.snapshot_json,'$.kind') AS module_kind,":''}json_extract(h.snapshot_json,'$.feedGeneration') AS feed_generation,
      json_extract(h.snapshot_json,'$.feedSeq') AS seq,
      COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1') AS profile,
      c.applied_seq,c.reported_seq
      FROM offline_home_head_v1 h JOIN offline_home_feed_checkpoint_v1 c
      ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
      WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=?`, [scope.tenantId,scope.principalId,scope.permissionRevision]);
    if(!head || head.feed_generation !== head.generation || head.profile !== 'legacy-v1' ||
      head.applied_seq !== head.seq || (head.reported_seq !== head.seq&&!(sourceScope&&head.module_kind==='warehouse-imports-pages-v2'&&head.reported_seq===-1)) || !Number.isSafeInteger(head.seq)) fail('stale-checkpoint', 'Warehouse source incomplete');
    const result = {tenantId:scope.tenantId,principalId:scope.principalId,permissionRevision:scope.permissionRevision,sessionId:scope.sessionId,
      generation:head.generation,seq:head.seq,capturedAt:head.captured_at,dayKey:head.day_key,sourceProfile:head.profile};
    if(!same(result, expected)) fail('stale-checkpoint', 'Warehouse checkpoint changed');
  }
  return Object.freeze({
    sources: directory.sources,
    syncSource: directory.syncSource,
    page: (...args) => directory.page(...args),
    lookup: (...args) => directory.lookup(...args),
    async detail(source, recordId, {checkpoint: pinned, cursor = null, limit = 25} = {}) {
      if(!Object.hasOwn(WAREHOUSE_SOURCES, source) || !id(recordId) || !pinned || !Number.isInteger(limit) || limit < 1 || limit > 25 ||
        (cursor !== null && (typeof cursor !== 'string' || cursor.length > 8192))) fail('invalid-argument', 'Invalid warehouse detail request');
      await access(source);
      // This verifies the shared source manifest/capability before exact SQL.
      const preview = await directory.lookup(source, [recordId], {checkpoint:pinned});
      if(!same(preview.metadata?.checkpoint, pinned)) fail('stale-checkpoint', 'Warehouse lookup checkpoint changed');
      let after = -1;
      if(cursor !== null) {
        let saved; try { saved = JSON.parse(cursor); } catch { fail('invalid-argument', 'Invalid warehouse line cursor'); }
        if(!same(saved.scope, scope) || saved.source !== source || saved.id !== recordId || !same(saved.checkpoint, pinned) || !Number.isInteger(saved.after) || saved.after < 0) fail('stale-checkpoint', 'Warehouse line cursor changed');
        after = saved.after;
      }
      return database.transaction(async db => {
        const grant = await access(source);
        await checkpoint(db, pinned);
        if(!preview.items.some(item => item.id === recordId)) {
          await checkpoint(db,pinned); await access(source); current();
          return {document:null,items:[],hasMore:false,nextCursor:null,metadata:preview.metadata};
        }
        const keys = [scope.tenantId,scope.principalId,pinned.generation,source,recordId,pinned.seq,scope.tenantId,recordId];
        const predicate = `r.tenant_id=? AND r.principal_id=? AND r.generation=? AND r.source=? AND r.id=? AND r.seq<=?
          AND json_extract(r.body,'$.companyId')=? AND json_extract(r.body,'$.id')=?`;
        const pathSql = `CASE WHEN json_type(body,'$.items')='array' THEN '$.items' WHEN json_type(body,'$.lines')='array' THEN '$.lines' WHEN json_type(body,'$.products')='array' THEN '$.products' ELSE NULL END`;
        const [header] = await db.query(`SELECT ${scalarSql('r.body', fields)} AS document,${pathSql} AS line_path FROM offline_home_feed_records_v1 r WHERE ${predicate}`, keys);
        if(!header) fail('stale-checkpoint', 'Warehouse record changed');
        const document = JSON.parse(header.document);
        let rows = [];
        if(header.line_path) {
          rows = await db.query(`SELECT CAST(line.key AS INTEGER) AS ordinal,${scalarSql('line.value', fields)} AS document
            FROM offline_home_feed_records_v1 r,json_each(r.body,?) line WHERE ${predicate}
            AND line.type='object' AND CAST(line.key AS INTEGER)>? ORDER BY CAST(line.key AS INTEGER) LIMIT ?`, [header.line_path,...keys,after,limit+1]);
        } else if(after < 0) rows = [{ordinal:0,document:header.document}];
        const measures = {};
        for(const key of ['measures','countedMeasures','extraMeasures']) {
          const saved = await db.query(`SELECT ${scalarSql('measure.value', measureFields)} AS document
            FROM offline_home_feed_records_v1 r,json_each(r.body,?) measure WHERE ${predicate}
            AND measure.type='object' ORDER BY CAST(measure.key AS INTEGER) LIMIT 101`, ['$.'+key,...keys]);
          measures[key] = {items:saved.slice(0,100).map(row => JSON.parse(row.document)),hasMore:saved.length > 100};
        }
        const hasMore = rows.length > limit, items = rows.slice(0,limit).map(row => ({ordinal:row.ordinal,document:JSON.parse(row.document)}));
        await checkpoint(db, pinned); await access(source); current();
        if(clock() >= grant.expiresAtMs) fail('permission-denied', 'Warehouse grant expired');
        return {document,items,measures,hasMore,nextCursor:hasMore ? JSON.stringify({scope,source,id:recordId,checkpoint:pinned,after:items.at(-1).ordinal}) : null,
          metadata:{...preview.metadata,projection:'warehouse-stored-detail-v1',stringLimit:2048,financialCalculationAllowed:false}};
      });
    },
  });
}
