// Browser storage protection is origin-bound WebCrypto, not an Android
// keystore. Never store a password or export the non-extractable AES key.
const DATABASE = 'hd-offline-vault-v1';
const request = value => new Promise((resolve,reject) => { value.onsuccess=()=>resolve(value.result);value.onerror=()=>reject(value.error); });
const finished = tx => new Promise((resolve,reject) => {tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Local persistence aborted'));tx.onerror=()=>{};});
export async function createWebEncryptedVault({indexedDB=globalThis.indexedDB,crypto=globalThis.crypto,locks=globalThis.navigator?.locks,onChange=()=>{}}={}) {
  if (!indexedDB || !crypto?.subtle || !locks?.request) throw Error('Trình duyệt chưa hỗ trợ lưu Offline an toàn và khóa dữ liệu giữa các tab.');
  const open=indexedDB.open(DATABASE,1);
  open.onupgradeneeded=()=>{const db=open.result;db.createObjectStore('keys');db.createObjectStore('records');};
  const db=await request(open);let closed=false;
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel(DATABASE):null;
  db.onversionchange=()=>{closed=true;channel?.close();db.close();};
  if(channel)channel.onmessage=event=>{if(typeof event.data?.key==='string')onChange(event.data.key);};
  const check=()=>{if(closed)throw Error('Offline browser storage closed');};
  const tx=(stores,mode)=>{check();return db.transaction(stores,mode,{durability:'strict'});};
  const key=await locks.request(DATABASE+':key',async()=>{
    let t=tx(['keys','records'],'readonly'),done=finished(t);
    const [saved,count]=await Promise.all([request(t.objectStore('keys').get('aes-v1')),request(t.objectStore('records').count())]);await done;
    if(saved){if(saved.type!=='secret'||saved.extractable||saved.algorithm?.name!=='AES-GCM')throw Error('Invalid browser encryption key');return saved;}
    if(count)throw Error('Missing encryption key for existing Offline records. Dữ liệu được giữ nguyên.');
    const created=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    t=tx(['keys'],'readwrite');done=finished(t);t.objectStore('keys').add(created,'aes-v1');await done;return created;
  });
  const aad=name=>new TextEncoder().encode(DATABASE+'\0'+name);
  const put=async(name,value)=>{
    check();const iv=crypto.getRandomValues(new Uint8Array(12));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(name)},key,value);
    const t=tx(['records'],'readwrite'),done=finished(t);t.objectStore('records').put({version:1,iv,ciphertext},name);await done;
    channel?.postMessage({key:name});
  };
  const get=async name=>{
    const t=tx(['records'],'readonly'),done=finished(t),row=await request(t.objectStore('records').get(name));await done;
    if(row===undefined)return null;
    if(row.version!==1||!(row.iv instanceof Uint8Array)||row.iv.length!==12||!(row.ciphertext instanceof ArrayBuffer))throw Error('Invalid encrypted Offline record');
    return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv,additionalData:aad(name)},key,row.ciphertext));
  };
  return Object.freeze({get,put,
    async readJSON(name){const b=await get(name);return b===null?null:JSON.parse(new TextDecoder().decode(b));},
    writeJSON:(name,value)=>put(name,new TextEncoder().encode(JSON.stringify(value))),
    exclusive:(name,work)=>locks.request(DATABASE+':record:'+name,work),
    close(){if(!closed){closed=true;channel?.close();db.close();}},
  });
}
