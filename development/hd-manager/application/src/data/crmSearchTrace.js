// Opt-in Development diagnostics. No text, documents, account IDs or tokens.
const enabled=import.meta.env?.MODE==='emulator';
let events=[],sequence=0,active=0;
export function searchMark(id,stage,details={}){
 if(!enabled||!globalThis.__crmTraceEnabled||!id)return;
 events.push({id,stage,at:performance.now(),...details});
 if(events.length>12000)events.splice(0,events.length-12000);
}
export function startSearchTrace(stage='input'){if(!enabled||!globalThis.__crmTraceEnabled)return 0;active=++sequence;searchMark(active,stage);return active;}
export function currentSearchTrace(){return enabled&&globalThis.__crmTraceEnabled?active:0;}
if(enabled)globalThis.__crmSearchTrace={reset(){events=[];active=0;sequence=0;globalThis.__crmTraceEnabled=true;},read:()=>events.slice(),stop(){globalThis.__crmTraceEnabled=false;}};
