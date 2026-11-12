import {assertMessagingEnvironment,messagingError} from './offlineMessagingContract.js';
// The same authenticated service and owner; no Firebase SDK/listener/FCM client.
export function createOfflineMessagingTransport({projectId,origin,getIdToken,fetch=globalThis.fetch}){
  const base=assertMessagingEnvironment(projectId,origin);
  async function call(action,body,signal,scope){
    const token=await getIdToken({principalId:scope.principalId});
    if(!token)throw messagingError('unauthenticated','Messaging authentication unavailable');
    const response=await fetch(new URL(action,base),{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({...body,scope}),signal});
    if(!response.ok)throw messagingError(response.status===403?'permission-denied':response.status===401?'unauthenticated':response.status===503?'unavailable':'invalid-argument','Development messaging request rejected');
    return response.json();
  }
  return Object.freeze({page:(body,signal,scope)=>call('messaging-page',body,signal,scope),delta:(body,signal,scope)=>call('messaging-delta',body,signal,scope)});
}
