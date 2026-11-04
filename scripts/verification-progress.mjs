import fs from 'node:fs/promises';
const root='test-results/phase2-verification-20261102';
const read=async name=>{try{return JSON.parse(await fs.readFile(`${root}/${name}.json`,'utf8'))}catch{return null}};
const result=await read('sdk-soak-result'),progress=result||await read('sdk-soak-progress'),state=progress?.state||await read('sdk-soak-status');
const artifact=await fs.stat(`${root}/${result?'sdk-soak-result':'sdk-soak-progress'}.json`).catch(()=>null);
const actions=progress?.actions||[],sample=progress?.samples?.at(-1),ageMs=artifact?Date.now()-artifact.mtimeMs:null;
console.log(JSON.stringify({at:new Date().toISOString(),status:state?.status??'NOT_VERIFIED',revision:state?.workloadRevision,
 minutes:state?.elapsedMs?Math.round(state.elapsedMs/6000)/10:null,samples:progress?.samples?.length??0,
 searches:actions.filter(a=>a.kind==='search'&&a.exercised).length,backgroundForeground:actions.filter(a=>a.kind==='background-foreground').length,
 relogins:actions.filter(a=>a.kind==='relogin-fake-role'&&a.invoked).length,reloads:progress?.documentReloads?.length??null,
 collectorErrors:progress?.failures?.length??null,nativeSamplingErrors:progress?.nativeSamplingErrors?.length??null,jsErrors:sample?.probe?.errors?.length??null,maxTaskMs:sample?.probe&&Object.hasOwn(sample.probe,'cohortMaxTaskMs')?sample.probe.cohortMaxTaskMs:sample?.probe?.maxTaskMs??null,
 resultWritten:Boolean(result),artifactAgeSeconds:ageMs===null?null:Math.round(ageMs/1000),stale:Boolean(ageMs>90000)}));
