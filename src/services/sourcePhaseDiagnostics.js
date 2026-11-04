const phases=new Set(['materialized','compared','state-queued','state-unchanged','updater-evaluated','commit-witness']);
export function createSourcePhaseDiagnostics({enabled=()=>false,record,now=()=>performance.now()}={}) {
 return {
  begin:()=>enabled()?now():null,
  mark(collection,phase,startedAt=null){
   if(!enabled())return;
   if(typeof collection!=='string'||!/^[A-Za-z_]+$/.test(collection)||!phases.has(phase))throw new TypeError('Invalid source timing metadata.');
   record('data.source.phase',{collection,phase,...(Number.isFinite(startedAt)?{durationMs:Math.max(0,now()-startedAt)}:{})});
  },
 };
}
