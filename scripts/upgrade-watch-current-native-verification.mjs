import fs from 'node:fs/promises';
const root='test-results/performance-upgrade-20261103';
const read=async name=>{try{return JSON.parse(await fs.readFile(root+'/'+name,'utf8'))}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error}};
const deadline=Date.now()+6*3600000;
while(Date.now()<deadline){
 const span=await read('soak-listener-scope/sdk-soak-status.json'),progress=await read('soak-listener-scope/sdk-soak-progress.json');
 const post=await read('listener-postspan-resume-controller.json'),pilot=await read('native-listener-pilot-controller.json');
 const last=progress?.samples?.at(-1);
 console.log(JSON.stringify({at:new Date().toISOString(),span:span?.status,elapsedMinutes:span?.elapsedMs/60000,samples:progress?.samples?.length,failures:progress?.failures?.length,reloads:progress?.documentReloads?.length,runtimeEvents:progress?.runtimeEvents?.length,lastModule:last?.module,jsHeapMb:last?.heap?.usedSize/1048576,postspan:post?.status,pilot:pilot?.status}));
 if(pilot?.endedAt){if(pilot.status==='FAILED_REVIEW_REQUIRED')process.exitCode=1;break}
 if(post?.endedAt&&post.status==='FAILED_REVIEW_REQUIRED')throw Error('Postspan failed; review preserved evidence');
 await new Promise(resolve=>setTimeout(resolve,60000));
}
