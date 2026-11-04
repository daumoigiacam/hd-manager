// Test-only reference for design review. No production import or cache eviction.
const policies=Object.freeze({
 conservative:Object.freeze({cachePages:20,batchRows:8,workerConcurrency:1,prefetch:0,overscan:2,backgroundDelayMs:1500}),
 balanced:Object.freeze({cachePages:40,batchRows:16,workerConcurrency:2,prefetch:1,overscan:4,backgroundDelayMs:500}),
});
export function createPolicyPrototype({now=()=>performance.now(),dwellMs=60000}={}){
 if(!Number.isFinite(dwellMs)||dwellMs<60000)throw new RangeError('Dwell must be at least one minute');
 let mode='conservative',bad=0,good=0,lastChange=now();
 return Object.freeze({
  observe(sample){
   const t=now();
   if(!sample||!Number.isFinite(sample.responseP95Ms)||sample.responseP95Ms<0
    ||!Number.isFinite(sample.memoryPressure)||sample.memoryPressure<0||sample.memoryPressure>1
    ||!Number.isFinite(t)||t<lastChange){mode='conservative';bad=0;good=0;lastChange=t;return {mode,policy:policies[mode],reason:'invalid-signal-fallback'}}
   const overloaded=sample.responseP95Ms>80||sample.memoryPressure>0.8;
   const recovered=sample.responseP95Ms<30&&sample.memoryPressure<0.55;
   bad=overloaded?bad+1:0;good=recovered?good+1:0;
   if(t-lastChange>=dwellMs&&((mode==='balanced'&&bad>=3)||(mode==='conservative'&&good>=10))){
    mode=mode==='balanced'?'conservative':'balanced';lastChange=t;bad=0;good=0;
   }
   return {mode,policy:policies[mode],reason:'bounded-hysteresis-design-only'};
  },
  reset(){mode='conservative';bad=0;good=0;lastChange=now()},
 });
}
