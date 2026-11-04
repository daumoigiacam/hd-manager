// Conservative upper bounds for V8 serialization budgets, NOT heap/wire sizes.
// Count the private codec's complete representation without constructing a
// throwaway encoded tree and Buffer for each source record. Near the limit,
// compact to exact sizes before rejecting. No estimate can hide an overflow.
const {Timestamp,GeoPoint}=require('firebase-admin/firestore');
const {serialize}=require('node:v8');
const {encodeEmployeeHomePrivateValue}=require('./employeeHomePrivateValues');
const invalid=()=>{throw Object.assign(new TypeError('Unsupported bounded Home value.'),{code:'unsupported_home_value',statusCode:503})};
function measureHomePrivateByteUpperBound(input,{limit=32*1024*1024}={}){
 if(!Number.isSafeInteger(limit)||limit<0||limit>32*1024*1024)throw new TypeError('Finite private Home byte budget required.');
 const code='home_snapshot_byte_limit';let bytes=128;const ancestors=new Set();
 const add=n=>{bytes+=n;if(bytes>limit)throw Object.assign(new Error(code),{code,statusCode:503})};
 //V8 one/two-byte strings need at most2 bytes per UTF16 code unit plus
 //tag/uint32 length/alignment (8 bytes). Dense indices are also overcounted.
 const stringBytes=value=>2*value.length+8;
 const visit=(value,depth,pathBytes)=>{
  if(depth>64)invalid();
  if(value===null||value===undefined||typeof value==='boolean'){add(1);return}
  if(typeof value==='number'){add(10);return}
  if(typeof value==='string'){add(stringBytes(value));return}
  if(value instanceof Timestamp||value instanceof GeoPoint){
   // Null placeholder plus a full {path,type,data} special entry with two
   // numbers. The160 fixed bytes cover object/array/key/tag overhead.
   add(160+pathBytes);return;
  }
  if(Buffer.isBuffer(value)){
   // Private codec uses base64 in a special entry.
   add(160+pathBytes+2*(4*Math.ceil(value.byteLength/3))+8);return;
  }
  if(value instanceof Date&&Object.getPrototypeOf(value)===Date.prototype&&Reflect.ownKeys(value).length===0){add(32);return}
  if(typeof value!=='object'||ancestors.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
  ancestors.add(value);add(Array.isArray(value)?17+value.length:8);
  for(const key of Object.keys(value)){const keyBytes=stringBytes(key);add(keyBytes);visit(value[key],depth+1,pathBytes+keyBytes)}
  ancestors.delete(value);
 };
 add(0);visit(input,0,32);return bytes;
}
// Retain only references to records already held by the complete snapshot.
// If conservative accounting would reject it, compact to the ORIGINAL exact
// codec sizes before rejecting. Never discard a row because an estimate is high.
function createHomePrivateByteBudget(limit){
 if(!Number.isSafeInteger(limit)||limit<1||limit>24*1024*1024)throw new TypeError('Finite private Home limit required.');
 const records=[];let bytes=0,compactions=0,count=0,exactMode=false;
 return {admit(data){
  // After the first compaction, measure only each NEW record exactly. Repeated
  // full recounts near the boundary would turn a large input into quadratic work.
  if(exactMode){const size=serialize(encodeEmployeeHomePrivateValue(data)).byteLength;
   if(bytes+size>limit)throw Object.assign(new Error('home_snapshot_byte_limit'),{code:'home_snapshot_byte_limit',statusCode:503});
   bytes+=size;count++;return;
  }
  let upper;
  try{upper=measureHomePrivateByteUpperBound(data)}
  catch(error){if(error.code!=='home_snapshot_byte_limit')throw error;upper=Infinity}
  if(bytes+upper<=limit){bytes+=upper;records.push(data);count++;return}
  let exact=serialize(encodeEmployeeHomePrivateValue(data)).byteLength;
  for(const record of records){if(exact>limit)break;exact+=serialize(encodeEmployeeHomePrivateValue(record)).byteLength}
  if(exact>limit)throw Object.assign(new Error('home_snapshot_byte_limit'),{code:'home_snapshot_byte_limit',statusCode:503});
  bytes=exact;compactions++;exactMode=true;records.length=0;count++;
 },stats:()=>({records:count,accountedBytes:bytes,compactions,exactMode})};
}
module.exports={measureHomePrivateByteUpperBound,createHomePrivateByteBudget};
