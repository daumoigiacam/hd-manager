// Local verification only. These are navigation/DOM/source timestamps, never
// Android frame or input-latency claims. No record values, searches or identities.
const enabled=import.meta.env?.MODE==='emulator'&&import.meta.env?.VITE_OFFLINE_ENVIRONMENT==='local';
function emitLocalModuleTiming(value){
 console.info('HD_MODULE_READY '+JSON.stringify(value));
 // Capacitor console logging remains disabled: send only this numeric, Local
 // allowlisted metadata to the existing plugin, never arbitrary console data.
 const cap=globalThis.Capacitor,documentTraceId=globalThis.__hdStartupDocument?.traceId;
 if(enabled&&cap?.getPlatform?.()==='android'&&cap.nativePromise&&documentTraceId)void cap.nativePromise('NativeSafeArea','recordModuleReadiness',{...value,documentTraceId}).catch(()=>{});
}
export function createModuleReadinessTrace({clock=()=>performance.now(),origin=()=>performance.timeOrigin,emit=emitLocalModuleTiming,active=enabled,surface='full'}={}){
 let pending=null,seq=0;
 return Object.freeze({
  start(tab,scope,eventAt){
   if(!active||!tab||!scope)return;
   if(pending?.tab===tab&&pending.scope===scope)return;
   const at=clock();pending={id:++seq,tab,scope,at:Number.isFinite(eventAt)&&eventAt>0&&eventAt<=at&&at-eventAt<60000?eventAt:at,origin:origin(),shell:null,essential:null,phases:{}};return pending.id;
  },
  phase({id,tab,scope,stage}){
   if(!pending||pending.id!==id||pending.tab!==tab||pending.scope!==scope||!['module-loaded','directory-ready','cashflow-ready','payments-read-start','payments-read-end','expenses-read-start','expenses-read-end'].includes(stage))return;
   if(!Object.prototype.hasOwnProperty.call(pending.phases,stage))pending.phases[stage]=Math.max(0,clock()-pending.at);
  },
  observe({tab,scope,sourcesReady,pendingUi,essentialReady=false}){
   if(!pending)return true;
   if(pending.scope!==scope){pending=null;return true;}
   if(pending.tab!==tab)return;
   const at=clock();if(pending.shell===null)pending.shell=at;
   if(essentialReady&&pending.essential===null)pending.essential=at;
   if(!sourcesReady||pendingUi)return;
   const result={id:pending.id,module:tab,surface,origin:pending.origin,start:pending.at,shellCommitted:pending.shell,sourceAndDomReady:at,shellMs:pending.shell-pending.at,essentialDataMs:(pending.essential??at)-pending.at,readyMs:at-pending.at,phases:{...pending.phases},witness:'committed-sources-and-visible-dom-not-android-frame'};
   emit(result);pending=null;return result;
  },
  close(){pending=null;},
 });
}
export function observeModuleReadiness({trace,element,tab,scope,sourcesReady}){
 if(!enabled||!element)return()=>{};
 if(element.getAttribute('data-hd-ready-module')!==tab)element.removeAttribute('data-hd-ready-module');
 const check=()=>{const result=trace.observe({tab,scope,sourcesReady,essentialReady:[...element.querySelectorAll('[data-hd-essential-data-ready="true"]')].some(node=>node.getClientRects().length>0),pendingUi:[...element.querySelectorAll('[aria-busy="true"], [data-hd-module-loading], [data-hd-ledger-loading]')].some(node=>node.getClientRects().length>0)});
  if(result&&typeof result==='object')element.setAttribute('data-hd-ready-module',tab);
  if(result)observer.disconnect();};
 const observer=new MutationObserver(check);observer.observe(element,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy','hidden','class','style']});check();
 return()=>observer.disconnect();
}
