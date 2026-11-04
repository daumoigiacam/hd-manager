import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import os from 'node:os';
const project='demo-hdm-perf-verification',root=path.join(os.tmpdir(),'hdm-verification-emulators'),require=createRequire(import.meta.url);
await fs.mkdir(root,{recursive:true});await fs.copyFile('firestore.rules',`${root}/firestore.rules`);
await fs.writeFile(`${root}/firebase.json`,JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{firestore:{host:'127.0.0.1',port:8185},auth:{host:'127.0.0.1',port:9199},hub:{host:'127.0.0.1',port:4423},logging:{host:'127.0.0.1',port:4523},ui:{enabled:false},singleProjectMode:true}},null,2));
const service=path.resolve('scripts/verification-emulator-service.mjs');
await fs.writeFile(`${root}/run-service.mjs`,`import{pathToFileURL}from'node:url';process.chdir(${JSON.stringify(process.cwd())});await import(pathToFileURL(${JSON.stringify(service)}));`);
const child=spawn(process.execPath,[require.resolve('firebase-tools/lib/bin/firebase'),'emulators:exec','--only','auth,firestore','--project',project,'--config',`${root}/firebase.json`,`${JSON.stringify(process.execPath)} run-service.mjs`],{
 cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,FIREBASE_TOKEN:'',GOOGLE_APPLICATION_CREDENTIALS:'',GOOGLE_CLOUD_PROJECT:project,GCLOUD_PROJECT:project,XDG_CONFIG_HOME:`${root}/cli-config`},
});
child.on('exit',code=>process.exitCode=code??1);
