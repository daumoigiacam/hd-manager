const policies=Object.freeze({
 conservative:Object.freeze({mode:'conservative',workBudgetMs:2,maxOperations:512,searchRows:8,cachePages:20,readConcurrency:1,overscan:2,prefetch:0,workerConcurrency:1,backgroundDelayMs:1500}),
 balanced:Object.freeze({mode:'balanced',workBudgetMs:4,maxOperations:2048,searchRows:24,cachePages:80,readConcurrency:2,overscan:4,prefetch:1,workerConcurrency:2,backgroundDelayMs:500}),
});
const legacy=Object.freeze({...policies.balanced,mode:'disabled',maxOperations:128,overscan:2,prefetch:0});
/** @typedef {{mode:string,workBudgetMs:number,maxOperations:number,searchRows:number,cachePages:number,readConcurrency:number,overscan:number,prefetch:number,workerConcurrency:number,backgroundDelayMs:number}} ResourcePolicy */
/** @type {Readonly<ResourcePolicy>} */ let runtimePolicy=legacy;
/** @type {null|(()=>void)} */ let installation=null;
/** @type {Set<(policy:Readonly<ResourcePolicy>)=>void>} */ const subscribers=new Set();
export const getAdaptivePerformancePolicy=()=>runtimePolicy;
/** @param {(policy:Readonly<ResourcePolicy>)=>void} listener */
export const subscribeAdaptivePerformance=listener=>{subscribers.add(listener);return()=>{subscribers.delete(listener)}};
/** @param {Readonly<ResourcePolicy>} policy */
const publish=policy=>{if(runtimePolicy===policy)return;runtimePolicy=policy;for(const listener of subscribers){try{listener(policy)}catch{/* Resource telemetry cannot change business publication. */}}};

// No model-name/device-name rules, business data, credentials or unbounded log.
/** @param {{now?:()=>number,dwellMs?:number,onChange?:(policy:Readonly<ResourcePolicy>)=>void}} [options] */
export function createAdaptivePerformanceController({now=()=>performance.now(),dwellMs=60000,onChange=()=>{}}={}){
 if(!Number.isFinite(dwellMs)||dwellMs<60000)throw new RangeError('Adaptive dwell must be at least one minute');
 /** @type {'conservative'|'balanced'} */ let mode='conservative';
 let lastChange=now(),bad=0,good=0;
 /** @param {'conservative'|'balanced'} next */
 const choose=next=>{if(mode!==next){mode=next;onChange(policies[mode])}};
 return Object.freeze({
  getPolicy:()=>policies[mode],
  reset(){bad=0;good=0;lastChange=now();choose('conservative')},
  /** @param {{responseP95Ms?:number,memoryPressure?:number|null,longTaskMs?:number}} [sample] */
  observe({responseP95Ms,memoryPressure=null,longTaskMs=0}={}){
   const t=now(),valid=Number.isFinite(t)&&t>=lastChange&&typeof responseP95Ms==='number'&&Number.isFinite(responseP95Ms)&&responseP95Ms>=0&&Number.isFinite(longTaskMs)&&longTaskMs>=0
    &&(memoryPressure===null||Number.isFinite(memoryPressure)&&memoryPressure>=0&&memoryPressure<=1);
   if(!valid){bad=0;good=0;lastChange=Number.isFinite(t)?t:0;choose('conservative');return policies[mode]}
   const overloaded=(responseP95Ms??Infinity)>80||longTaskMs>=100||memoryPressure!==null&&memoryPressure>.8;
   const recovered=(responseP95Ms??Infinity)<40&&longTaskMs<50&&(memoryPressure===null||memoryPressure<.55);
   bad=overloaded?bad+1:0;good=recovered?good+1:0;
   if(t-lastChange>=dwellMs&&(mode==='balanced'&&bad>=3||mode==='conservative'&&good>=10)){
    choose(mode==='balanced'?'conservative':'balanced');lastChange=t;bad=0;good=0;
   }
   return policies[mode];
  },
 });
}

/** @param {{windowScope?:Window & typeof globalThis,enabled?:boolean}} [options] */
export function installAdaptivePerformance({windowScope=globalThis.window,enabled=true}={}){
 if(installation)return installation;
 if(!enabled||!windowScope?.document){publish(legacy);return()=>{}};
 const win=windowScope,doc=win.document,now=()=>win.performance.now();
 const controller=createAdaptivePerformanceController({now,onChange:publish});publish(controller.getPolicy());
 /** @type {number[]} */ const feedback=[];
 let peakTask=0,lastSample=-Infinity,firstFrame=0,secondFrame=0;
 /** @type {PerformanceObserver|undefined} */ let observer;
 const cancelFrames=()=>{win.cancelAnimationFrame(firstFrame);win.cancelAnimationFrame(secondFrame);firstFrame=0;secondFrame=0};
 /** @param {number} ms */
 const record=ms=>{
  feedback.push(ms);if(feedback.length>20)feedback.shift();
  if(now()-lastSample<5000)return;lastSample=now();
  const sorted=[...feedback].sort((a,b)=>a-b),memory=(/** @type {Performance & {memory?:{usedJSHeapSize:number,jsHeapSizeLimit:number}}} */ (win.performance)).memory;
  const ratio=memory&&Number.isFinite(memory.usedJSHeapSize)&&memory.jsHeapSizeLimit>0?memory.usedJSHeapSize/memory.jsHeapSizeLimit:null;
  controller.observe({responseP95Ms:sorted[Math.ceil(.95*sorted.length)-1],memoryPressure:ratio,longTaskMs:peakTask});peakTask=0;
 };
 /** @param {PointerEvent} event */
 const pointer=event=>{if(!event.isTrusted||doc.hidden)return;cancelFrames();const start=now();firstFrame=win.requestAnimationFrame(()=>{secondFrame=win.requestAnimationFrame(()=>record(now()-start))})};
 const visibility=()=>{cancelFrames();feedback.length=0;peakTask=0;controller.reset();publish(controller.getPolicy())};
 doc.addEventListener('pointerdown',pointer,{capture:true,passive:true});doc.addEventListener('visibilitychange',visibility);
 try{if(typeof win.PerformanceObserver==='function'){observer=new win.PerformanceObserver(list=>{for(const entry of list.getEntries())peakTask=Math.max(peakTask,entry.duration||0)});observer.observe({entryTypes:['longtask']})}}catch{/* Older WebViews keep the conservative fallback. */}
 let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;cancelFrames();observer?.disconnect();doc.removeEventListener('pointerdown',pointer,true);doc.removeEventListener('visibilitychange',visibility);feedback.length=0;installation=null;publish(legacy)};
 installation=dispose;return dispose;
}
