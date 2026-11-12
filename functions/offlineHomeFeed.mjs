import {randomUUID,createHash} from 'node:crypto';
import {homeFeedSources,PAYROLL_FEED_ADDITIONS,PAYROLL_HOME_FEED_SOURCES} from '../development/hd-manager/application/src/data/homeFeedContract.js';
import serverEnvironment from './offlineServerEnvironment.cjs';
import documentSanitizer from './offlineDocumentSanitizer.cjs';
// Development/Staging adapter. This module is not registered in index.js.
export const HOME_PERMISSION_MAPPING=Object.freeze({
 orders:['orders','view_orders'],payments:['finance','view_all_cashflow'],expenses:['finance','view_all_cashflow'],
 financials:['payroll','view_all_payroll'],attendance:['payroll','view_all_payroll'],performance:['payroll','view_all_payroll'],
 payrollDebtCarryovers:['payroll','view_all_payroll'],payrollAdjustments:['payroll','view_all_payroll'],payrollPeriods:['payroll','view_all_payroll'],payrollSnapshots:['payroll','view_all_payroll'],employeeReviews:['payroll','view_all_payroll'],customerComplaints:['payroll','view_all_payroll'],
 customers:['debt','view_all_debt'],employees:['payroll','view_all_payroll'],companies:['home','view_dashboard'],
 products:['warehouse_import','view_inventory_stock'],warehouseImports:['warehouse_import','view_warehouse_import'],
 warehouseDispatches:['warehouse_dispatch','view_warehouse_dispatch'],warehouseStockCounts:['warehouse_import','view_actual_inventory_stock'],
 holidays:['payroll','view_all_payroll'],deliveryReports:['home','view_quick_report'],assets:['home','view_quick_report'],assetCostLogs:['finance','view_all_cashflow'],advances:['payroll','view_all_payroll'],orderRequests:['orders','view_orders'],
});
const denied=()=>Object.assign(Error('Home source access denied'),{code:'permission-denied'});
const clean=value=>JSON.parse(JSON.stringify(value,(key,item)=>/(password|token|secret|apikey|map.*key)$/i.test(key)?undefined:item));
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const fingerprint=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export async function createOfflineHomeFeed({db,projectId,appId,tenantId,asOfDay,authenticate,projector,sourceProfile,authorizeNative,coverage,provenance,environment,verifiedDatabase,resolveCurrentActor,payrollSources=false}){
 const trusted=serverEnvironment.isTrustedOfflineServerEnvironment(environment,projectId,appId,verifiedDatabase||db);
 if((!projectId.startsWith('demo-')||!process.env.FIRESTORE_EMULATOR_HOST)&&!trusted)throw Error('Unapproved Home feed environment');
 if(trusted&&(!resolveCurrentActor||!verifiedDatabase||db===verifiedDatabase||sourceProfile))throw Error('Trusted feed requires original-role verifier and fenced journal writer');
 if(payrollSources===true&&(trusted||sourceProfile))throw Error('Payroll source extension is Local legacy-only; no implicit trusted Production activation');
 const sanitize=trusted?documentSanitizer.sanitizeOfflineDocument:clean;
 const payrollEnabled=payrollSources===true;
 const sources=payrollEnabled?PAYROLL_HOME_FEED_SOURCES:sourceProfile?homeFeedSources(sourceProfile):projector.HOME_FEED_SOURCES,base=name=>db.collection(`artifacts/${appId}/public/data/${name}`),headRef=db.doc(`offlineHomeFeeds/${tenantId}`),events=headRef.collection('changes'),versions=headRef.collection('sourceVersions');
 const previous=(await headRef.get()).data(),generation=previous?.generation||randomUUID();
 let counts=previous?.counts||Object.fromEntries(sources.map(s=>[s,0])),seq=previous?.seq||0;
 if(sources.some(source=>(!Number.isSafeInteger(counts[source])||counts[source]<0)&&!(payrollEnabled&&PAYROLL_FEED_ADDITIONS.includes(source)&&counts[source]===undefined)))throw Error('Invalid persisted Home feed; recovery required');
 const seen=new Set(),scheduled=new Set(),stops=[],known=new Map(),recordKey=(source,id)=>source+'\u0000'+id;
 const versionRef=(source,id)=>versions.doc(fingerprint([source,id]));
 if(previous?.schemaVersion===1){
  const saved=await versions.where('generation','==',generation).get();for(const doc of saved.docs){const row=doc.data();known.set(recordKey(row.source,row.id),row);}
 }else if(seq){
  // Non-destructive upgrade of the earlier local read model. Reconstruct its
  // fingerprints from the durable journal; never reset a client's checkpoint.
  let after=0;while(after<seq){const saved=await events.where('seq','>',after).where('seq','<=',seq).orderBy('seq').limit(200).get();if(saved.empty)throw Error('Home journal recovery gap');for(const doc of saved.docs){const event=doc.data();if(event.generation!==generation||event.seq!==++after)throw Error('Home journal recovery sequence mismatch');const key=recordKey(event.source,event.id);if(event.operation==='delete')known.delete(key);else known.set(key,{generation,source:event.source,id:event.id,hash:fingerprint(event.document)});}}
  const recovered=[...known.values()];for(let offset=0;offset<recovered.length;offset+=200){const batch=db.batch();for(const row of recovered.slice(offset,offset+200))batch.set(versionRef(row.source,row.id),row);await batch.commit();}
 }
 for(const source of sources)if(counts[source]===undefined){if(!payrollEnabled||!PAYROLL_FEED_ADDITIONS.includes(source)||[...known.values()].some(row=>row.source===source))throw Error('New payroll source recovery mismatch');counts={...counts,[source]:0};}
 for(const source of sources)if([...known.values()].filter(row=>row.source===source).length!==counts[source])throw Error('Persisted Home source count mismatch: '+source);
 const sourceRevisions=Object.fromEntries(sources.map(source=>[source,Number.isSafeInteger(previous?.sourceRevisions?.[source])?previous.sourceRevisions[source]:seq]));
 const updatingSources=new Set(),sourceErrors=new Set();
 const sourceMetadata=(changed,through)=>sourceProfile?{}:{sourceRevisions:{...sourceRevisions,...(changed?{[changed]:through}:{})},sourceReady:Object.fromEntries(sources.map(name=>[name,seen.has(name)&&!updatingSources.has(name)&&!sourceErrors.has(name)]))};
 let tail=Promise.resolve(),failed=null,closed=false;
 const saveHead=()=>headRef.set({schemaVersion:1,generation,seq,counts:{...counts},asOfDay,ready:seen.size===sources.length&&!failed,updatedAt:Date.now(),...sourceMetadata()});
 await saveHead();
 for(const source of sources){
  const query=source==='companies'?base(source).where('__name__','==',base(source).doc(tenantId)):base(source).where('companyId','==',tenantId);
  stops.push(query.onSnapshot(snapshot=>{
   const initial=!scheduled.has(source);scheduled.add(source);
   const changes=snapshot.docChanges().map(c=>({source,id:c.doc.id,operation:c.type==='removed'?'delete':'upsert',document:c.type==='removed'?null:sanitize({...c.doc.data(),id:c.doc.id})}));
   const present=initial?new Set(snapshot.docs.map(doc=>doc.id)):null;
   tail=tail.then(async()=>{
    if(closed)return;
    if(initial)for(const row of known.values())if(row.source===source&&!present.has(row.id))changes.push({source,id:row.id,operation:'delete',document:null});
    const effective=changes.filter(item=>{const old=known.get(recordKey(source,item.id));return item.operation==='delete'?!!old:!old||old.hash!==fingerprint(item.document);});
    if(effective.length)updatingSources.add(source);
    for(let offset=0;offset<effective.length;offset+=100){
     const batch=db.batch(),nextCounts={...counts},nextVersions=[];let nextSeq=seq;
     for(const item of effective.slice(offset,offset+100)){const key=recordKey(source,item.id),old=known.get(key);nextSeq++;nextCounts[source]+=item.operation==='delete'?-1:old?0:1;batch.set(events.doc(String(nextSeq).padStart(16,'0')),{...item,seq:nextSeq,generation});
      if(item.operation==='delete'){batch.delete(versionRef(source,item.id));nextVersions.push([key,null]);}
      else{const version={generation,source,id:item.id,hash:fingerprint(item.document)};batch.set(versionRef(source,item.id),version);nextVersions.push([key,version]);}
     }
     batch.set(headRef,{schemaVersion:1,generation,seq:nextSeq,counts:nextCounts,asOfDay,ready:false,updatedAt:Date.now(),...sourceMetadata(source,nextSeq)});await batch.commit();
     seq=nextSeq;sourceRevisions[source]=nextSeq;counts=nextCounts;for(const [key,version]of nextVersions)if(version)known.set(key,version);else known.delete(key);
    }
    updatingSources.delete(source);seen.add(source);await saveHead();
   }).catch(async error=>{sourceErrors.add(source);failed=error;await saveHead().catch(()=>{});});
  },error=>{sourceErrors.add(source);failed=error;void saveHead().catch(()=>{});}));
 }
 async function access(token){
  if(trusted){const actor=await resolveCurrentActor(token);if(actor.tenantId!==tenantId||!actor.capabilities.includes('home.read'))throw denied();return actor;}
  const identity=await authenticate(token);if(identity.projectId!==projectId||!identity.uid)throw denied();
  const binding=await db.doc(`offlineHomeActors/${identity.uid}`).get();const policy=binding.data();
  if(!policy?.active||policy.tenantId!==tenantId)throw denied();
  if(sourceProfile==='native-isolation-v1'){
   if(!authorizeNative)throw denied();return authorizeNative({identity,policy,base});
  }
  const [c,e]=await Promise.all([base('companies').doc(tenantId).get(),base('employees').doc(policy.employeeId).get()]);const company=c.data(),employee=e.data();
  if(!company||!employee||employee.isArchived||employee.companyId!==tenantId)throw denied();
  const subject={company:{...company,id:tenantId},employee:{...employee,id:e.id},currentUser:{...employee,id:e.id}};
  const checks=[['home','view_dashboard'],['home','view_quick_report'],...Object.values(HOME_PERMISSION_MAPPING)];
  if(checks.some(([module,action])=>!projector.hasCompanyRolePermissionAction(subject,module,action)))throw denied();
  const permissionRevision=createHash('sha256').update(JSON.stringify([company.rolePermissions,company.rolePermissionActions,company.employeeRolePermissionActions,company.employeeRolePermissions,employee.role,employee.position,employee.positions,employee.additionalPositions,employee.rolePermissions,employee.rolePermissionActions,employee.permissionOverrides,employee.isArchived])).digest('hex');
  return {uid:identity.uid,tenantId,permissionRevision,subject};
 }
 async function handle({action,token,body={}}){
  const actor=await access(token);await tail;if(failed)throw failed;
  if(payrollEnabled){const grant=(await db.doc('offlineCustomerAccess/'+actor.uid).get()).data();if(!grant?.active||grant.tenantId!==tenantId||grant.permissionRevision!==actor.permissionRevision||!grant.capabilities?.includes('payroll.company.read'))throw denied();}
  const head=(await headRef.get()).data();if(!head.ready)throw Object.assign(Error('Home sources initializing'),{code:'unavailable'});
  if(action==='home-head')return {...head,tenantId,principalId:actor.uid,permissionRevision:actor.permissionRevision,sources,...(sourceProfile?{sourceProfile,coverage,provenance}:{})};
  if(action==='home-page'){
   const {generation:epoch,after=0,target=head.seq,limit=100}=body;
   if(epoch!==generation||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(target)||target>head.seq||target<after||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Invalid Home checkpoint');
   const page=await events.where('seq','>',after).where('seq','<=',target).orderBy('seq').limit(limit).get();
   return {generation,after,target,events:page.docs.map(doc=>doc.data()),principalId:actor.uid,tenantId,permissionRevision:actor.permissionRevision};
  }
  if(action==='home-report'){
   const start=head.seq,sourceVersions=new Map(known);
   const sourcesData=await db.runTransaction(async tx=>{
    const result={};for(const source of sources){const query=source==='companies'?base(source).where('__name__','==',base(source).doc(tenantId)):base(source).where('companyId','==',tenantId);const snap=await tx.get(query);result[source]=snap.docs.map(doc=>sanitize({...doc.data(),id:doc.id}));}return result;
   },{readOnly:true});
   for(const source of sources){if(sourcesData[source].length!==head.counts[source]||sourcesData[source].some(row=>sourceVersions.get(recordKey(source,row.id))?.hash!==fingerprint(row)))throw Object.assign(Error('Home journal has not caught up with source snapshot'),{code:'unavailable'});}
   await tail;const current=(await headRef.get()).data();if(current.seq!==start)throw Object.assign(Error('Home sources changed during comparison'),{code:'unavailable'});
    if(sourceProfile==='native-isolation-v1')return {generation,seq:start,sourceProfile,sources:sourcesData,sourceCounts:head.counts,coverage,provenance,financialKpisVerified:false};
    const result=projector.projectCompanyHome({sources:sourcesData,tenantId,asOfDay});return {generation,seq:start,productDetail:body.product?projector.buildHomeProductDetail({orders:sourcesData.orders,products:sourcesData.products,product:body.product,orderRequests:sourcesData.orderRequests,warehouseDispatches:sourcesData.warehouseDispatches}):undefined,reports:result.reports,finance:result.snapshot.finance,operations:result.snapshot.operations,business:result.snapshot.business,sourceCounts:head.counts};
  }
  throw Error('Unsupported Home action');
 }
 return {handle,access,async ready(){for(let i=0;i<1800;i++){await tail;if(failed)throw failed;if(seen.size===sources.length)return;await new Promise(r=>setTimeout(r,100));}throw Error('Home feed initialization timeout');},async settle(){await tail;return (await headRef.get()).data();},close(){closed=true;for(const stop of stops)stop();}};
}
