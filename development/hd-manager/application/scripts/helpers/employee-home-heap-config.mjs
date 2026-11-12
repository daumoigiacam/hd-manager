export const qaHeapFunction='projects/hd-manager-c5839/locations/asia-southeast1/functions/employeeHomeBootstrapRegional';
export const qaHeapOptions='--max-old-space-size=364 --max-semi-space-size=16';
export function assertQaHeapService(fn){
 const s=fn?.serviceConfig;
 if(fn?.name!==qaHeapFunction||fn?.environment!=='GEN_2'||fn?.buildConfig?.runtime!=='nodejs22'||fn?.buildConfig?.entryPoint!=='employeeHomeBootstrapRegional'
  ||fn.state!=='ACTIVE'||!s||!['512M','512Mi'].includes(s.availableMemory)||String(s.availableCpu)!=='1'||(s.minInstanceCount??0)!==0||s.maxInstanceCount!==1||s.maxInstanceRequestConcurrency!==1)
  throw Error('QA function identity/resource guard failed.');
 if(!s.environmentVariables||typeof s.environmentVariables!=='object'||Array.isArray(s.environmentVariables))throw Error('Complete existing QA environment required.');
 return s;
}
export function prepareQaHeapPatch(fn,mode){
 const s=assertQaHeapService(fn),env=s.environmentVariables,has=Object.hasOwn(env,'NODE_OPTIONS');
 if(!['apply','rollback'].includes(mode))throw Error('Explicit QA heap mode required.');
 if(mode==='apply'&&has||mode==='rollback'&&env.NODE_OPTIONS!==qaHeapOptions)throw Error('Unexpected existing QA Node options; refusing to overwrite.');
 const next={...env};if(mode==='apply')next.NODE_OPTIONS=qaHeapOptions;else delete next.NODE_OPTIONS;
 return {name:qaHeapFunction,serviceConfig:{environmentVariables:next}};
}
export function verifyQaHeapPatch(before,after,mode){
 assertQaHeapService(before);assertQaHeapService(after);
 const without=value=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=='NODE_OPTIONS').sort(([a],[b])=>a.localeCompare(b)));
 if(JSON.stringify(without(before.serviceConfig.environmentVariables))!==JSON.stringify(without(after.serviceConfig.environmentVariables)))throw Error('Other QA environment changed.');
 if(mode==='apply'?after.serviceConfig.environmentVariables.NODE_OPTIONS!==qaHeapOptions:Object.hasOwn(after.serviceConfig.environmentVariables,'NODE_OPTIONS'))throw Error('QA Node option verification failed.');
 for(const key of ['availableMemory','availableCpu','minInstanceCount','maxInstanceCount','maxInstanceRequestConcurrency','timeoutSeconds','serviceAccountEmail','secretEnvironmentVariables','ingressSettings','vpcConnector','vpcConnectorEgressSettings'])
  if(JSON.stringify(before.serviceConfig[key])!==JSON.stringify(after.serviceConfig[key]))throw Error('Other QA resource/security setting changed.');
 return {verified:true,otherEnvironmentUnchanged:true,resourceAndSecuritySettingsUnchanged:true};
}
