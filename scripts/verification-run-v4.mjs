import fs from 'node:fs/promises';
const root='test-results/phase2-verification-20261102';
const state={pid:process.pid,startedAt:new Date().toISOString(),status:'SOAK_V4',scope:'New two-hour observation span; CDP failures remain failures, reconnect does not restart app',previousAttempt:'attempts/sdk-v3-cdp-timeout-65min/sdk-soak-result.json'};
const publish=()=>fs.writeFile(`${root}/rerun-state.json`,JSON.stringify(state,null,2));
await publish();
try{
 await import('./verification-capacitor-soak.mjs');
 const result=JSON.parse(await fs.readFile(`${root}/sdk-soak-result.json`,'utf8'));
 state.status=result.state.status==='TWO_HOUR_OBSERVATION_COMPLETE_NOT_ACCEPTANCE'?'FINISHED_NOT_ACCEPTANCE':'PIPELINE_FAILED';
 state.collectorStatus=result.state.status;
}catch(error){state.status='PIPELINE_FAILED';state.error=error.message}
finally{state.endedAt=new Date().toISOString();await publish()}
