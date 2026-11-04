import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root='test-results/phase2-verification-20261102',started=performance.now();
while(performance.now()-started<6*60*60*1000){
 execFileSync(process.execPath,['scripts/verification-report.mjs'],{windowsHide:true,stdio:'ignore'});
 let result;try{result=JSON.parse(await fs.readFile(`${root}/sdk-soak-result.json`,'utf8'))}catch{/* not done */}
 if(result)break;
 let pipeline;try{pipeline=JSON.parse(await fs.readFile(`${root}/rerun-state.json`,'utf8'))}catch{/* initial run */}
 if(pipeline?.status==='PIPELINE_FAILED')break;
 await new Promise(r=>setTimeout(r,30000));
}
