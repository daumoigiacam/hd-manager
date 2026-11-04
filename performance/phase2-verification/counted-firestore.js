// Test build alias only. Preserve real SDK behavior and count public listeners.
export * from '../../node_modules/firebase/firestore/dist/esm/index.esm.js';
import {onSnapshot as original} from '../../node_modules/firebase/firestore/dist/esm/index.esm.js';
const counters=globalThis.__hdSdkListenerCounters={created:0,closed:0,outstanding:0,errors:0};
export function onSnapshot(reference,...args){
 let closed=false,stop;
 const close=()=>{if(!closed){closed=true;counters.closed++;counters.outstanding--}};
 counters.created++;counters.outstanding++;
 const index=typeof args[0]==='function'?1:typeof args[1]==='function'?2:-1;
 if(index>=0){const previous=args[index];args[index]=error=>{counters.errors++;close();previous?.(error)}}
 try{stop=original(reference,...args)}catch(error){close();throw error}
 return ()=>{close();stop()};
}
if(typeof window==='undefined'&&typeof self!=='undefined'&&typeof self.postMessage==='function'){
 setInterval(()=>self.postMessage({type:'__hdVerificationWorkerCounters',counters:{...counters}}),2000);
}
