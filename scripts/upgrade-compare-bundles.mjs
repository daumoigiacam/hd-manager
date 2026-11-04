import fs from'node:fs/promises';import path from'node:path';import crypto from'node:crypto';import{gzipSync}from'node:zlib';import{parse}from'@babel/parser';
const candidate=process.argv[2]||'after-code-split';if(!/^after-[a-z0-9-]+$/.test(candidate))throw Error('Invalid candidate');
const root='test-results/performance-upgrade-20261103',rows=[];
for(const[kind,build]of Object.entries({before:'test-results/phase2-verification-20261102',after:`${root}/${candidate}`})){
 const publicDir=path.resolve(build,'capacitor-project/app/src/main/assets/public'),identity=JSON.parse(await fs.readFile(`${build}/capacitor-build-identity.json`,'utf8')),html=await fs.readFile(path.join(publicDir,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map(m=>m[1]),pending=[...scripts],seen=new Set(),initial=[];
 while(pending.length){const file=path.posix.normalize(pending.shift()).replace(/^\.\//,'');if(seen.has(file))continue;seen.add(file);if(file.startsWith('../')||path.isAbsolute(file))throw Error('Unexpected emitted path');
  const bytes=await fs.readFile(path.join(publicDir,file));initial.push({file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length});for(const imp of parse(bytes.toString('utf8'),{sourceType:'module'}).program.body){const name=['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(imp.type)?imp.source?.value:null;if(name?.startsWith('.')&&name.endsWith('.js'))pending.push(path.posix.join(path.posix.dirname(file),name))}
 }
 const all=[];for(const record of identity.files.filter(f=>f.file.endsWith('.js'))){const bytes=await fs.readFile(path.join(publicDir,record.file));all.push({file:record.file,bytes:bytes.length,gzipBytes:gzipSync(bytes).length})}
 const apkFile=`${build}/capacitor-project/app/build/outputs/apk/release/app-release.apk`;let apk;
 try{const b=await fs.readFile(apkFile);apk={file:apkFile,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}}catch(error){if(error.code!=='ENOENT')throw error;apk={status:'NOT_BUILT_YET'}}
 const sum=(files,field)=>files.reduce((sum,file)=>sum+file[field],0);
 rows.push({kind,build,at:identity.at,initialStaticJsBytes:sum(initial,'bytes'),initialStaticJsGzipBytes:sum(initial,'gzipBytes'),allJsBytes:sum(all,'bytes'),allJsGzipBytes:sum(all,'gzipBytes'),initial,apk,largest:all.sort((a,b)=>b.bytes-a.bytes).slice(0,10)});
}
const report={at:new Date().toISOString(),candidate,conditions:'Exact generated local SDK/demo builds. Initial JS follows real static imports from emitted HTML script, excluding dynamic imports/worker payloads. Gzip is offline size, not observed HTTP compression or runtime CPU. Source maps stay outside APK.',rows};await fs.writeFile(`${root}/bundle-comparison-${candidate}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(rows.map(({initial,...rest})=>rest)));
