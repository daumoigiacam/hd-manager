import fs from 'node:fs/promises';
const root='test-results/phase2-verification-20261102';
const state={pid:process.pid,startedAt:new Date().toISOString(),status:'DIAGNOSTIC',scope:'Sequential synthetic-only rerun after preserving initial harness failures'};
const publish=()=>fs.writeFile(`${root}/rerun-state.json`,JSON.stringify(state,null,2));
const read=async file=>JSON.parse(await fs.readFile(`${root}/${file}.json`,'utf8'));
await publish();
try {
 await import('./verification-capacitor-run.mjs');
 if((await read('capacitor-run-status')).status!=='DIAGNOSTIC_COMPLETED_NOT_ACCEPTANCE')throw Error('Diagnostic incomplete: stop before Macro/soak rather than silently accepting partial coverage');
 state.status='MACRO';await publish();await import('./verification-capacitor-macro.mjs');
 if((await read('capacitor-macro-state')).status!=='SYNTHETIC_CAPACITOR_MACRO_COMPLETED')throw Error('Macro incomplete: preserve failure and stop before soak');
 state.status='SOAK';await publish();await import('./verification-capacitor-soak.mjs');
 state.status='FINISHED_NOT_ACCEPTANCE';
}catch(error){state.status='PIPELINE_FAILED';state.error=error.message}
finally{state.endedAt=new Date().toISOString();await publish()}
