// Proposed target: functions/offlineWarehouseImportSource.cjs. Read-only, same
// Development DB and existing Home source-version authority; no new feed/cache.
const {createHash}=require('node:crypto');
const {readOriginalCoreActor}=require('./offlineCoreAppPolicy.cjs');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const clean=v=>JSON.parse(JSON.stringify(v,(k,x)=>/(password|token|secret|apikey|map.*key)$/i.test(k)?undefined:x));
const denied=()=>Object.assign(Error('Warehouse import source denied'),{code:'permission-denied'});
const stale=()=>Object.assign(Error('Warehouse import source is catching up'),{code:'unavailable'});
const source='warehouseImports',kind='warehouse-imports-pages-v2';
// Existing import presentation only. No related Customer/employee/finance read.
const fields=['id','companyId','date','requestDate','requestDateKey','orderRequestDate','sourceOrderRequestDate','dispatchDate','deliveryDate','createdAt','updatedAt','timestamp','receivedAt','sentAt','approvedAt','paidAt','lastMessageAt','lastActivityAt','status','isArchived','empId','createdByEmpId','productId','productName','productNameSnapshot','productCode','name','description','groupName','productGroup','code','supplier','supplierName','supplierCustomerId','customerId','customerName','customerNameSnapshot','warehouseId','warehouseName','branchId','branchName','customerBranchName','sourceOrderRequestId','orderId','assignedDriverId','assignedDriverNameSnapshot','driverId','driverNameSnapshot','deliveryStatus','deliveryStatusKey','deliveryStatusLabel','trackingStatus','fulfillmentStatus','sourceType','sourceLabel','reason','note','quantity','pieceCount','quantityCount','totalQuantity','totalKg','weightKg','actualWeightKg','orderedUnit','quantityUnit','unit','pricingUnit','billingUnit','purchaseUnit','pricingQuantity','billingQuantity','unitPrice','price','amount','totalAmount','lineTotal','pricingAmount','expectedQuantity','actualQuantity','countedQuantity','difference','adjustmentQuantity'];
const scalar=v=>v===null||['string','number','boolean'].includes(typeof v);
function project(row){
 const result={};for(const key of fields){const value=row[key];if(value===undefined)continue;if(scalar(value))result[key]=value;else if(['date','requestDate','createdAt','updatedAt','timestamp','receivedAt','sentAt','approvedAt','paidAt','lastMessageAt','lastActivityAt'].includes(key)&&value&&typeof value==='object')result[key]=Object.fromEntries(['seconds','nanoseconds','_seconds','_nanoseconds'].filter(k=>Number.isFinite(value[k])).map(k=>[k,value[k]]));}
 for(const name of ['items','lines','products','measures','countedMeasures','extraMeasures'])if(Array.isArray(row[name])){if(row[name].length>1000)throw stale();result[name]=row[name].map(item=>{const line={};for(const key of [...fields,'actual','expected'])if(item&&scalar(item[key]))line[key]=item[key];return line;});}
 return result;
}
function createOfflineWarehouseImportSource({db,projectId,appId,authenticate,hasAction,Filter,environment,resolveActor,loadContract=()=>import('../development/hd-manager/application/src/data/warehouseImportsReadContract.js')}){
 const trusted=require('./offlineServerEnvironment.cjs').isTrustedOfflineServerEnvironment(environment,projectId,appId,db);
 if(trusted?typeof resolveActor!=='function':(!/^demo-[a-z0-9-]+$/.test(projectId)||!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')))throw denied();
 return async({action,token,body={}})=>{
  if(!['warehouse-import-head','warehouse-import-page'].includes(action))throw denied();
  const identity=await authenticate(token),d=await loadContract();if(identity.projectId!==projectId||!identity.uid)throw denied();
  return db.runTransaction(async tx=>{
   const actor=trusted?await resolveActor(tx,identity.uid):await readOriginalCoreActor({db,reader:tx,appId,uid:identity.uid});
   const access=trusted?{active:true,readScope:'tenant',tenantId:actor.tenantId,permissionRevision:actor.permissionRevision,appIdentity:{id:actor.subject.employee.id,companyId:actor.tenantId},capabilities:actor.capabilities}:(await tx.get(db.doc('offlineCustomerAccess/'+identity.uid))).data(),s=body.scope;
   if(!access?.active||access.readScope!=='tenant'||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||access.appIdentity?.id!==actor.subject.employee.id||access.appIdentity?.companyId!==actor.tenantId||!access.capabilities?.includes('home.imports.read')||!hasAction(actor.subject,'warehouse_import','view_warehouse_import')||s?.principalId!==identity.uid||s?.tenantId!==actor.tenantId||s?.permissionRevision!==actor.permissionRevision||typeof s.sessionId!=='string'||!s.sessionId)throw denied();
   const root='offlineHomeFeeds/'+actor.tenantId,home=(await tx.get(db.doc(root))).data(),sourceSeq=home?.sourceRevisions?.[source];
   if(home?.sourceReady?.[source]!==true||typeof home.generation!=='string'||!Number.isSafeInteger(sourceSeq)||sourceSeq<0||!Number.isSafeInteger(home.counts?.[source])||home.counts[source]<0||!/^\d{4}-\d{2}-\d{2}$/.test(home.asOfDay))throw stale();
   // Constant metadata: no source-version manifest scan. This changes only
   // when Imports change, independent of finance/global journal increments.
   const generation='wi_'+hash([identity.uid,actor.permissionRevision,home.generation,sourceSeq,home.counts[source],kind]);
   const head={kind,ready:true,tenantId:actor.tenantId,principalId:identity.uid,permissionRevision:actor.permissionRevision,sessionId:s.sessionId,generation,seq:sourceSeq,asOfDay:home.asOfDay,sources:[source],counts:{[source]:home.counts[source]},sourceAnchor:{generation:home.generation,seq:sourceSeq},filterAllowed:hasAction(actor.subject,'warehouse_import','filter_warehouse_import')===true,financialCalculationAllowed:false,allHomeSourcesComplete:false};
   if(action==='warehouse-import-head')return head;
   const q=d.importQuery(body.query),queryHash=hash([identity.uid,actor.permissionRevision,s.sessionId,generation,d.importQueryKey(q)]);
   if(d.importHasFilter(q)&&!head.filterAllowed)throw denied();
   let after=null;if(q.cursor){try{after=JSON.parse(q.cursor);}catch{throw Object.assign(Error('Invalid Imports cursor'),{code:'invalid-argument'});}if(after.v!==2||after.epoch!==generation||after.key!==queryHash)return {reset:true,head};if(!Array.isArray(after.after)||after.after.length!==2||!/^\d{4}-\d{2}-\d{2}$/.test(after.after[0])||typeof after.after[1]!=='string'||after.after[1].includes('/'))throw denied();}
   const collection=db.collection('artifacts/'+appId+'/public/data/'+source);
   let query=collection.where('companyId','==',actor.tenantId);
   if(q.from)query=query.where('date','>=',q.from);if(q.to)query=query.where('date','<',q.to);if(q.status)query=query.where('status','==',q.status);if(q.customerId)query=query.where('customerId','==',q.customerId);
   if(q.employeeId){if(!Filter?.or)throw stale();query=query.where(Filter.or(Filter.where('empId','==',q.employeeId),Filter.where('createdByEmpId','==',q.employeeId)));}
   query=query.orderBy('date','desc').orderBy('__name__','desc');if(after)query=query.startAfter(...after.after);
   // Firestore has no persisted Vietnamese substring index in this source.
   // Bound residual matching to100 candidates; all predicates precede the25
   // matching-row limit. A scan cursor explicitly preserves unfinished search.
   const budget=q.tokens.length||q.employeeId?100:25,snapshot=await tx.get(query.limit(budget+1)),items=[];
   let consumed=0,last=after?.after||null,bytes=0;
   for(const doc of snapshot.docs){if(consumed===budget||items.length===25)break;
    const full=clean({...doc.data(),id:doc.id});if(full.companyId!==actor.tenantId||!/^\d{4}-\d{2}-\d{2}$/.test(full.date||''))throw stale();
    const v=(await tx.get(db.doc(root+'/sourceVersions/'+hash([source,doc.id])))).data();if(v?.generation!==home.generation||v.source!==source||v.id!==doc.id||v.hash!==hash(full))throw stale();
    const matches=d.importMatches(full,q),document=matches?{...project(full),__moduleVersionHash:v.hash}:null,n=document?Buffer.byteLength(JSON.stringify(document)):0;
    if(n>500000)throw stale();if(document&&bytes+n>500000)break;
    consumed++;last=[full.date,doc.id];if(document){items.push({id:doc.id,document});bytes+=n;}
   }
   const hasMore=consumed<snapshot.docs.length||snapshot.docs.length===budget+1;
   if(hasMore&&!consumed)throw stale();
   const nextCursor=hasMore?JSON.stringify({v:2,epoch:generation,key:queryHash,after:last}):null;
   const pageDigest=hash([generation,queryHash,q.cursor,items.map(x=>[x.id,x.document.__moduleVersionHash])]);
   return {head,queryHash,requestCursor:q.cursor,items,hasMore,nextCursor,scanned:consumed,scanExhausted:!hasMore,pageDigest};
  },{readOnly:true});
 };
}
module.exports={createOfflineWarehouseImportSource};
