import fs from 'node:fs/promises';
const start=performance.now(),root='test-results/phase2-verification-20261102';
await fs.writeFile(`${root}/soak-waiter.json`,JSON.stringify({pid:process.pid,status:'WAITING_FOR_CAPACITOR_MACRO'}));
const terminal=['SYNTHETIC_CAPACITOR_MACRO_COMPLETED','INSTRUMENTATION_FAILED','NOT_RUN_DIAGNOSTIC_NOT_FINISHED'];
while(performance.now()-start<190*60000){
 let state;try{state=JSON.parse(await fs.readFile(`${root}/capacitor-macro-state.json`,'utf8'))}catch{/* wait */}
 if(terminal.includes(state?.status)){await import('./verification-capacitor-soak.mjs');break;}
 await new Promise(resolve=>setTimeout(resolve,15000));
}
