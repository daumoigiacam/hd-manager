import {useEffect,useSyncExternalStore} from 'react';
import {getNativeStartupController} from './nativeStartupController.js';
// React subscribes to the same document-owned bootstrap started by the early entry.
export function useNativeOfflineWorkspace(authSource){
 const controller=getNativeStartupController(authSource);
 const state=useSyncExternalStore(controller.subscribe,controller.getSnapshot,controller.getSnapshot);
 useEffect(()=>{controller.attachUI();},[controller]);
 return state;
}
