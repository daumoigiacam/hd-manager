// One private calculation per process. TZ is set by the parent before Node
// starts; changing process-wide TZ inside a shared Cloud Function is forbidden.
const {decodeEmployeeHomePrivateValue}=require('./employeeHomePrivateValues.js');
process.once('message',message=>{
 try{
  const modulePath=process.argv[2];if(!modulePath)throw Error('Missing private projector');
  const domain=require(modulePath),{scope,snapshot}=decodeEmployeeHomePrivateValue(message);
  const canonical=zone=>new Intl.DateTimeFormat('en',{timeZone:zone}).resolvedOptions().timeZone;
  if(canonical(scope.timeZone)!==canonical(Intl.DateTimeFormat().resolvedOptions().timeZone))throw Error('Home timezone mismatch');
  const model=domain.projectEmployeeHomeSnapshot(scope,snapshot);
  process.send({ok:true,model},()=>process.disconnect());
 }catch{process.send({ok:false,code:'home_projection_failed'},()=>process.disconnect())}
});
