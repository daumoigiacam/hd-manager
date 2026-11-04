import fs from'node:fs/promises';
export async function assertNoActiveUpgradeSoak({readFile=fs.readFile}={}){
 try{const current=JSON.parse(await readFile('test-results/performance-upgrade-20261103/soak-listener-scope/sdk-soak-status.json','utf8'));if(!current.endedAt&&['VERIFYING_CANDIDATE','STARTING','RUNNING'].includes(current.status))throw Error('Current rich two-hour collector is active; do not install, navigate, profile, restart or force GC')}catch(error){if(error.code!=='ENOENT')throw error}
 try{const current=JSON.parse(await readFile('test-results/performance-upgrade-20261103/soak-editor-cleanup/sdk-soak-status.json','utf8'));if(!current.endedAt&&['VERIFYING_CANDIDATE','STARTING','RUNNING'].includes(current.status))throw Error('Current rich two-hour collector is active; do not install, navigate, profile, restart or force GC')}catch(error){if(error.code!=='ENOENT')throw error}
 try{const retry=JSON.parse(await readFile('test-results/performance-upgrade-20261103/post-soak-retention-retry-lock.json','utf8'));if(retry.active===true)throw Error('Post-span retention diagnostic is active; do not replace the observed APK')}catch(error){if(error.code!=='ENOENT')throw error}
 let state;try{state=JSON.parse(await readFile('test-results/performance-upgrade-20261103/soak-final-rich/sdk-soak-status.json','utf8'))}catch(error){if(error.code==='ENOENT')return;throw error}
 if(!state.endedAt&&['VERIFYING_CANDIDATE','STARTING','RUNNING'].includes(state.status))throw Error('Current rich two-hour collector is active; do not install, navigate, profile, restart or force GC');
}
