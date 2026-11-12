import {useSyncExternalStore} from 'react';

// Match the existing phone CSS, not visualViewport/keyboard height changes.
// Unsupported hosts keep the old rendered tree so navigation cannot disappear.
export function createNavigationViewportStore(host) {
  let media;
  try{media=host?.matchMedia?.('(min-width: 768px)')}catch{/* Keep legacy rendering. */}
  return Object.freeze({
    getSnapshot:()=>media?media.matches:true,
    subscribe(callback){
      if(!media)return()=>{};
      if(typeof media.addEventListener==='function'){
        media.addEventListener('change',callback);
        return()=>media.removeEventListener('change',callback);
      }
      if(typeof media.addListener==='function'){
        media.addListener(callback);
        return()=>media.removeListener(callback);
      }
      return()=>{};
    },
  });
}
const viewport=createNavigationViewportStore(typeof window==='undefined'?null:window);
const serverSnapshot=()=>true;
export const useWideNavigation=()=>useSyncExternalStore(viewport.subscribe,viewport.getSnapshot,serverSnapshot);
