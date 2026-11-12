import fs from'node:fs/promises';import path from'node:path';import{randomBytes,generateKeyPairSync}from'node:crypto';import{workspace,localEnvironment}from'./environment.mjs';
const c=await localEnvironment(process.argv[2]||'local'),dir=path.join(workspace,'.local-dev/private');await fs.mkdir(dir,{recursive:true,mode:0o700});
let established=false;try{await fs.access(path.join(workspace,'.local-dev/runtime/api-state.json'));established=true;}catch(error){if(error.code!=='ENOENT')throw error;}
if(established)for(const file of ['postgres-password.txt','redis-password.txt','redis.conf','offline-grant-key.pem','qa-credentials.dpapi']){try{await fs.access(path.join(dir,file));}catch{throw Error('Established Local environment is missing '+file+'; restore the existing secret, do not generate a replacement');}}
async function secret(file,value){try{await fs.writeFile(path.join(dir,file),value,{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}
await secret('postgres-password.txt',randomBytes(32).toString('hex'));await secret('redis-password.txt',randomBytes(32).toString('hex'));
await secret('redis.conf','bind 0.0.0.0\nprotected-mode yes\nappendonly yes\nappendfsync everysec\nmaxmemory 128mb\nmaxmemory-policy noeviction\nrequirepass '+(await fs.readFile(path.join(dir,'redis-password.txt'),'utf8')).trim()+'\n');
// This is a Development grant issuer key, never an Android signing key.
try{await fs.access(path.join(dir,'offline-grant-key.pem'));}catch{const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});await secret('offline-grant-key.pem',privateKey.export({type:'pkcs8',format:'pem'}));}
await fs.mkdir(path.join(workspace,'.local-dev/runtime'),{recursive:true});
await fs.writeFile(path.join(workspace,'.local-dev/runtime/environment.json'),JSON.stringify(c,null,2));
console.log(JSON.stringify({status:'LOCAL_CONFIGURATION_PREPARED',environment:c.name,projectId:c.projectId,secretsPrinted:false,cloudResourcesCreated:false,productionChanged:false}));
