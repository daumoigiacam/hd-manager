import fs from 'node:fs/promises';
const root='test-results/performance-upgrade-20261103';
const files={before:'session-retention-after-packet-16k-baseline-01.json',after:'session-retention-after-listener-scope-ui-home-02.json'};
const groups={};
for(const [key,file]of Object.entries(files)){
 const input=JSON.parse(await fs.readFile(root+'/'+file,'utf8'));
 if(input.status!=='SIX_SESSION_RETENTION_DIAGNOSTIC_COMPLETE_NOT_SOAK_ACCEPTANCE'||input.sessions.length!==6)throw Error('Require complete, preserved six-session diagnostic');
 const heap=input.sessions.map(s=>s.loggedOutAfterGc.heap.usedSize);
 groups[key]={file:root+'/'+file,apkSha256:input.apkSha256,heapBytes:heap,firstBytes:heap[0],lastBytes:heap.at(-1),growthBytes:heap.at(-1)-heap[0],minBytes:Math.min(...heap),maxBytes:Math.max(...heap),domNodes:input.sessions.map(s=>s.loggedOutAfterGc.dom.nodes),runtimeEvents:input.runtimeEvents,condition:input.conditions};
}
const control=JSON.parse(await fs.readFile(root+'/native-listener-source-control.json','utf8'));
if(!control.expected)throw Error('Uncontrolled source changes; do not attribute result to native listener group');
const report={at:new Date().toISOString(),status:'RETENTION_MECHANISM_BENEFIT_OBSERVED_NOT_FULL_APP_ACCEPTANCE',groups,sourceControl:root+'/native-listener-source-control.json',qualifications:[
 'Actual Android10/WebView74, same six synthetic manager login/logout/navigation/search/native-back cycles. ExplicitGC only at logged-out endpoints. Not natural RAM or latency acceptance.',
 'Newer diagnostic started from the current ready Home after extra debt-query diagnostics; baseline began after a fresh install/data clear. Initial history differs: no exact whole-app RAM percentage or universal leak-free claim.',
 'Only App listener integration and the new scoped helper differ in recorded App source inputs. Mechanism is also reproduced with installed bridge code and child Node payload reachability test.',
 'JS heap is not total device/app RAM. Renderer/native PSS, worker heaps and natural trends require the independent two-hour span and post-span review.',
 'Small callback/DOM bookkeeping still increases across sessions; this fix severs retained application data and does not patch the installed Capacitor callback map.'
],productionRequests:0,realAccounts:false};
await fs.writeFile(root+'/native-session-retention-comparison.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,beforeGrowth:groups.before.growthBytes,afterGrowth:groups.after.growthBytes}));
