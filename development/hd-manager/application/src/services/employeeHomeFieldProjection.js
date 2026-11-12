// Private, LOCAL-ONLY calculation support. Missing projected fields must fail,
// including after object spreads or an exception caught by an inner helper.
const collections=['customers','orders','payments'];
const provenance=new WeakMap(),backings=new WeakMap(),markOwners=new Map(),contexts=new Set();
const empty=Object.freeze([]);
const failure=()=>Object.assign(new Error('unproven_home_field_projection'),{code:'unproven_home_field_projection'});
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
const metadata=value=>object(value)?provenance.get(value)||empty:empty;
function reject(origins){for(const context of contexts)context.violated=true;for(const origin of origins)origin.context.violated=true;throw failure()}
function check(origins){for(const origin of origins)if(origin.context.closed||origin.context.violated)reject(origins)}
const originFor=(origins,key)=>{for(const origin of origins)if(origin.mark===key)return origin};
function wrap(target,origins,mutable){
 const permitted=key=>{if(own(target,key))return true;for(const origin of origins)if(!origin.fields.has(key))return false;return true};
 const proxy=new Proxy(target,{
  get(record,key,receiver){check(origins);if(markOwners.has(key))return originFor(origins,key);if(!permitted(key))reject(origins);return Reflect.get(record,key,receiver)},
  has(record,key){check(origins);if(!permitted(key))reject(origins);return Reflect.has(record,key)},
  ownKeys(){return reject(origins)},
  getOwnPropertyDescriptor(record,key){check(origins);if(!permitted(key))reject(origins);return Reflect.getOwnPropertyDescriptor(record,key)},
  set(record,key,value){check(origins);if(!mutable)reject(origins);return Reflect.set(record,key,value,record)},
  defineProperty(record,key,descriptor){check(origins);if(!mutable)reject(origins);return Reflect.defineProperty(record,key,descriptor)},
  deleteProperty(record,key){check(origins);if(!mutable||!permitted(key))reject(origins);return Reflect.deleteProperty(record,key)},
  setPrototypeOf(){return reject(origins)},preventExtensions(){return reject(origins)},
 });
 provenance.set(proxy,origins);backings.set(proxy,target);return proxy;
}
export function createEmployeeHomeFieldProjection(fieldsByCollection){
 if(!fieldsByCollection||typeof fieldsByCollection!=='object'||Array.isArray(fieldsByCollection)||contexts.size>=4)throw failure();
 const allowed=new Map();
 for(const [name,fields]of Object.entries(fieldsByCollection)){
  if(!collections.includes(name)||!Array.isArray(fields)||fields.length<3||fields.length>1024||new Set(fields).size!==fields.length
   ||fields.some(key=>typeof key!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key))||!['companyId','isArchived','id'].every(key=>fields.includes(key)))throw failure();
  allowed.set(name,new Set(fields));
 }
 if(!allowed.size)throw failure();
 const context={violated:false,closed:false},origins=new Map();contexts.add(context);
 for(const [collection,fields]of allowed){const origin={context,collection,fields,mark:Symbol('private-home-projection')};origins.set(collection,origin);markOwners.set(origin.mark,origin)}
 const allOrigins=[...origins.values()];
 return {
  source(name,record){
   const origin=origins.get(name);check(allOrigins);
   if(!origin||!record||![Object.prototype,null].includes(Object.getPrototypeOf(record))||!Object.isExtensible(record)
    ||Reflect.ownKeys(record).some(key=>!origin.fields.has(key)))reject(allOrigins);
   return wrap(record,[origin],false);
  },
  assertVerified(){check(allOrigins)},
  close(){context.closed=true;contexts.delete(context);for(const origin of origins.values())markOwners.delete(origin.mark)},
 };
}
// Only build-time instrumented spread boundaries may enumerate a record.
// The marker is private, carries no business values and never enters HTTP/IPC.
export function employeeHomeSpreadSource(value){
 const origins=metadata(value);if(!origins.length)return value;check(origins);
 const target=backings.get(value);if(!target)reject(origins);
 const proxy=new Proxy(target,{
  ownKeys(){check(origins);return [...Reflect.ownKeys(target),...origins.map(origin=>origin.mark)]},
  get(_record,key){check(origins);return originFor(origins,key)||Reflect.get(value,key)},
  getOwnPropertyDescriptor(_record,key){check(origins);const origin=originFor(origins,key);return origin?{value:origin,enumerable:true,configurable:true,writable:true}:Reflect.getOwnPropertyDescriptor(value,key)},
  has(_record,key){return Reflect.has(value,key)},set(_record,key,next){return Reflect.set(value,key,next)},
  defineProperty(_record,key,descriptor){return Reflect.defineProperty(value,key,descriptor)},deleteProperty(_record,key){return Reflect.deleteProperty(value,key)},
  setPrototypeOf(){return reject(origins)},preventExtensions(){return reject(origins)},
 });
 provenance.set(proxy,origins);backings.set(proxy,target);return proxy;
}
export function employeeHomeSpreadResult(value){
 if(!object(value)||metadata(value).length)return value;
 const origins=[];
 for(const mark of Object.getOwnPropertySymbols(value)){
  const origin=markOwners.get(mark);if(!origin){if(typeof mark==='symbol'&&mark.description==='private-home-projection')reject([]);continue}
  if(Reflect.getOwnPropertyDescriptor(value,mark)?.value!==origin)throw failure();
  origins.push(origin);Reflect.deleteProperty(value,mark);
 }
 if(!origins.length)return value;check(origins);
 if(new Set(origins.map(origin=>origin.context)).size!==1)reject(origins);
 return wrap(value,origins,true);
}
