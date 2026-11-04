// Warm only a fixed nonexistent probe read and the Admin SDK credential channel.
// No identity lookup, rate-limit update, user token signing or business write.
// Awaited by the existing preflight warmup while a user enters credentials.
function createIdentityRuntimeWarmup({readProbe,getAccessToken,now=Date.now,ttlMs=300000,retryMs=30000}){
 if(typeof readProbe!=='function'||typeof getAccessToken!=='function'||!(ttlMs>0)||!(retryMs>0))throw new TypeError('Invalid identity warmup dependencies.');
 let promise=null,inFlight=false,expires=0;
 return ()=>{
  if(promise&&(inFlight||now()<expires))return promise;
  inFlight=true;expires=now()+ttlMs;
  promise=Promise.all([Promise.resolve().then(readProbe),Promise.resolve().then(getAccessToken)])
   .then(()=>true,()=>{expires=now()+retryMs;return false})
   .finally(()=>{inFlight=false});
  return promise;
 };
}
module.exports={createIdentityRuntimeWarmup};
