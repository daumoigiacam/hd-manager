import path from 'node:path';import {createHash} from 'node:crypto';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {build} from 'esbuild';
import {extractEmployeeHomeScreenModel} from './employee-home-model-extraction.mjs';
export const EMPLOYEE_HOME_PROJECTOR_ROOTS=['withSalesRevenueIndex','calculateMonthRevenue','isCashflowOfficial','resolveAttendanceAnomalyForDate',
 'parseLooseMoneyValue','getAssetDisplayLabel','getAssetStatusLabel','formatShiftRangeLabel','formatAttendanceMomentForWorkDate','getAttendanceCompactSource'];
const roots=EMPLOYEE_HOME_PROJECTOR_ROOTS;
export async function buildEmployeeHomeProjector(output){
 const source=await readFile('src/App.jsx','utf8'),extracted=extractEmployeeHomeScreenModel(source,path.resolve('src'),roots);
 const contents=extracted.code+`\nimport {buildEmployeeHomeScreenDto,validateEmployeeHomeScreenDto} from './services/employeeHomeScreenDto.js';
 import {buildEmployeeHomeSnapshotInput} from './services/employeeHomeSnapshotInput.js';
 export function projectEmployeeHomeSnapshot(scope,snapshot){
  const helpers={${roots.join(',')}};
  const input=buildEmployeeHomeSnapshotInput(snapshot,scope,helpers);
  return buildEmployeeHomeScreenDto(buildEmployeeHomeScreenModel(input),input,helpers);
 }
 export {validateEmployeeHomeScreenDto};`;
 const bundled=await build({stdin:{contents,resolveDir:path.resolve('src')},bundle:true,write:false,platform:'node',format:'cjs',target:'node22',metafile:true});
 const inputs=Object.keys(bundled.metafile.inputs);
 if(inputs.some(n=>/firebase|react|capacitor|html2canvas|jspdf|html-to-image|tesseract/i.test(n)))throw Error('Unapproved dependency entered the pure server Home projector.');
 const code=bundled.outputFiles[0].text,domainVersion=createHash('sha256').update(code).digest('hex');
 await mkdir(output,{recursive:true});const modulePath=path.resolve(output,'employee-home-projector.cjs');await writeFile(modulePath,code);
 const manifest={at:new Date(),domainVersion,sourceSha256:createHash('sha256').update(source).digest('hex'),fileName:'employee-home-projector.cjs',modulePath,inputs,
  scope:'Local private calculation artifact only; exact existing App formulas and an explicit display allowlist. No HTTP endpoint, trigger, source write, deployment or latency acceptance.'};
 await writeFile(path.resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
