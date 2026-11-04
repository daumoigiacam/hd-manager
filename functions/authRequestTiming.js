// Numeric successful-login diagnostics only. Never accept field names or values
// from a request, and never include identifiers, payloads, tokens or exceptions.
const phases=new Set(['rate','lookup','password','device','claims','sign','commit','migration']);
function createAuthRequestTiming({now=()=>performance.now()}={}){
 const started=now(),durations=new Map();
 const measure=async(name,operation)=>{
  const before=now();
  try{return await operation()}
  finally{if(phases.has(name)){
   const duration=now()-before;
   if(Number.isFinite(duration)&&duration>=0)durations.set(name,(durations.get(name)||0)+duration);
  }}
 };
 const header=()=>{
  const total=now()-started;
  return [...durations, ...(Number.isFinite(total)&&total>=0?[['total',total]]:[])]
   .map(([name,duration])=>`${name};dur=${Math.min(duration,3600000).toFixed(1)}`).join(', ');
 };
 return {measure,header};
}
module.exports={createAuthRequestTiming};
