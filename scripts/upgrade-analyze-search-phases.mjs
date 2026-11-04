import fs from'node:fs/promises';
const root='test-results/performance-upgrade-20261103',name=process.argv[2]||'after-search-phase-diagnostic-cold-phase';
if(!/^[a-z0-9-]+$/.test(name))throw Error('Invalid observation');
const input=JSON.parse(await fs.readFile(`${root}/android-${name}.json`,'utf8'));
if(input.status!=='DIAGNOSTIC_NOT_ACCEPTANCE'||!input.phaseDiagnostics)throw Error('Require instrumented completed diagnostic');
const events=input.phaseDiagnostics.search||[],runs=[];
for(const row of input.search){
 if(!Number.isFinite(row.inputAt)||!Number.isFinite(row.paintAt))throw Error('Missing real input/paint anchors');
 const phases=events.filter(e=>e.phase!=='hook.commit'&&e.endedAt>=row.inputAt&&e.startedAt<=row.paintAt);
 const commits=events.filter(e=>e.phase==='hook.commit'&&e.at>=row.inputAt&&e.at<=row.paintAt);
 const index=phases.filter(e=>e.phase==='index.prepare'&&!e.aborted).at(-1),rank=phases.filter(e=>e.phase==='query.rank'&&!e.aborted).at(-1);
 const indexCommit=commits.find(e=>e.indexReady),answerCommit=commits.find(e=>e.answerReady);
 const gap=(end,start)=>Number.isFinite(end)&&Number.isFinite(start)?end-start:null;
 runs.push({queryLength:row.query.length,inputAt:row.inputAt,paintAt:row.paintAt,inputToPaintMs:row.ms,exact:row.exact,
  phases:phases.map(e=>({...e,nonYieldElapsedWallMs:e.elapsedMs-e.yieldWaitWallMs,crossesInputBoundary:e.startedAt<row.inputAt})),commits,
  gapsMs:{indexEndToReadyCommit:gap(indexCommit?.at,index?.endedAt),indexCommitToRankStart:gap(rank?.startedAt,indexCommit?.at),rankEndToAnswerCommit:gap(answerCommit?.at,rank?.endedAt),answerCommitToPaint:gap(row.paintAt,answerCommit?.at)},
  sourcePhasesDuringInteraction:(input.phaseDiagnostics.sources||[]).filter(e=>e.at>=row.inputAt&&e.at<=row.paintAt)});
}
const output={at:new Date().toISOString(),status:'PHASE_DIAGNOSTIC_NOT_ACCEPTANCE',source:`android-${name}.json`,apk:input.installedApkSha256,device:input.device,runs,
 limitations:['Instrumentation adds overhead; these timings are not acceptance or a clean before/after.','Elapsed minus cooperative-yield waiting is wall time, not exact CPU time. Scheduling pauses inside a work turn remain included.','Concurrent phases can overlap. They must not be summed as exclusive CPU time.','Events that began before input retain their full duration; no proportional allocation to the input window is fabricated.','Source phase metadata marks publication boundaries, not network server CPU.']};
await fs.writeFile(`${root}/search-phase-analysis-${name}.json`,JSON.stringify(output,null,2));console.log(JSON.stringify(output));
