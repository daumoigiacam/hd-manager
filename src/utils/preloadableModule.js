export function createPreloadableModule(importModule) {
  let promise;
  let resolvedModule;
  const preload = () => {
    promise ||= Promise.resolve().then(importModule).then(module => {
      resolvedModule = module;
      return module;
    });
    return promise;
  };
  const load = () => ({
    then(resolve, reject) {
      // A prepared module must not suspend again just to resolve a cached import.
      if (resolvedModule) return resolve(resolvedModule);
      return preload().then(resolve, reject);
    },
  });
  return { load, preload };
}
