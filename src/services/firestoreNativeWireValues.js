import {Timestamp,GeoPoint,Bytes,DocumentReference,VectorValue,vector,doc} from 'firebase/firestore';
const invalid=()=>{throw new TypeError('Invalid Firestore native wire value.')};
const plain=value=>{const p=Object.getPrototypeOf(value);return p===Object.prototype||p===null};

// Prototype-bearing SDK values are carried outside the ordinary data tree.
// User field names never serve as markers. Ordinary fields use structuredClone
// directly instead of allocating marker/pair arrays for every primitive field.
export function encodeFirestoreNativeValue(value,db){
  const specials=[],path=[];
  const child=(value,key,depth)=>{path.push(key);const result=visit(value,depth);path.pop();return result};
  const visit=(value,depth)=>{
    if(depth>64)throw new TypeError('Firestore worker value nesting exceeds the supported depth.');
    const type=typeof value;
    if(value===null||type==='undefined'||type==='string'||type==='number'||type==='boolean')return value;
    const special=(type,data)=>{specials.push({path:path.slice(),type,data});return null};
    if(value instanceof Timestamp)return special('timestamp',[value.seconds,value.nanoseconds]);
    if(value instanceof GeoPoint)return special('geo',[value.latitude,value.longitude]);
    if(value instanceof Bytes)return special('bytes',value.toBase64());
    if(value instanceof DocumentReference){
      if(value.firestore!==db||value.converter)throw new TypeError('Unsupported Firestore worker document reference.');
      return special('reference',value.path);
    }
    if(value instanceof VectorValue)return special('vector',value.toArray());
    if(value instanceof Date)return new Date(value.getTime());
    if(Array.isArray(value))return value.map((item,index)=>child(item,index,depth+1));
    if(type==='object'&&plain(value)){
      const result={};
      for(const key in value)if(Object.hasOwn(value,key)){
        const next=child(value[key],key,depth+1);
        if(key==='__proto__')Object.defineProperty(result,key,{value:next,writable:true,enumerable:true,configurable:true});
        else result[key]=next;
      }
      return result;
    }
    throw new TypeError('Unsupported Firestore worker value.');
  };
  return {kind:'hd-firestore-native-value-v1',value:visit(value,0),specials};
}

export function decodeFirestoreNativeValue(wire,db){
  if(!wire||wire.kind!=='hd-firestore-native-value-v1'||!Object.hasOwn(wire,'value')||!Array.isArray(wire.specials))return invalid();
  // Validate without cloning again. Messages already belong to the receiving
  // context. Unknown prototypes, functions, cycles and overdeep data fail closed.
  const ancestors=new Set();
  const validate=(value,depth)=>{
    if(depth>64)return invalid();
    const type=typeof value;
    if(value===null||type==='undefined'||type==='string'||type==='number'||type==='boolean')return;
    if(value instanceof Date)return;
    if(typeof value!=='object'||(!Array.isArray(value)&&!plain(value))||ancestors.has(value))return invalid();
    ancestors.add(value);
    for(const key of Object.keys(value))validate(value[key],depth+1);
    ancestors.delete(value);
  };
  validate(wire.value,0);
  let result=wire.value;
  const copies=new WeakMap(),seen=new Set();
  const copy=value=>{
    if(!value||typeof value!=='object'||value instanceof Date||(!Array.isArray(value)&&!plain(value)))return invalid();
    if(copies.has(value))return copies.get(value);
    const next=Array.isArray(value)?value.slice():{...value};copies.set(value,next);return next;
  };
  for(const entry of wire.specials){
    if(!entry||!Array.isArray(entry.path)||entry.path.length>64||typeof entry.type!=='string'
      || !entry.path.every(key=>typeof key==='string'||Number.isSafeInteger(key)&&key>=0))return invalid();
    const signature=JSON.stringify(entry.path);if(seen.has(signature))return invalid();seen.add(signature);
    let original=wire.value,output;
    if(entry.path.length)result=copy(wire.value);
    output=result;
    for(let index=0;index<entry.path.length;index++){
      const key=entry.path[index];
      if(!original||typeof original!=='object'||original instanceof Date
        || !(Array.isArray(original)?Number.isSafeInteger(key)&&key>=0&&key<original.length:typeof key==='string')
        || !Object.hasOwn(original,key))return invalid();
      if(index<entry.path.length-1){
        const child=original[key];
        if(!child||typeof child!=='object'||child instanceof Date)return invalid();
        const next=copy(child);Object.defineProperty(output,key,{value:next,writable:true,enumerable:true,configurable:true});
        original=child;output=next;
      }else original=original[key];
    }
    if(original!==null)return invalid();
    let value;
    if(entry.type==='timestamp'&&Array.isArray(entry.data)&&entry.data.length===2)value=new Timestamp(...entry.data);
    else if(entry.type==='geo'&&Array.isArray(entry.data)&&entry.data.length===2)value=new GeoPoint(...entry.data);
    else if(entry.type==='bytes'&&typeof entry.data==='string')value=Bytes.fromBase64String(entry.data);
    else if(entry.type==='reference'&&typeof entry.data==='string')value=doc(db,entry.data);
    else if(entry.type==='vector'&&Array.isArray(entry.data))value=vector(entry.data);
    else return invalid();
    if(entry.path.length)Object.defineProperty(output,entry.path.at(-1),{value,writable:true,enumerable:true,configurable:true});
    else result=value;
  }
  return result;
}
