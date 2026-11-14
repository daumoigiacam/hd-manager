// Hosting glue for the SAME Firestore backend. No database, identity or signer
// is created here. Configuration and private key remain server-only inputs.
function createHostedOfflineApi({createBackend,configuration,db,auth,getSigningKey}){
 let pending=null,closed=false;
 const owner=()=>{
  if(closed)throw Error('Offline host closed');
  return pending||=(Promise.resolve().then(()=>createBackend({db,auth,configuration:configuration(),getSigningKey})).catch(error=>{pending=null;throw error;}));
 };
 const handler=async(req,res)=>{
  res.set('Cache-Control','no-store');
  try{
   const backend=await owner();
   if(['/.well-known/jwks.json','/api/offline/.well-known/jwks.json'].includes(req.path)){
    res.set('Vary','Origin');
    const origin=req.get('origin'),allowed=[backend.environment.appOrigin,'https://localhost'];
    if(origin&&!allowed.includes(origin))return res.status(403).json({code:'permission-denied'});
    if(origin)res.set('Access-Control-Allow-Origin',origin);
    if(req.method!=='GET')return res.status(405).json({code:'method-not-allowed'});
    // createBackend validates that this contains ONLY an RSA public JWK.
    return res.status(200).json({keys:[backend.environment.publicKey]});
   }
   return await backend.handler(req,res);
  }catch{
   // Never publish IAM, key, token, Firestore path or configuration exceptions.
   if(!res.headersSent)return res.status(503).json({code:'unavailable'});
  }
 };
 return Object.freeze({handler,async close(){closed=true;if(pending)await pending.then(b=>b.close()).catch(()=>{});}});
}
module.exports={createHostedOfflineApi};
