// Unit fixture convenience only. Scope always comes from the REAL adapter's
// signed grant. Preserve the first command owner when replaying with token B.
function bindTestEnvelopes(api){
 const raw=api.handle.bind(api),owners=new Map();
 async function handle(request){
  if(request.action!=='sync'||request.body?.scope)return raw(request);
  const grant=await raw({action:'grant',token:request.token,body:{deviceId:'unit-envelope-device'}}),key=request.body?.command?.commandId,previous=owners.get(key);
  const scope=!previous||previous.principalId===grant.scope.principalId?grant.scope:previous;owners.set(key,scope);
  return raw({...request,body:{...request.body,scope}});
 }
 return {handle,raw};
}
module.exports={bindTestEnvelopes};
