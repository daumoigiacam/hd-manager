/** @template T @typedef {{preload:()=>Promise<T>,getResolved:()=>T|undefined,load:()=>{then:(resolve:(value:T)=>unknown,reject?:(error:unknown)=>unknown)=>unknown}}} PreloadableModule */
/** @template T @param {()=>T|Promise<T>} importModule @returns {PreloadableModule<T>} */
export function createPreloadableModule(importModule) {
  /** @type {Promise<T>|undefined} */
  let promise;
  /** @type {T|undefined} */
  let resolvedModule;
  const preload = () => {
    promise ||= Promise.resolve().then(importModule).then(module => {
      resolvedModule = module;
      return module;
    }).catch(error => {
      // Retry is explicit; a failed chunk never causes a document reload loop.
      promise = undefined;
      throw error;
    });
    return promise;
  };
  /** @returns {{then:(resolve:(value:T)=>unknown,reject?:(error:unknown)=>unknown)=>unknown}} */
  const load = () => ({
    then(resolve, reject) {
      // A prepared module must not suspend again just to resolve a cached import.
      if (resolvedModule) return resolve(resolvedModule);
      return preload().then(resolve, reject);
    },
  });
  return { load, preload, getResolved: () => resolvedModule };
}
