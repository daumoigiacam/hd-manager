// Express/Cloud Run/Functions compatible handler. Registration/deployment is
// deliberately separate. HTTPS configuration never falls back to localhost.
function createTrustedOfflineHttp({environment,api,nativeOrigins=[]}){
 const allowed=new Set([environment.appOrigin,...nativeOrigins]);
 if(nativeOrigins.some(x=>!['https://localhost','http://localhost','capacitor://localhost'].includes(x)))throw Error('Unexpected packaged Native origin');
 const actions=new Set(['grant','sync','page','detail','history','customer-delta','home-head','home-page','home-report','business-source','attendance-period','payroll-settlement','attendance-adjustment','warehouse-import-head','warehouse-import-page']);
 return async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('Content-Type','application/json');res.set('Vary','Origin');
  const origin=req.get('origin');if(origin&&!allowed.has(origin)){res.status(403).json({code:'permission-denied'});return;}
  if(origin)res.set('Access-Control-Allow-Origin',origin);res.set('Access-Control-Allow-Headers','authorization,content-type');res.set('Access-Control-Allow-Methods','POST,OPTIONS');
  if(req.method==='OPTIONS'){res.status(204).end();return;}
  if(req.method!=='POST'){res.status(405).json({code:'method-not-allowed'});return;}
  const action=req.path.split('/').filter(Boolean).at(-1);if(!actions.has(action)){res.status(404).json({code:'not-found'});return;}
  const auth=req.get('authorization')||'';if(!/^Bearer [^\s]+$/.test(auth)){res.status(401).json({code:'unauthenticated'});return;}
  if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>524288){res.status(413).json({code:'invalid-argument'});return;}
  try{res.status(200).json(await api.handle({action,token:auth.slice(7),body:req.body}));}
  catch(error){const code=String(error.code||'');const authentication=code.startsWith('auth/')||code==='unauthenticated',permission=code==='permission-denied',transient=['unavailable','deadline-exceeded','resource-exhausted'].includes(code);res.status(authentication?401:permission?403:transient?503:400).json({code:authentication?'unauthenticated':permission?'permission-denied':transient?'unavailable':code==='failed-precondition'?'failed-precondition':'invalid-argument'});}
 };
}
module.exports={createTrustedOfflineHttp};
