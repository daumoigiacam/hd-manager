import {subscribeScopedNativeEvent} from './scopedNativeListener.js';

// Android WebView may keep navigator.onLine stale across radio changes. This
// supplements it with the OS default-network state, not an API health guess.
export function createConnectivityState({browser=()=>globalThis.navigator?.onLine!==false,onChange=()=>{}}={}) {
 let native=null,sequence=-1;
 return Object.freeze({read:()=>native??browser(),accept(value){
  if(typeof value?.online!=='boolean'||!Number.isSafeInteger(value.sequence)||value.sequence<0||value.sequence<=sequence)return false;
  const first=native===null,previous=native??browser();sequence=value.sequence;native=value.online;
  // A WebView can change its fallback value without emitting the matching DOM
  // event. Publish the first OS observation as well, so an already mounted
  // controller cannot retain its earlier launch-time connectivity snapshot.
  if(first||previous!==native)onChange(native);return true;
 }});
}
const state=createConnectivityState({onChange:online=>globalThis.window?.dispatchEvent(new Event(online?'online':'offline'))});
export const runtimeOnline=()=>state.read();

export function createNativeConnectivityObserver({plugin,accept=state.accept,onError=()=>{}}) {
 let started=false,closed=false,release=()=>{};
 return Object.freeze({start(){
  if(started||closed)return;started=true;
  release=subscribeScopedNativeEvent(plugin,'nativeNetworkChange',value=>{if(!closed)accept(value);},onError);
  void plugin.startNetworkObservation().then(value=>{if(!closed)accept(value);else void plugin.stopNetworkObservation().catch(()=>{});}).catch(error=>{if(!closed)onError(error);});
 },close(){if(closed)return;closed=true;release();if(started)void plugin.stopNetworkObservation().catch(()=>{});}});
}
