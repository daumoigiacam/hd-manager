import {Capacitor} from '@capacitor/core';
import * as identityApi from '../../services/identityCenter.js';
import {createNativeAttendanceContext} from './nativeAttendanceContext.js';
import {requestPreciseAttendanceLocation} from './originalAttendanceLocation.js';

// Lazy, stateless adapter. SQLite, Auth and listeners remain owned by the App.
export function createNativeAttendanceProviders({getRuntime,getIdToken}){
 const native=()=>Capacitor.getPlatform()==='android';
 async function captureMethod(){
  if(!native())throw Error('Chấm công cần bộ thu vị trí Native gốc.');
  const position=await requestPreciseAttendanceLocation();
  return {type:'gps',latitude:Number(position.coords.latitude.toFixed(6)),longitude:Number(position.coords.longitude.toFixed(6)),accuracy:Math.round(position.coords.accuracy||0)};
 }
 return Object.freeze({isNative:native,getDeviceId:()=>identityApi.getIdentityDevice().deviceId,captureMethod,
  async registerDevice(){
   const owner=getRuntime();if(!native()||!owner?.isCurrent()||!owner.appSession.currentUser.identityKey)throw Error('Cần phiên Native Online đã xác minh.');
   const identity=owner.appSession.currentUser,idToken=await getIdToken({principalId:owner.scope.principalId});
   if(getRuntime()!==owner||!owner.isCurrent())throw Error('Tài khoản đã đổi trước khi đăng ký thiết bị.');
   const profile=identityApi.getBiometricAutoLoginProfile({manual:true});
   // Keep existing biometric protection. Otherwise use the same non-biometric
   // trusted-device enrollment as IdentitySecurityCenter.registerCurrentDevice.
   if(profile?.accountScope===identityApi.getIdentityAccountScope(identity))await identityApi.identitySetBiometric({idToken,enabled:true,identity});
   else await identityApi.identityCompleteSetup({idToken,trustDevice:true,biometricEnabled:false});
   if(getRuntime()!==owner||!owner.isCurrent())throw Error('Phiên đã đổi; credential vẫn được phân vùng tài khoản gốc.');
   return {trustedDeviceRegistered:true};
  },
  async captureContext(command){
   const owner=getRuntime();if(!owner?.isCurrent()||!owner.appSession.currentUser.identityKey)throw Error('Đăng nhập Online để nhận định danh thiết bị có chữ ký.');
   return createNativeAttendanceContext({identityApi,isNative:native,isCurrent:()=>getRuntime()===owner&&owner.isCurrent()&&Date.now()<owner.expiresAtMs,getCurrentIdentity:()=>owner.appSession.currentUser,getIdToken:()=>getIdToken({principalId:owner.scope.principalId}),captureMethod})(command);
  },
 });
}
