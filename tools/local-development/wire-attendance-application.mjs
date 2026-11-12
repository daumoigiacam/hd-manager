import fs from'node:fs/promises';import path from'node:path';import{workspace}from'./environment.mjs';
const root=path.join(workspace,'development/hd-manager/application/src');
const replace=(text,old,next)=>{if(text.split(old).length!==2)throw Error('Exact integration boundary missing/ambiguous: '+old.slice(0,75));return text.replace(old,next);};
let file=path.join(root,'data/bootstrapOfflineCustomer.js'),text=await fs.readFile(file,'utf8');
const owner=`  let attendancePromise,attendanceProviderPromise;
  const attendanceProviders=()=>attendanceProviderPromise||=(loadAttendanceProviders?loadAttendanceProviders():Promise.reject(Error('Chưa nối bộ xác thực thiết bị Native gốc'))).catch(error=>{attendanceProviderPromise=null;throw error;});
  const getAttendance=()=>{
   if(!session.isCurrent()||!appSession.currentUser.identityKey||!verifiedGrant.capabilities.some(c=>['attendance.check_in','attendance.check_out'].includes(c)))return Promise.reject(Error('Cần phiên Online với quyền tự chấm công có chữ ký'));
   if(!attendancePromise)attendancePromise=Promise.all([getBusinessDirectory(),attendanceProviders(),import('./offlineAttendanceRepository.js')]).then(async([,provider,{createOfflineAttendanceRepository}])=>{
    if(!session.isCurrent()||!provider.isNative())throw Error('Chấm công cần phiên Native hiện tại');
    const raw=await createOfflineAttendanceRepository({database,session,authorize:request=>request.kind==='home.read'?authorize(request):fullAuthorize(request),digest,uuid,employeeId:appSession.currentUser.id,deviceId:provider.getDeviceId(),projectId,development:true,captureMethod:provider.captureMethod});
    return Object.freeze({...raw,async request(input){const value=await raw.request(input);changed('attendance');sync.notifyConnectivity();return value;}});
   }).catch(error=>{attendancePromise=null;throw error;});return attendancePromise;
  };
`;
text=replace(text,"  if(hasCustomerRead&&verifiedGrant.capabilities.includes('customers.history.read'))",owner+"  if(hasCustomerRead&&verifiedGrant.capabilities.includes('customers.history.read'))");
text=replace(text,"onPhase('SYNCING');return await transport.send(command,options);","onPhase('SYNCING');if(['attendance.check_in','attendance.check_out'].includes(command.kind)){const provider=await attendanceProviders(),context=await provider.captureContext(command);if(!session.isCurrent())throw Error('Attendance owner closed');return await transport.send(command,{...options,attendanceContext:{device:context.device,deviceSecret:context.deviceSecret,method:context.method}});}return await transport.send(command,options);");
text=replace(text,"}else if(command.kind.startsWith('payroll.')){","}else if(['attendance.check_in','attendance.check_out'].includes(command.kind)){await(await getAttendance()).applyReceipt(...args);changed('attendance');}else if(command.kind.startsWith('payroll.')){");
text=replace(text,'payrollRepository:getPayroll,warehouse:','payrollRepository:getPayroll,attendanceRepository:getAttendance,warehouse:');
// State changes must notify the retained HR queue, not the customer directory.
text=text.replace("else if(command?.kind?.startsWith('payroll.'))changed('payroll');return command;","else if(command?.kind?.startsWith('payroll.'))changed('payroll');else if(command?.kind?.startsWith('attendance.'))changed('attendance');return command;");
text=text.replace("args[1]?.kind?.startsWith('payroll.')?'payroll':'customers'","args[1]?.kind?.startsWith('payroll.')?'payroll':args[1]?.kind?.startsWith('attendance.')?'attendance':'customers'");await fs.writeFile(file,text);
file=path.join(root,'data/offlineCustomerTransport.js');text=await fs.readFile(file,'utf8');text=replace(text,"send:(command,{signal,scope})=>call('sync',{command},signal,scope)","send:(command,{signal,scope,attendanceContext})=>call('sync',{command,...(attendanceContext?{attendanceContext}:{})},signal,scope)");await fs.writeFile(file,text);
file=path.join(root,'services/useNativeOfflineWorkspace.js');text=(await fs.readFile(file,'utf8')).replaceAll('\r\n','\n');const original=`getIdToken:async({principalId,forceRefresh})=>{
    await authClient();
    await auth.authStateReady();const user=auth.currentUser;if(!user||user.isAnonymous||(principalId&&user.uid!==principalId))throw Error('Account changed');
    const token=await user.getIdToken(forceRefresh);if(auth.currentUser!==user)throw Error('Account changed during refresh');return token;
   }`;
text=replace(text,original,'getIdToken:verifiedIdToken');text=replace(text,'  let bootstrap;',`  const verifiedIdToken=async({principalId,forceRefresh}={})=>{
   await authClient();await auth.authStateReady();const user=auth.currentUser;
   if(!user||user.isAnonymous||(principalId&&user.uid!==principalId))throw Error('Account changed');
   const token=await user.getIdToken(forceRefresh);if(auth.currentUser!==user)throw Error('Account changed during refresh');return token;
  };
  let attendanceProviders;
  const loadAttendanceProviders=()=>attendanceProviders||=import('../features/hr/nativeAttendanceProviders.js').then(({createNativeAttendanceProviders})=>createNativeAttendanceProviders({getRuntime:()=>current,getIdToken:verifiedIdToken})).catch(error=>{attendanceProviders=null;throw error;});
  let bootstrap;`);text=replace(text,'backgroundHomeSync:false,loadHomeSync:','backgroundHomeSync:false,loadAttendanceProviders,loadHomeSync:');await fs.writeFile(file,text);
console.log(JSON.stringify({status:'ATTENDANCE_WIRED_IN_EXISTING_APP_OWNER',productionChanged:false}));
