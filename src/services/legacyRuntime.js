// Install before App dependencies execute. Build transpilation alone does not
// provide newer built-ins on Android WebView 74.
if (typeof Object.hasOwn !== 'function') {
  Object.defineProperty(Object, 'hasOwn', { configurable: true, writable: true,
    value(object, key) {
      if (object == null) throw new TypeError('Cannot convert null to object');
      return Object.prototype.hasOwnProperty.call(Object(object), key);
    } });
}
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', { configurable: true, writable: true,
    value(index) {
      if (this == null) throw new TypeError('Array.at requires a receiver');
      const object = Object(this);
      const length = Math.min(Math.max(Math.trunc(Number(object.length)) || 0, 0), Number.MAX_SAFE_INTEGER);
      const offset = Math.trunc(+index) || 0;
      const position = offset < 0 ? length + offset : offset;
      return position < 0 || position >= length ? undefined : object[position];
    } });
}
if (typeof Promise.allSettled !== 'function') {
  Object.defineProperty(Promise, 'allSettled', { configurable: true, writable: true,
    value(iterable) {
      const Constructor = this;
      return new Constructor((resolve, reject) => {
        try {
          const promiseResolve = Constructor.resolve.bind(Constructor);
          const outcomes = [];
          for (const value of iterable) outcomes.push(promiseResolve(value).then(
            value => ({ status: 'fulfilled', value }),
            reason => ({ status: 'rejected', reason }),
          ));
          Constructor.all(outcomes).then(resolve, reject);
        } catch (error) { reject(error); }
      });
    } });
}
// Older WebViews have secure random bytes but no UUID convenience API. Never
// generate business document identifiers using a time/Math.random fallback.
if (globalThis.isSecureContext !== false && globalThis.crypto
  && typeof globalThis.crypto.randomUUID !== 'function'
  && typeof globalThis.crypto.getRandomValues === 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, writable: true,
    value() {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0'));
      return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
    } });
}

// Blob promise readers arrived after WebView 74. Native file sharing and CSV
// import need their exact bytes/text, not a synchronous base64 workaround.
if(typeof Blob==='function'&&typeof FileReader==='function'){
 const readBlob=(blob,method)=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  const clear=()=>{reader.onload=null;reader.onerror=null;reader.onabort=null};
  reader.onload=()=>{const value=reader.result;clear();resolve(value)};
  reader.onerror=()=>{const error=reader.error||new Error('Blob read failed');clear();reject(error)};
  reader.onabort=()=>{clear();reject(Object.assign(new Error('Blob read aborted'),{name:'AbortError'}))};
  try{if(method==='readAsText')reader.readAsText(blob,'utf-8');else reader.readAsArrayBuffer(blob)}catch(error){clear();reject(error)}
 });
 if(typeof Blob.prototype.arrayBuffer!=='function')Object.defineProperty(Blob.prototype,'arrayBuffer',{configurable:true,writable:true,value(){return readBlob(this,'readAsArrayBuffer')}});
 if(typeof Blob.prototype.text!=='function')Object.defineProperty(Blob.prototype,'text',{configurable:true,writable:true,value(){return readBlob(this,'readAsText')}});
}
