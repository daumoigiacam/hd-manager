import path from 'node:path';import {createHash} from 'node:crypto';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {build} from 'esbuild';
import {extractEmployeeHomeScreenModel} from './employee-home-model-extraction.mjs';
import {buildEmployeeHomeProjector,EMPLOYEE_HOME_PROJECTOR_ROOTS as roots} from './employee-home-projector-build.mjs';
import {instrumentEmployeeHomeSpreads,collectEmployeeHomeCandidateFields} from './employee-home-field-instrumentation.mjs';
export async function buildProjectedEmployeeHomeProjector(output){
 const baseline=await buildEmployeeHomeProjector(path.join(output,'full-reference'));
 // These containers are candidate omissions, not an assumption about maths:
 // any real access to one is caught by the propagated runtime guard.
 const omit=new Set(['items','lines','primaryItem','productDetails','customer','product','products','images','image','photo','attachments','avatar','logo','productSettings','productConfigs','productPreferences','productOverrides']);
 const fields=collectEmployeeHomeCandidateFields(await readFile(baseline.modulePath,'utf8')).filter(name=>!/^__.*__$/.test(name)&&!omit.has(name));
 const fieldsByCollection=Object.fromEntries(['customers','orders','payments'].map(name=>[name,fields]));
 const fieldProjection={version:1,schemaId:createHash('sha256').update(JSON.stringify(fieldsByCollection)).digest('hex'),fieldsByCollection};
 const source=await readFile('src/App.jsx','utf8'),extracted=extractEmployeeHomeScreenModel(source,path.resolve('src'),roots);
 const guardFile=path.resolve('src/services/employeeHomeFieldProjection.js'),guardImport=guardFile.replaceAll('\\','/');let instrumentedSpreads=0;
 const instrument=code=>{const result=instrumentEmployeeHomeSpreads(code,{guardImport});instrumentedSpreads+=result.spreads;return result.code};
 const contents=instrument(extracted.code+`
 import {buildEmployeeHomeScreenDto,validateEmployeeHomeScreenDto} from './services/employeeHomeScreenDto.js';
 import {buildEmployeeHomeSnapshotInput} from './services/employeeHomeSnapshotInput.js';
 import {createEmployeeHomeFieldProjection} from './services/employeeHomeFieldProjection.js';
 export const employeeHomeFieldProjection=${JSON.stringify(fieldProjection)};
 export function projectEmployeeHomeSnapshot(scope,snapshot){
  if(JSON.stringify(snapshot.fieldProjection)!==JSON.stringify(employeeHomeFieldProjection))throw new TypeError('Unverified Home field projection.');
  const context=createEmployeeHomeFieldProjection(employeeHomeFieldProjection.fieldsByCollection);
  try{
   const helpers={${roots.join(',')},projectSourceRecord:(name,row)=>Object.hasOwn(employeeHomeFieldProjection.fieldsByCollection,name)?context.source(name,row):row};
   const input=buildEmployeeHomeSnapshotInput(snapshot,scope,helpers);
   const model=buildEmployeeHomeScreenDto(buildEmployeeHomeScreenModel(input),input,helpers);
   context.assertVerified();return model;
  }finally{context.close()}
 }
 export {validateEmployeeHomeScreenDto};`);
 const bundled=await build({stdin:{contents,resolveDir:path.resolve('src')},plugins:[{name:'guard-financial-object-spreads',setup(b){
  b.onLoad({filter:/\.js$/},async args=>{
   if(path.resolve(args.path)===guardFile)return null;
   return {contents:instrument(await readFile(args.path,'utf8')),loader:'js',resolveDir:path.dirname(args.path)};
  });
 }}],bundle:true,write:false,platform:'node',format:'cjs',target:'node22',metafile:true});
 const inputs=Object.keys(bundled.metafile.inputs);
 if(inputs.some(n=>/firebase|react|capacitor|html2canvas|jspdf|html-to-image|tesseract/i.test(n)))throw Error('Unapproved projected Home calculation dependency.');
 const code=bundled.outputFiles[0].text,domainVersion=createHash('sha256').update(code).digest('hex');await mkdir(output,{recursive:true});
 const modulePath=path.resolve(output,'employee-home-projector.cjs');await writeFile(modulePath,code);
 const manifest={at:new Date().toISOString(),fileName:'employee-home-projector.cjs',modulePath,domainVersion,
  sourceSha256:createHash('sha256').update(source).digest('hex'),fieldProjection,instrumentedSpreads,inputs,
  baselineDomainVersion:baseline.domainVersion,baselineModulePath:baseline.modulePath,
  scope:'LOCAL ONLY. Guarded server field-projection candidate; original math, no raw customer HTTP response, source writes, deployment, timing guarantee or general acceptance.'};
 await writeFile(path.resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
