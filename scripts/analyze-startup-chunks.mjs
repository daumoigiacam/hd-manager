import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
const [directory,output,assertion]=process.argv.slice(2);if(!directory||!output||assertion&&assertion!=='--assert-lazy')throw Error('Use: public-directory output.json [--assert-lazy]');
const root=path.resolve(directory),html=await readFile(path.join(root,'index.html'),'utf8');
const entry=html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/);if(!entry)throw Error('Build entry unavailable');
const queue=[entry[1]],seen=new Set(),assets=[],sources=new Set();
while(queue.length){
 const relative=queue.shift().replace(/^\.\//,'');if(seen.has(relative))continue;seen.add(relative);
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!relative.endsWith('.js'))throw Error('Invalid emitted static import');
 const code=await readFile(file,'utf8'),map=JSON.parse(await readFile(file+'.map','utf8'));
 assets.push({file:relative,bytes:Buffer.byteLength(code),sha256:createHash('sha256').update(code).digest('hex')});
 map.sources.forEach(s=>sources.add(s.replaceAll('\\','/')));
 const imports=parse(code,{sourceType:'module'}).program.body.filter(node=>['ImportDeclaration','ExportAllDeclaration','ExportNamedDeclaration'].includes(node.type)&&node.source);
 for(const specifier of imports){const name=specifier.source.value;if(!name||!name.startsWith('.'))throw Error('Unexpected external static import');
  queue.push(path.relative(root,path.resolve(path.dirname(file),name)).replaceAll('\\','/'))}
}
const lazyOnlyPackages=Array.from(sources).filter(s=>/\/node_modules\/(html2canvas|canvg|jspdf|html-to-image|tesseract\.js(?:-core)?|read-excel-file)\//.test(s));
const result={at:new Date(),entry:entry[1],staticAssetCount:assets.length,staticJavaScriptBytes:assets.reduce((s,r)=>s+r.bytes,0),
 assets,lazyOnlyPackagesInStartup:lazyOnlyPackages,
 scope:'Emitted static ESM import graph and matching source-map module names only. Dynamic chunks remain available. Byte counts are uncompressed code, not network timings, execution time or a user performance acceptance result.'};
await writeFile(output,JSON.stringify(result,null,2));
console.log(JSON.stringify({staticAssetCount:result.staticAssetCount,staticJavaScriptBytes:result.staticJavaScriptBytes,lazyOnlyPackagesInStartup:lazyOnlyPackages.length}));
if(assertion&&lazyOnlyPackages.length)throw Error('Lazy-only feature dependencies remain in startup graph');
