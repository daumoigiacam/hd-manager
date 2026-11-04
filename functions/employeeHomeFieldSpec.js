const {createHash}=require('node:crypto');
const invalid=()=>{throw new TypeError('Unverified Home field projection specification.')};
function validateEmployeeHomeFieldSpec(value){
 if(value===undefined||value===null)return null;
 if(!value||Object.keys(value).length!==3||value.version!==1||!Object.hasOwn(value,'schemaId')||!Object.hasOwn(value,'fieldsByCollection')
  ||typeof value.schemaId!=='string'||!/^[a-f0-9]{64}$/.test(value.schemaId)||!value.fieldsByCollection||Array.isArray(value.fieldsByCollection))invalid();
 const names=Object.keys(value.fieldsByCollection),copy={};
 if(names.length<1||names.length>3||names.some(n=>!['customers','orders','payments'].includes(n))||names.join()!==names.slice().sort().join())invalid();
 for(const name of names){const fields=value.fieldsByCollection[name];
  if(!Array.isArray(fields)||fields.length<3||fields.length>1024||new Set(fields).size!==fields.length||fields.join()!==fields.slice().sort().join()
   ||fields.some(key=>typeof key!=='string'||!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)||/^__.*__$/.test(key))||!['id','companyId','isArchived'].every(key=>fields.includes(key)))invalid();
  copy[name]=Object.freeze(fields.slice());
 }
 if(createHash('sha256').update(JSON.stringify(copy)).digest('hex')!==value.schemaId)invalid();
 return Object.freeze({version:1,schemaId:value.schemaId,fieldsByCollection:Object.freeze(copy)});
}
module.exports={validateEmployeeHomeFieldSpec};
