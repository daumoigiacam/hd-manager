// A narrowly scoped transport adapter, not an auth implementation. Firebase
// still validates tokens, owns persistence and publishes authenticated state.
export function createNativeAuthJsonFetch({fetchImpl,request,identityUrls=[],emulator=false,ResponseImpl=globalThis.Response}){
 const identities=new Set(identityUrls);
 const allowed=input=>{
  let url;try{url=new URL(input)}catch{return false}
  if(url.username||url.password||url.hash)return false;
  if(url.protocol==='https:')return identities.has(url.href)
   || url.origin==='https://identitytoolkit.googleapis.com'&&url.pathname==='/v1/accounts:signInWithCustomToken';
  return emulator&&url.protocol==='http:'&&url.hostname==='127.0.0.1'
   &&(identities.has(url.href)||url.port==='9199'&&url.pathname==='/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken');
 };
 return async function nativeAuthJsonFetch(input,init={}){
  const method=String(init.method||'GET').toUpperCase();
  if(typeof input!=='string'||!allowed(input)||!['POST','OPTIONS'].includes(method)
   ||init.body!=null&&typeof init.body!=='string'||init.credentials==='include'||typeof ResponseImpl!=='function')return fetchImpl(input,init);
  const headers=Object.fromEntries(new Headers(init.headers||{}).entries());
  if(method==='POST'&&!/^application\/json(?:;|$)/i.test(headers['content-type']||''))return fetchImpl(input,init);
  const signal=init.signal;
  const aborted=()=>Object.assign(new Error('Authentication request aborted.'),{name:'AbortError'});
  if(signal?.aborted)throw aborted();
  let removeAbort=()=>{};
  const abortPromise=signal&&new Promise((_,reject)=>{
   const onAbort=()=>reject(aborted());signal.addEventListener('abort',onAbort,{once:true});
   removeAbort=()=>signal.removeEventListener('abort',onAbort);
  });
  try{
   const operation=Promise.resolve().then(()=>{
    if(signal?.aborted)throw aborted();
    return request({url:input,method,headers,...(init.body!=null?{data:init.body}:{}),responseType:'json',connectTimeout:15000,readTimeout:30000,disableRedirects:true});
   });
   // Never replay a dispatched POST through fetch on failure: login can create
   // a server session, even when the client did not receive its response.
   const raw=await(abortPromise?Promise.race([operation,abortPromise]):operation);
   if(signal?.aborted)throw aborted();
   if(!raw||!Number.isInteger(raw.status)||raw.status<200||raw.status>599)throw new TypeError('Invalid native authentication response');
   const responseHeaders=new Headers();
   for(const [key,value]of Object.entries(raw.headers||{}))if(!/^(content-length|content-encoding|transfer-encoding)$/i.test(key))responseHeaders.set(key,String(value));
   const body=[204,205,304].includes(raw.status)?null:typeof raw.data==='string'?raw.data:JSON.stringify(raw.data??null);
   return new ResponseImpl(body,{status:raw.status,headers:responseHeaders});
  }finally{removeAbort()}
 };
}
