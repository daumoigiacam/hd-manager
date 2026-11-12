// Explicit, local-only diagnostics. No tokens, financial values, account IDs or
// telemetry uploads. Normal sessions do not allocate an observer or emit logs.
let sequence=0;
export function createHomePerformanceProbe(mode){
 if(typeof location==='undefined'||new URLSearchParams(location.search).get('hd_home_perf')!=='1')return {start(){},end(){},once(){},close(){}};
 const id=++sequence,spans=new Map(),seen=new Set(),prefix='hd-home-'+id;
 let count=0,total=0,max=0,observer,spanSequence=0;
 if(typeof PerformanceObserver!=='undefined'&&PerformanceObserver.supportedEntryTypes?.includes('longtask')){try{observer=new PerformanceObserver(list=>{for(const entry of list.getEntries()){count++;total+=entry.duration;max=Math.max(max,entry.duration);}});observer.observe({type:'longtask',buffered:true});}catch{observer?.disconnect();observer=undefined;}}
 const mountedAt=performance.now();
 const emit=(event,detail={})=>console.info('HD_HOME_PERF '+JSON.stringify({event,mode,id,atMs:performance.now(),sinceMountMs:performance.now()-mountedAt,navigationType:performance.getEntriesByType('navigation')[0]?.type,heapUsedBytes:performance.memory?.usedJSHeapSize,longTaskSupported:Boolean(observer),longTaskCount:count,longTaskTotalMs:total,maxLongTaskMs:max,...detail}));
 return {start(name){const ticket=++spanSequence;spans.set(name,{at:performance.now(),ticket});performance.mark(prefix+'-'+name);return ticket;},
  end(name,detail={},ticket){const span=spans.get(name);if(!span||(ticket!==undefined&&span.ticket!==ticket))return;const elapsedMs=performance.now()-span.at;spans.delete(name);performance.measure(prefix+'-'+name,prefix+'-'+name);performance.clearMarks(prefix+'-'+name);performance.clearMeasures(prefix+'-'+name);emit(name,{elapsedMs,...detail});},
  once(name,detail={}){if(!seen.has(name)){seen.add(name);emit(name,detail);}},
  close(){observer?.disconnect();for(const key of spans.keys())performance.clearMarks(prefix+'-'+key);spans.clear();}
 };
}
