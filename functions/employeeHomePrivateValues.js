// Private server-to-child transport, never an HTTP DTO. Unknown prototypes fail
// closed; do not approximate Firestore references/vectors or flatten user keys.
const {Timestamp,GeoPoint}=require('firebase-admin/firestore');
const invalid=()=>{throw Object.assign(new TypeError('Unsupported private Home value.'),{code:'unsupported_home_value',statusCode:503})};
function encodeEmployeeHomePrivateValue(input){
 const specials=[],ancestors=new Set(),path=[];
 const special=(type,data)=>{specials.push({path:path.slice(),type,data});return null};
 const visit=(value,depth)=>{
  if(depth>64)invalid();
  if(value===null||['undefined','string','number','boolean'].includes(typeof value))return value;
  if(value instanceof Timestamp)return special('timestamp',[value.seconds,value.nanoseconds]);
  if(value instanceof GeoPoint)return special('geo',[value.latitude,value.longitude]);
  if(Buffer.isBuffer(value))return special('bytes',value.toString('base64'));
  if(value instanceof Date&&Object.getPrototypeOf(value)===Date.prototype&&Reflect.ownKeys(value).length===0)return new Date(value.getTime());
  if(typeof value!=='object'||ancestors.has(value)||!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();
  ancestors.add(value);const output=Array.isArray(value)?new Array(value.length):Object.create(null);
  for(const key of Object.keys(value)){path.push(key);const next=visit(value[key],depth+1);path.pop();Object.defineProperty(output,key,{value:next,writable:true,enumerable:true,configurable:true})}
  ancestors.delete(value);return output;
 };
 return {kind:'hd-private-home-values-v1',value:visit(input,0),specials};
}
function decodeEmployeeHomePrivateValue(wire){
 if(!wire||wire.kind!=='hd-private-home-values-v1'||!Object.hasOwn(wire,'value')||!Array.isArray(wire.specials))invalid();
 let root=wire.value;const seen=new Set();
 for(const entry of wire.specials){
  if(!entry||!Array.isArray(entry.path)||entry.path.length>64||entry.path.some(k=>typeof k!=='string')||!Array.isArray(entry.data)&&typeof entry.data!=='string')invalid();
  const key=JSON.stringify(entry.path);if(seen.has(key))invalid();seen.add(key);
  let parent=null,value=root,last;
  for(const part of entry.path){if(!value||typeof value!=='object'||!Object.hasOwn(value,part))invalid();parent=value;last=part;value=value[part]}
  if(value!==null)invalid();
  let next;if(entry.type==='timestamp'&&entry.data.length===2)next=new Timestamp(...entry.data);
  else if(entry.type==='geo'&&entry.data.length===2)next=new GeoPoint(...entry.data);
  else if(entry.type==='bytes'&&typeof entry.data==='string')next=Buffer.from(entry.data,'base64');
  else invalid();
  if(parent)Object.defineProperty(parent,last,{value:next,writable:true,enumerable:true,configurable:true});else root=next;
 }
 return root;
}
module.exports={encodeEmployeeHomePrivateValue,decodeEmployeeHomePrivateValue};
