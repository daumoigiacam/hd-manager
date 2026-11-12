// Request-scoped glue ONLY. No enrollment, flag/credential generation, verifier
// implementation, HTTP handler, grant change or database writes live here.
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
function createOfflineAttendanceTrustedContext({projectId,identityCenter,request}){
  if(!/^demo-[a-z0-9-]+$/.test(projectId||''))fail('permission-denied','Development identity context required');
  if(typeof identityCenter?.resolveAttendanceContext!=='function')fail('failed-precondition','Expose the original Identity Center attendance context first; no substitute verifier is permitted');
  if(typeof request?.authorization!=='string'||!request.authorization.trim()||!request.device?.deviceId
    ||typeof request.deviceSecret!=='string'||!request.deviceSecret||!['wifi','gps'].includes(request.method?.type)){
    fail('failed-precondition','Original enrolled device credential and fresh Native method required');
  }
  // Isolate concurrent HTTP requests; never capture a mutable service-global
  // "last device" or read credentials/method from immutable Outbox payloads.
  const input={authorization:request.authorization,device:{...request.device},deviceSecret:request.deviceSecret,method:{...request.method}};
  return async function getAttendanceContext(_tx,actor,command){
    if(command?.payload?.deviceId!==input.device.deviceId)fail('permission-denied','Enrolled device does not match attendance intent');
    const context=await identityCenter.resolveAttendanceContext(input);
    if(!context||context.principalId!==actor?.uid||context.companyId!==actor.tenantId
      ||context.employeeId!==command.payload.employeeId||context.device?.deviceId!==command.payload.deviceId
      ||typeof context.verifyDevice!=='function')fail('permission-denied','Original Identity Center context does not match the verified actor');
    // Return the EXACT original verifier reference. The command service passes
    // its transaction-reread identity into that function; no boolean trust stub.
    return context;
  };
}
module.exports={createOfflineAttendanceTrustedContext};
