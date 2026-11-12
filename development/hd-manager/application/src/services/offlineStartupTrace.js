// Bounded Development instrumentation. Never records input, documents, tokens
// or credentials; this is not a production monitoring or prediction engine.
const enabled=import.meta.env?.MODE==='emulator'&&import.meta.env?.VITE_OFFLINE_CUSTOMER_PILOT==='true';
const marks=[],native=[];let sequence=0;
const documentTraceId=enabled?(globalThis.__hdStartupDocument?.traceId||crypto.randomUUID()):null;
function nativeMilestone(stage,at=performance.now()){
 if(!enabled||!globalThis.Capacitor?.nativePromise||globalThis.Capacitor.getPlatform?.()!=='android')return;
 void globalThis.Capacitor.nativePromise('NativeSafeArea','recordStartupMilestone',{stage,documentTraceId,at,origin:performance.timeOrigin}).catch(()=>{});
}
if(enabled){if(globalThis.__hdStartupDocument)nativeMilestone('html.initial-script',globalThis.__hdStartupDocument.initialScriptAt);}

export function startupMark(stage,details={}){if(!enabled)return;marks.push({traceId:documentTraceId,stage,at:performance.now(),...details});if(['react.entry','workspace.interactive','home.report-commit','background.auth-start','background.sync-start'].includes(stage))nativeMilestone(stage);performance.mark('hd-startup:'+stage);if(marks.length>1800){const old=marks.splice(0,marks.length-1800);for(const row of old)performance.clearMarks('hd-startup:'+row.stage);}}
export function startupSpan(stage){const id=++sequence;startupMark(stage+'.start',{id});return details=>startupMark(stage+'.end',{id,...details});}
export function startupFrame(stage,details={}){if(!enabled)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{startupMark(stage+'.first-frame',details);setTimeout(()=>startupMark(stage+'.interactive',details),0);}));}
export function installStartupNativeTrace(cap){if(!enabled||!cap?.nativePromise||cap.__hdStartupTraced)return;cap.__hdStartupTraced=true;const original=cap.nativePromise;cap.nativePromise=function(plugin,method,...args){const start=performance.now();return original.call(this,plugin,method,...args).finally(()=>{native.push({plugin,method,start,end:performance.now()});if(native.length>1800)native.splice(0,native.length-1800);});};}
if(enabled){if(globalThis.__hdStartupDocument?.shellMarkupAt)startupMark('shell.markup-ready',{at:globalThis.__hdStartupDocument.shellMarkupAt});startupMark('runtime.trace-module');globalThis.__hdStartupTrace={read:()=>({marks:marks.slice(),native:native.slice(),document:globalThis.__hdStartupDocument||null,resources:performance.getEntriesByType('resource').filter(e=>/\.(?:js|css)(?:\?|$)/.test(e.name)).map(e=>({name:e.name.split('/').pop(),start:e.startTime,end:e.responseEnd,duration:e.duration,transferSize:e.transferSize,encodedBodySize:e.encodedBodySize})),heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null})};}
