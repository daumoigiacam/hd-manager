import fs from 'node:fs/promises';
const start=Date.now(),old='test-results/phase2-performance-20261102',root='test-results/phase2-verification-20261102';
const read=async file=>{try{return JSON.parse(await fs.readFile(file,'utf8'))}catch{return null}};
await fs.writeFile(`${root}/pipeline-waiter.json`,JSON.stringify({pid:process.pid,status:'WAITING',startedAt:new Date().toISOString(),doesNotInterruptSoak:true}));
while(Date.now()-start<150*60000){
 const result=await read(`${old}/native-memory-result.json`),macro=await read(`${old}/macro-state.json`);
 if(result&&['SYNTHETIC_MACRO_TESTS_COMPLETED','INSTRUMENTATION_FAILED','NOT_RUN_SOAK_INCOMPLETE'].includes(macro?.status)){
  // Import only after the barrier so the reviewed controller code is fresh.
  await import('./verification-capacitor-run.mjs');break;
 }
 await new Promise(resolve=>setTimeout(resolve,15000));
}
