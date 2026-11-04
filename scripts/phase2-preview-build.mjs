import {build} from 'vite';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const diagnostic=process.argv.includes('--diagnostic');
const outDir=`test-results/phase2-performance-20261102/${diagnostic?'diagnostic':'preview'}`;
Object.assign(process.env,{VITE_DATA_MODE:'preview',VITE_ALLOW_PREVIEW_BUILD:'true',VITE_HD_BUILD_ID:'phase2-synthetic-only',
 VITE_PERFORMANCE_PROFILE:'false',VITE_PERFORMANCE_MONITOR:'false'});
await build({mode:'phase2-local',build:{outDir,emptyOutDir:false,sourcemap:diagnostic?'hidden':false},logLevel:'error'});
const files=[];async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
 const p=`${dir}/${entry.name}`;if(entry.isDirectory())await walk(p);else{const b=await fs.readFile(p);files.push({file:p.slice(outDir.length+1),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')})}}}
await walk(outDir);
await fs.writeFile(`test-results/phase2-performance-20261102/${diagnostic?'diagnostic':'preview'}-build.json`,JSON.stringify({at:new Date().toISOString(),mode:'SYNTHETIC_PREVIEW_NOT_PRODUCTION_BUNDLE',files,totalBytes:files.reduce((s,f)=>s+f.bytes,0)},null,2));
console.log(JSON.stringify({outDir,files:files.length,bytes:files.reduce((s,f)=>s+f.bytes,0)}));
