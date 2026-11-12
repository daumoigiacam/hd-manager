import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {workspace} from './environment.mjs';
export async function nativeSourceHash(){
 const files=[];
 async function walk(relative){for(const e of await fs.readdir(path.join(workspace,relative),{withFileTypes:true})){const file=path.posix.join(relative,e.name);if(e.isDirectory())await walk(file);else files.push(file);}}
 for(const directory of ['android/app/src/main/java','android/app/src/debug/java','android/app/src/main/res','android/app/src/debug/res'])await walk(directory);
 files.push('android/app/src/main/AndroidManifest.xml','android/app/build.gradle','android/variables.gradle','android/app/src/main/assets/capacitor.config.json','android/app/src/main/assets/capacitor.plugins.json');
 const hash=createHash('sha256');for(const file of files.sort())hash.update(file+'\0').update(await fs.readFile(path.join(workspace,file)));return hash.digest('hex');
}
