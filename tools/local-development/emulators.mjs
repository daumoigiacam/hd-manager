import fs from'node:fs/promises';import path from'node:path';import os from'node:os';import{createHash}from'node:crypto';import{spawn}from'node:child_process';import{createRequire}from'node:module';import{workspace,localEnvironment}from'./environment.mjs';
import {buildLocalFirestoreRules} from './local-firestore-rules.mjs';
// Firestore's Windows Java launcher corrupts a non-ASCII --rules argument.
// Preserve repository/Production Rules. Generate the Local finance guard only
// in the owned ASCII runtime copy consumed by this isolated Emulator.
const c=await localEnvironment(),state=path.join(workspace,'.local-dev/runtime'),dir=path.join(os.tmpdir(),'hdmanager-local-'+createHash('sha256').update(workspace).digest('hex').slice(0,12)),require=createRequire(import.meta.url);await fs.mkdir(dir,{recursive:true});await fs.mkdir(state,{recursive:true});const originalRules=await fs.readFile(path.join(workspace,'firestore.rules'),'utf8');await fs.writeFile(path.join(dir,'firestore.rules'),buildLocalFirestoreRules(originalRules,c));
await fs.writeFile(path.join(state,'firebase-runtime-location.json'),JSON.stringify({directory:dir,projectId:c.projectId},null,2));
const config={firestore:{rules:'firestore.rules'},emulators:{auth:{host:c.auth.host,port:c.auth.port},firestore:{host:c.firestore.host,port:c.firestore.port},hub:{host:'127.0.0.1',port:4415},logging:{host:'127.0.0.1',port:4515},ui:{enabled:false},singleProjectMode:true}};
const file=path.join(dir,'firebase.json');await fs.writeFile(file,JSON.stringify(config,null,2));
let previous=null,checkpoint;
try{checkpoint=JSON.parse(await fs.readFile(path.join(state,'firebase-export-checkpoint.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(checkpoint){
 if(checkpoint.projectId!==c.projectId||!path.resolve(checkpoint.directory).startsWith(path.join(dir,'exports')+path.sep)||!path.resolve(checkpoint.durableDirectory).startsWith(path.join(workspace,'.local-dev/exports')+path.sep))throw Error('Invalid emulator checkpoint ownership');
 // A missing/corrupt checkpoint MUST fail closed, never silently start empty.
 for(const file of checkpoint.files){const resolved=path.resolve(checkpoint.durableDirectory,file.path);if(!resolved.startsWith(path.resolve(checkpoint.durableDirectory)+path.sep)||createHash('sha256').update(await fs.readFile(resolved)).digest('hex')!==file.sha256)throw Error('Local emulator checkpoint integrity failure');}
 previous=checkpoint.directory;
 try{await fs.access(path.join(previous,'firebase-export-metadata.json'));}catch(error){if(error.code!=='ENOENT')throw error;await fs.mkdir(path.dirname(previous),{recursive:true});await fs.cp(checkpoint.durableDirectory,previous,{recursive:true,errorOnExist:true,force:false});}
 for(const file of checkpoint.files)if(createHash('sha256').update(await fs.readFile(path.resolve(previous,file.path))).digest('hex')!==file.sha256)throw Error('Native emulator import copy integrity failure');
}
const args=[require.resolve('firebase-tools/lib/bin/firebase'),'emulators:start','--only','auth,firestore','--config',file,'--project',c.projectId,...(previous?['--import',previous]:[])];
const child=spawn(process.execPath,args,{cwd:dir,stdio:'inherit',windowsHide:true,env:{...process.env,JAVA_HOME:process.env.JAVA_HOME||'C:/Program Files/Android/Android Studio/jbr',GCLOUD_PROJECT:c.projectId,GOOGLE_CLOUD_PROJECT:c.projectId,GOOGLE_APPLICATION_CREDENTIALS:'',FIREBASE_TOKEN:'',XDG_CONFIG_HOME:path.join(dir,'firebase-cli-config')}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>{process.exitCode=code||0;});
