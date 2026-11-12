let state=Object.freeze({shell:'initializing',persistent:null});
const subscribers=new Set();
const publish=patch=>{state=Object.freeze({...state,...patch});for(const listener of subscribers)listener();};
export const readWebOfflineStatus=()=>state;
export const subscribeWebOfflineStatus=listener=>{subscribers.add(listener);return()=>subscribers.delete(listener);};
export function waitForOfflineController(serviceWorker,{timeoutMs=10000}={}){
  if(serviceWorker.controller)return Promise.resolve(serviceWorker.controller);
  return new Promise((resolve,reject)=>{
    let timer;
    const cleanup=()=>{clearTimeout(timer);serviceWorker.removeEventListener('controllerchange',changed);};
    const changed=()=>{if(serviceWorker.controller){cleanup();resolve(serviceWorker.controller);}};
    serviceWorker.addEventListener('controllerchange',changed);
    timer=setTimeout(()=>{cleanup();reject(Error('Giao diện Offline chưa điều khiển trang hiện tại.'));},timeoutMs);
    changed();
  });
}
export async function installWebOfflineShell({enabled=false,navigator=globalThis.navigator}={}){
  if(!enabled)return {enabled:false};
  try{
  if(!globalThis.isSecureContext||!navigator.serviceWorker)throw Error('Trình duyệt chưa hỗ trợ khởi động Web khi mất mạng.');
  const registration=await navigator.serviceWorker.register(new URL('offline-shell-sw.js',document.baseURI),{updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  const controller=await waitForOfflineController(navigator.serviceWorker);
  await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(Error('Chưa xác minh được bộ nhớ giao diện Offline.'));},10000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ready?resolve():reject(Error('Giao diện Offline chưa được lưu đầy đủ.'));};controller.postMessage({type:'HD_OFFLINE_SHELL_STATUS'},[channel.port2]);});
  publish({shell:'ready'});
  let persistent=false;try{persistent=await navigator.storage?.persisted?.()||await navigator.storage?.persist?.()||false;}catch{}
  publish({persistent});
  return {enabled:true,registration,waitingUpdate:!!registration.waiting};
  }catch(error){publish({shell:'unavailable'});throw error;}
}
