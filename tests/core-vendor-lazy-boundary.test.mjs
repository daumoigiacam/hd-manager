import test from 'node:test';import assert from 'node:assert/strict';import {rollup} from 'rollup';
import {selectVendorChunk} from '../scripts/helpers/vendor-chunks.mjs';
const modules={
 '/fixture/entry.js':`import {render} from '/fixture/node_modules/react/index.js';import {shared} from '/fixture/node_modules/shared-helper/index.js';export const ready=render()+shared;export const exportPdf=()=>import('/fixture/node_modules/jspdf/index.js');export const ocr=()=>import('/fixture/node_modules/tesseract.js/index.js');`,
 '/fixture/node_modules/react/index.js':`export const render=()=>true;`,
 '/fixture/node_modules/jspdf/index.js':`import '/fixture/node_modules/html2canvas/index.js';import {shared} from '/fixture/node_modules/shared-helper/index.js';export const pdf=()=>shared;`,
 '/fixture/node_modules/shared-helper/index.js':`export const shared=globalThis.syntheticSharedHelper||1;`,
 '/fixture/node_modules/html2canvas/index.js':`import '/fixture/node_modules/css-line-break/index.js';globalThis.syntheticPdfInitialization=true;`,
 '/fixture/node_modules/css-line-break/index.js':`globalThis.syntheticPdfDependency=true;`,
 '/fixture/node_modules/tesseract.js/index.js':`import '/fixture/node_modules/synthetic-ocr-data/index.js';export const ocr=()=>true;`,
 '/fixture/node_modules/synthetic-ocr-data/index.js':`globalThis.syntheticOcrInitialization=true;`,
};
const startupModules=async(manualChunks,onlyExplicitManualChunks=false)=>{
 const bundle=await rollup({input:'/fixture/entry.js',plugins:[{name:'synthetic-import-graph',resolveId:id=>Object.hasOwn(modules,id)?id:null,load:id=>modules[id]}]});
 try{
  const {output}=await bundle.generate({format:'es',manualChunks,onlyExplicitManualChunks});
  const byName=new Map(output.filter(o=>o.type==='chunk').map(c=>[c.fileName,c]));
  const entry=output.find(c=>c.type==='chunk'&&c.isEntry),queue=[entry.fileName],seen=new Set(),sources=[];
  while(queue.length){const name=queue.shift();if(seen.has(name))continue;seen.add(name);const chunk=byName.get(name);assert(chunk);sources.push(...Object.keys(chunk.modules));queue.push(...chunk.imports)}
  return {sources,output,startupFiles:seen};
 }finally{await bundle.close()}
};
test('actual Rollup graph keeps lazy PDF/OCR transitive side effects out of initial React imports',async()=>{
 const legacy=await startupModules(id=>id.includes('/node_modules/jspdf/')?'vendor-export':id.includes('/node_modules/tesseract.js/')?'vendor-tools':id.includes('/node_modules/')?'vendor':undefined);
 assert(legacy.sources.some(s=>s.includes('/html2canvas/')),'fixture reproduces the original eager dependency bug');
 const hoisted=await startupModules(selectVendorChunk);
 assert(hoisted.sources.some(s=>s.includes('/jspdf/')),'shared helpers can pull a manually grouped lazy feature into startup too');
 const fixed=await startupModules(selectVendorChunk,true);
 for(const name of ['html2canvas','css-line-break','synthetic-ocr-data','jspdf','tesseract.js'])assert(!fixed.sources.some(s=>s.includes('/'+name+'/')),name+' must stay out of startup');
 assert(fixed.sources.some(s=>s.includes('/react/')));
 const all=fixed.output.filter(c=>c.type==='chunk').flatMap(c=>Object.keys(c.modules));
 for(const id of Object.keys(modules))assert(all.includes(id),'lazy features remain emitted: '+id);
 assert(fixed.output.some(c=>c.type==='chunk'&&fixed.startupFiles.has(c.fileName)&&c.dynamicImports.length>0));
});
test('Windows paths and unknown lazy dependencies keep the same graph policy',()=>{
 assert.equal(selectVendorChunk('D:\\fixture\\node_modules\\react-dom\\index.js'),'vendor-react');
 assert.equal(selectVendorChunk('/fixture/node_modules/html2canvas/index.js'),undefined);
 assert.equal(selectVendorChunk('/fixture/src/App.jsx'),undefined);
});
