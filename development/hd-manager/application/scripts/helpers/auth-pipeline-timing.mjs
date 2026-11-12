// Synthetic diagnostic only. Never retain URL queries, credentials, tokens,
// random bytes, response values or input elements.
export function armAuthPipelineTiming(){
 const scope=window,originalFetch=scope.fetch,random=scope.crypto&&scope.crypto.getRandomValues;
 const randomDescriptor=scope.crypto&&Object.getOwnPropertyDescriptor(scope.crypto,'getRandomValues');
 const state=scope.__upgradeAuthPipeline={startedAt:performance.now(),fetches:[],random:[],dropped:0};
 const classify=value=>{try{var u=new URL(typeof value==='string'?value:value.url);if(u.hostname==='127.0.0.1'&&u.port==='5002'&&/\/identityLogin$/.test(u.pathname))return'identity';if((u.hostname==='127.0.0.1'&&u.port==='9199'||u.hostname==='identitytoolkit.googleapis.com')&&/\/accounts:signInWithCustomToken$/.test(u.pathname))return'custom-token'}catch{}return null};
 scope.fetch=function(input,options){
  const route=classify(input);if(!route)return originalFetch.apply(this,arguments);
  if(state.fetches.length>=16){state.dropped++;return originalFetch.apply(this,arguments)}
  const row={route,enteredAt:performance.now()};state.fetches.push(row);
  let operation;try{operation=originalFetch.apply(this,arguments)}catch(error){row.threwAt=performance.now();throw error}
  return Promise.resolve(operation).then(response=>{
   row.responseAt=performance.now();row.status=response.status;
   const json=response.json;
   response.json=function(){row.jsonStartedAt=performance.now();return json.apply(this,arguments).then(value=>{row.jsonCompletedAt=performance.now();return value},error=>{row.jsonFailedAt=performance.now();throw error})};
   return response;
  },error=>{row.failedAt=performance.now();throw error});
 };
 if(typeof random==='function')scope.crypto.getRandomValues=function(value){const start=performance.now();try{return random.apply(this,arguments)}finally{if(state.random.length<64)state.random.push({at:start,durationMs:performance.now()-start,bytes:value&&value.byteLength});else state.dropped++}};
 scope.__upgradeAuthPipelineRestore=function(){scope.fetch=originalFetch;if(scope.crypto&&random){if(randomDescriptor)Object.defineProperty(scope.crypto,'getRandomValues',randomDescriptor);else delete scope.crypto.getRandomValues}delete scope.__upgradeAuthPipelineRestore};
}
