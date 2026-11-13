// One authorization boundary for existing command transactions. Local keeps its
// durable policy records; trusted hosts re-read the actual Identity Center
// actor INSIDE the transaction. No synthetic grants/bindings are persisted.
const {isTrustedOfflineServerEnvironment}=require('./offlineServerEnvironment.cjs');
const fail=message=>{throw Object.assign(Error(message),{code:'permission-denied'});};
const segment=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
function assertOfflineCommandEnvironment({db,projectId,appId,environment,authorize}){
 const trusted=isTrustedOfflineServerEnvironment(environment,projectId,appId,db);
 const local=/^demo-[a-z0-9-]+$/.test(projectId||'')&&/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')&&(!db?.projectId||db.projectId===projectId);
 if(!segment(appId)||typeof db?.runTransaction!=='function'||(!trusted&&!local)||trusted&&typeof authorize!=='function')fail('Verified command environment/current authority required; Local requires Emulator');
 return trusted;
}
function createOfflineCommandAuthority(options){
 const {db,appId,readAuthority}=options,trusted=assertOfflineCommandEnvironment({...options,authorize:readAuthority});
 return async(tx,actor)=>{
  if(!segment(actor?.uid)||!segment(actor?.tenantId)||typeof actor?.permissionRevision!=='string'||!actor.permissionRevision)fail('Verified command identity required');
  let subject,capabilities,employeeId,sourceProfile;
  if(trusted){
   const current=await readAuthority(tx,actor);
   if(!current||current.uid!==actor.uid||current.tenantId!==actor.tenantId||current.permissionRevision!==actor.permissionRevision)fail('Current command identity/revision changed');
   ({subject,capabilities}=current);employeeId=subject?.employee?.id;
  }else{
   const binding=(await tx.get(db.doc('offlineHomeActors/'+actor.uid))).data(),access=(await tx.get(db.doc('offlineCustomerAccess/'+actor.uid))).data();
   if(!binding?.active||binding.tenantId!==actor.tenantId||binding.sourceArchiveSha256||!binding.employeeId||!access?.active||access.tenantId!==actor.tenantId||access.permissionRevision!==actor.permissionRevision||access.readScope!=='tenant')fail('Current Local command scope denied');
   employeeId=binding.employeeId;capabilities=access.capabilities;sourceProfile=access.appIdentity?.homeSourceProfile;
   const root='artifacts/'+appId+'/public/data/';
   const [c,e]=await Promise.all([tx.get(db.doc(root+'companies/'+actor.tenantId)),tx.get(db.doc(root+'employees/'+employeeId))]);
   subject={company:{...c.data(),id:c.data()?actor.tenantId:null},employee:{...e.data(),id:e.data()?employeeId:null}};
  }
  if(!subject?.company?.id||subject.company.id!==actor.tenantId||subject.company.isArchived||!segment(employeeId)||subject.employee?.id!==employeeId||subject.employee.companyId!==actor.tenantId||subject.employee.isArchived||['blocked','inactive'].includes(subject.employee.status)||!Array.isArray(capabilities))fail('Current command membership denied');
  return {employeeId,subject:{...subject,currentUser:{...subject.employee,firebaseUid:actor.uid}},capabilities,sourceProfile};
 };
}
module.exports={assertOfflineCommandEnvironment,createOfflineCommandAuthority};
