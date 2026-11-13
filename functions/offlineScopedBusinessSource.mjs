// Existing source documents, current ORIGINAL RBAC, bounded query pages. The
// employee/customer/finance data never share an unrestricted Home feed here.
import {createHash} from 'node:crypto';
import {SCOPED_BUSINESS_SOURCES as specs,scopedQuery,scopedSearch,projectScopedDocument} from '../development/hd-manager/application/src/data/scopedBusinessContract.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const denied=()=>Object.assign(Error('Current module scope denied'),{code:'permission-denied'});
export function createScopedBusinessSource({db,appId,authenticate,currentCore,hasAction,domain,cashDomain,Filter}){
 return async request=>{
  const identity=await authenticate(request.token),scope=request.body?.scope;
  if(!scope||scope.principalId!==identity.uid||typeof scope.sessionId!=='string'||!scope.sessionId)throw denied();
  const plan=request.body.plan;if(!Array.isArray(plan)||!plan.length||plan.length>2)throw denied();
  return db.runTransaction(async tx=>{
   const actor=await currentCore(tx,identity.uid);if(actor.tenantId!==scope.tenantId||actor.permissionRevision!==scope.permissionRevision)throw denied();
   const results=[];for(const item of plan){
    const spec=Object.hasOwn(specs,item.source)&&specs[item.source];if(!spec||!hasAction(actor.subject,spec.module,spec.action))throw denied();
    const q=scopedQuery(item.options),key=hash([scope,item.source,{...q,cursor:null}]);
    if(item.source==='warehouseImports'&&[q.from,q.to,q.text,q.customerId,q.employeeId,q.status].some(Boolean)&&!hasAction(actor.subject,'warehouse_import','filter_warehouse_import'))throw denied();
    const ownDelivery=item.source==='deliveryReports'&&!hasAction(actor.subject,'delivery_reports','view_all_delivery_reports');
    let query=db.collection(`artifacts/${appId}/public/data/${item.source}`).where('companyId','==',actor.tenantId);
    if(ownDelivery)query=query.where(Filter.or(Filter.where('empId','==',actor.subject.employee.id),Filter.where('createdByEmpId','==',actor.subject.employee.id)));
    let after=null;if(q.cursor){const cursor=JSON.parse(q.cursor);if(cursor.key!==key||typeof cursor.after!=='string'||cursor.after.includes('/'))throw denied();after=cursor.after;}
    if(item.ids){if(!Array.isArray(item.ids)||item.ids.length>25||item.ids.some(id=>typeof id!=='string'||!id||id.includes('/')))throw denied();query=query.where('__name__','in',item.ids);}
    query=query.orderBy('__name__','desc');if(after)query=query.startAfter(after);
    const snapshot=await tx.get(query.limit(item.ids?25:101)),rows=[];let scanned=0,last=null;
    for(const doc of snapshot.docs){if(scanned>=100||rows.length===q.limit)break;scanned++;last=doc.id;
     const full={...doc.data(),id:doc.id};if(full.companyId!==actor.tenantId)throw denied();
     const projected=projectScopedDocument(item.source,full);
     const date=item.source==='employees'?'':item.source==='expenses'||item.source==='payments'?domain.resolveCashflowDateKey(full):String(full.date||'').slice(0,10);
     const approval=item.source==='expenses'||item.source==='payments'?cashDomain.requiresCashflowApproval(full)&&full.approvalStatus!==cashDomain.CASHFLOW_APPROVAL_STATUS.approved?(full.approvalStatus===cashDomain.CASHFLOW_APPROVAL_STATUS.rejected?'rejected':'pending'):'approved':String(full.status||'');
     const employeeKeys=[full.empId,full.createdByEmpId,item.source==='employees'?doc.id:null].filter(Boolean),search=scopedSearch(projected);
     if(!item.ids&&(full.isArchived||q.from&&date<q.from||q.to&&date>=q.to||q.monthKey&&!date.startsWith(q.monthKey)||q.employeeId&&!employeeKeys.includes(q.employeeId)||q.customerId!==null&&full.customerId!==q.customerId||q.status!==null&&approval!==q.status||scopedSearch({q:q.text}).split(' ').filter(Boolean).some(token=>!search.includes(token))))continue;
     rows.push({id:doc.id,document:projected,businessDate:date||null,approval,employeeKeys,search,version:hash([doc.updateTime.toMillis(),projected]),serverUpdatedAt:doc.updateTime.toMillis(),capturedAt:Date.now()});
    }
    const hasMore=!item.ids&&(scanned<snapshot.docs.length||snapshot.docs.length===101);
    results.push({source:item.source,key,query:q,items:rows,scanned,hasMore,nextCursor:hasMore?JSON.stringify({key,after:last}):null,serverOrder:'document-id-desc',completeSource:false});
   }
   return {scope,results,financialCalculationAllowed:false,allHomeSourcesComplete:false};
  },{readOnly:true});
 };
}
