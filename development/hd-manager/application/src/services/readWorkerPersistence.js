// Cache namespace contains no credentials or record values. Partition SDK
// IndexedDB by authenticated principal AND tenant; Auth itself remains memory-only
// inside the worker. Only explicit remembered native sessions opt in at the caller.
const persistentCollections=new Set(['orders','orderRequests','payments','expenses','financials','attendance','performance',
  'warehouseImports','warehouseDispatches','deliveryReports']);
export const canPersistReadCollection=name=>persistentCollections.has(name);
export async function getReadWorkerCacheAppName(scope,{crypto=globalThis.crypto}={}) {
  const fields=['projectId','appId','uid','companyId'];
  const sourceName=scope?.sourceAppName||scope?.appName;
  if(!scope||fields.some(key=>typeof scope[key]!=='string'||!scope[key]||scope[key].length>512)
    ||scope.accountType!=='employee'||typeof sourceName!=='string'||!sourceName||sourceName.length>512)throw new TypeError('Invalid read cache scope.');
  const material=JSON.stringify(['hd-read-cache-v1',...fields.map(key=>scope[key]),scope.sourceAppName||scope.appName]);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(material));
  return 'hd-read-cache-v1-'+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

export async function clearReadWorkerPersistentCache(config,scope) {
  if(config?.projectId!==scope?.projectId||config?.apiKey!==scope?.apiKey)throw new TypeError('Invalid read cache project.');
  const name=await getReadWorkerCacheAppName(scope);
  const [{initializeApp,getApps,deleteApp},{initializeFirestore,clearIndexedDbPersistence}]=await Promise.all([
    import('firebase/app'),import('firebase/firestore'),
  ]);
  if(getApps().some(app=>app.name===name))throw new Error('Read cache is still active.');
  const app=initializeApp(config,name);
  try{
    // Never start a read, write, network connection or Firebase Auth instance.
    // The caller first terminates its worker, releasing that IDB connection.
    await clearIndexedDbPersistence(initializeFirestore(app,{}));
  }finally{await deleteApp(app)}
}
