import fs from'node:fs/promises';
export async function assertVerificationFixtureReady({readFile=fs.readFile,request=fetch,now=Date.now,requiredRemainingMs=0}={}){
 const root='test-results/performance-upgrade-20261103/rich-service';
 const status=JSON.parse(await readFile(`${root}/emulator-service-status.json`,'utf8'));
 const manifest=JSON.parse(await readFile(`${root}/fixture-manifest.json`,'utf8'));
 if(status.status!=='READY'||status.project!=='demo-hdm-perf-verification'||manifest.project!==status.project||manifest.appId!=='verification-fixture'||manifest.realAccounts!==false)throw Error('Only the isolated fictional fixture is permitted');
 if(!Number.isFinite(requiredRemainingMs)||requiredRemainingMs<0)throw Error('Invalid fixture duration requirement');
 const expires=Date.parse(status.expiresAt);
 if(!Number.isFinite(expires)||expires-now()<requiredRemainingMs+300000)throw Error('Fixture expires too soon; stale READY files are not service availability');
 const ports=[];
 for(const [port,expected]of[[8185,404],[9199,200],[5002,204]]){
  const response=await request(`http://127.0.0.1:${port}/`,{method:'HEAD',signal:AbortSignal.timeout(2000)});
  if(response.status!==expected)throw Error(`Unexpected isolated fixture response on port ${port}`);
  ports.push({port,status:response.status});
 }
 return{checkedAt:new Date(now()).toISOString(),project:status.project,pid:status.pid,expiresAt:status.expiresAt,businessSha256:manifest.businessSha256||null,ports};
}
