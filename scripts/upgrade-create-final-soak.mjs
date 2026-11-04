import fs from'node:fs/promises';
const candidate=process.argv[2]||'after-noop-verified';if(!/^after-[a-z0-9-]+$/.test(candidate))throw Error('Invalid candidate cohort');
let source=await fs.readFile('scripts/upgrade-android-soak.mjs','utf8');
source=source.replaceAll('test-results/performance-upgrade-20261103/soak-integrated','test-results/performance-upgrade-20261103/soak-final-rich')
 .replaceAll('test-results/performance-upgrade-20261103/after-integrated',`test-results/performance-upgrade-20261103/${candidate}`)
 .replace('upgrade-current-repositories-resource-policy-v1','upgrade-linked-business-noop-publication-v2')
 .replace('After-integrated candidate with Adaptive policy ON; real SDK/demo fixture. Independent two-hour span, no duration from older cohorts added. No reinstall/GC/restart by collector. Other Windows workload may run: this is stability stress, not isolated UI speed acceptance.',
 'Optimized candidate with Adaptive policy ON and separate linked synthetic business fixture (2000 orders/6000 items). Independent two-hour span; no duration from older cohorts added. No reinstall, GC or restart by collector. Metadata sampling/automation overhead is retained; no universal real-device acceptance.');
const insertion="await fs.mkdir(root,{recursive:true});";
if(!source.includes(insertion))throw Error('Source collector contract changed');
source=source.replace(insertion,`${insertion}
const previousSoak=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/soak-integrated/sdk-soak-result.json','utf8'));
const previousWorker=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/worker-heap-two-hour.json','utf8'));
if(!previousSoak.state.endedAt||previousSoak.state.elapsedMs<7200000||!previousWorker.endedAt||previousWorker.elapsedMs<7200000)throw Error('Previous collectors must finish; do not interrupt their spans');
state.fixtureManifest=JSON.parse(await fs.readFile('test-results/performance-upgrade-20261103/rich-service/fixture-manifest.json','utf8'));
if(state.fixtureManifest.workload?.kind!=='synthetic-linked-business-v1'||state.fixtureManifest.project!=='demo-hdm-perf-verification')throw Error('Rich fixture not ready');
`);
const marker='const nativeReadStart=performance.now();sample.processes=[];';
if(!source.includes(marker))throw Error('Sample contract changed');
source=source.replace(marker,`sample.sourceReadiness=await cdp.evaluate("(()=>{var m=document.querySelector('main[data-hd-module]'),id=m&&m.getAttribute('data-hd-module');return m?{module:id,contract:window.__hdSourceContract(m,id,window.__hdPlans),projectionPending:window.__hdModulePending(m)}:null})()");
   ${marker}`);
const menuMarker="await clickText('Thêm');await wait(150);";
if(!source.includes(menuMarker))throw Error('Menu action contract changed');
source=source.replace(menuMarker,`if(!await clickText('Thêm')){
    const exited=await clickText('Quay lại');
    actions.push({kind:'personal-workspace-exit',exited,elapsedMs:performance.now()-started});
    if(!exited)throw Error('Neither main menu nor explicit workspace exit available');
    await wait(150);if(!await clickText('Thêm'))throw Error('Main menu unavailable after workspace exit');
   }await wait(150);`);
const visitMarker="if(clicked)await wait(500);";
if(!source.includes(visitMarker))throw Error('Route visit contract changed');
source=source.replace(visitMarker,`if(clicked){
    const readyDeadline=performance.now()+30000;let ready=false;
    while(performance.now()<readyDeadline){ready=await cdp.evaluate("(()=>{var m=document.querySelector('main[data-hd-module]'),id=m&&m.getAttribute('data-hd-module');return id==="+JSON.stringify(label)+"&&window.__hdSourceContract(m,id,window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)})()");if(ready)break;await wait(100)}
    actions.push({kind:'source-ready-route',label,ready,elapsedMs:performance.now()-started});
    if(!ready)throw Error('Actual route did not reach source/projection readiness: '+label);
   }`);
const preflightMarker=' await awaitInitialHome();';
if(!source.includes(preflightMarker))throw Error('Initial ready barrier changed');
source=source.replace(preflightMarker,`${preflightMarker}
 if(process.argv.includes('--native-share-preflight')){
  const output=execFileSync(process.execPath,['scripts/upgrade-android-share-compat.mjs','${candidate}'],{encoding:'utf8',windowsHide:true,timeout:30000});
  state.shareCompatibilityPreflight=JSON.parse(output.trim());
  if(state.shareCompatibilityPreflight.status!=='NATIVE_CLASSIC_WORKER_BLOB_COMPATIBILITY_PASS')throw Error('Native preflight failed before observation span');
 }
`);
await fs.writeFile('scripts/upgrade-android-final-soak.mjs',source);console.log(JSON.stringify({candidate,script:'scripts/upgrade-android-final-soak.mjs',notStarted:true}));
