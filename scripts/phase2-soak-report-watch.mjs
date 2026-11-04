import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const root='test-results/phase2-performance-20261102',start=Date.now();
// Local report refresh only. No device interaction, cloud, credentials or UI.
while(Date.now()-start<130*60000){
 let progress=null,done=null;
 try{progress=JSON.parse(await fs.readFile(`${root}/native-memory-progress.json`,'utf8'))}catch{/* concurrent write or not yet available */}
 try{done=JSON.parse(await fs.readFile(`${root}/native-memory-result.json`,'utf8'))}catch{/* not complete */}
 const stat=await fs.stat(`${root}/native-memory-progress.json`).catch(()=>null);
 const stale=Boolean(stat&&Date.now()-stat.mtimeMs>90000);
 await fs.writeFile(`${root}/observation-health.json`,JSON.stringify({at:new Date().toISOString(),status:done?'ENDED':stale?'STALE_OR_STOPPED':'OBSERVING',elapsedMs:done?.elapsedMs??progress?.elapsedMs??null,thirtyMinutesObserved:Boolean((done?.elapsedMs??progress?.elapsedMs??0)>=1800000),twoHoursObserved:Boolean(done&&done.elapsedMs>=7200000)},null,2));
 if(progress||done)execFileSync(process.execPath,['scripts/phase2-report.mjs'],{stdio:'ignore',windowsHide:true});
 if(done||stale)break;
 await new Promise(resolve=>setTimeout(resolve,30000));
}
