import {registerPlugin} from '@capacitor/core';

// All shells share the same proxy even when their chunks load independently.
export function getCapacitorPlugin(name){
  const owner=globalThis;
  owner.__HD_MANAGER_CAPACITOR_PLUGINS__ ||= Object.create(null);
  const registry=owner.__HD_MANAGER_CAPACITOR_PLUGINS__;
  if(!Object.hasOwn(registry,name))registry[name]=registerPlugin(name);
  return registry[name];
}
