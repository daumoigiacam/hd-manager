export function verifyNativePilotWebBoundary(before,after,beforeVersion,afterVersion){
 for(const identity of [before,after])if(identity.files.filter(row=>row.file==='version.json').length!==1||new Set(identity.files.map(row=>row.file)).size!==identity.files.length)throw Error('Asset receipt is incomplete or duplicated');
 const rows=identity=>identity.files.filter(row=>row.file!=='version.json').map(({file,bytes,sha256})=>({file,bytes,sha256})).sort((a,b)=>a.file.localeCompare(b.file));
 if(JSON.stringify(rows(before))!==JSON.stringify(rows(after)))throw Error('Emitted runtime assets differ; native-only attribution is not established');
 for(const version of [beforeVersion,afterVersion]){
  if(Object.keys(version).sort().join(',')!=='buildId,builtAt'||typeof version.buildId!=='string'||!Number.isFinite(Date.parse(version.builtAt)))throw Error('Unexpected version manifest schema');
 }
 if(beforeVersion.buildId!==afterVersion.buildId)throw Error('Build identity changed; version polling behavior is not controlled');
 return {sameRuntimeAssets:true,versionTimestampOnly:{before:beforeVersion.builtAt,after:afterVersion.builtAt,buildId:beforeVersion.buildId},qualification:'Actual build timestamps are preserved, not forged. Only version.json builtAt may differ; buildId, executable JS/CSS, index, probe and all other public assets must match.'};
}
