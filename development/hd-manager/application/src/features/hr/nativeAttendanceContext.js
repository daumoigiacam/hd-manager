// Inject ORIGINAL exports from services/identityCenter.js and the App's original
// buildVerifiedAttendanceMethodPayload. Module/factory creation performs no API,
// Native, storage, enrollment or network operation. This is not a trust issuer.
export function createNativeAttendanceContext({identityApi,isNative,isCurrent,getCurrentIdentity,getIdToken,captureMethod}){
  for(const name of ['getIdentityDevice','getIdentityAccountScope','getBiometricAutoLoginProfile','readTrustedDeviceSecret']){
    if(typeof identityApi?.[name]!=='function')throw Error('Original identity API required: '+name);
  }
  if([isNative,isCurrent,getCurrentIdentity,getIdToken,captureMethod].some(fn=>typeof fn!=='function'))throw Error('Original Native/session/method providers required');
  return async function captureAttendanceContext(command){
    if(!isNative()||!isCurrent())throw Error('Cần phiên Native hiện tại để xác thực chấm công.');
    const identity=getCurrentIdentity(),scope=identityApi.getIdentityAccountScope(identity);
    if(!identity||!scope||identity.id!==command?.payload?.employeeId)throw Error('Nhân sự chấm công không khớp phiên.');
    const check=()=>{
      const current=getCurrentIdentity();
      if(!isCurrent()||current?.id!==identity.id||current?.companyId!==identity.companyId
        ||identityApi.getIdentityAccountScope(current)!==scope)throw Error('Tài khoản đã thay đổi trong khi xác thực chấm công.');
    };
    const device=identityApi.getIdentityDevice();
    if(device?.deviceId!==command.payload.deviceId)throw Error('Mã thiết bị của lệnh khác thiết bị Identity Center đã đăng ký.');
    const profile=identityApi.getBiometricAutoLoginProfile({manual:true});
    // Same scope, biometric condition and reason as identityRecordAttendance.
    // There is intentionally no unscoped, password/PIN or web-storage fallback.
    const deviceSecret=await identityApi.readTrustedDeviceSecret({deviceId:device.deviceId,accountScope:scope,
      requireBiometric:profile?.accountScope===scope,reason:'Xác nhận chấm công'});
    check();
    if(!deviceSecret)throw Object.assign(Error('Chưa có credential thiết bị cho tài khoản này. Đăng nhập Identity Center và đăng ký thiết bị bằng luồng gốc.'),{code:'attendance-device-not-enrolled'});
    // Capture anew for each ACTUAL submission; never command.payload.method.
    const captured=await captureMethod({kind:command.kind,workRole:command.payload.workRole});check();
    let method;
    if(captured?.type==='wifi'&&typeof captured.ssid==='string'&&typeof captured.bssid==='string'){
      method={type:'wifi',ssid:captured.ssid,bssid:captured.bssid};
    }else if(captured?.type==='gps'&&Number.isFinite(captured.latitude)&&Number.isFinite(captured.longitude)){
      method={type:'gps',latitude:captured.latitude,longitude:captured.longitude,
        ...(Number.isFinite(captured.accuracy)?{accuracy:captured.accuracy}:{})};
    }else throw Error('Bộ chấm công gốc chưa thu được WiFi/GPS hiện tại.');
    const idToken=await getIdToken();check();
    if(typeof idToken!=='string'||!idToken)throw Error('Chưa có ID token Identity Center hiện tại.');
    // Transient HTTP-only data. Caller must NOT persist, log, cache, serialize
    // into local_commands, or attach this object to the saved command payload.
    return {authorization:'Bearer '+idToken,device:{...device},deviceSecret,method};
  };
}
