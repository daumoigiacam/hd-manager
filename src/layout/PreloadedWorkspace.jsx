import React, { useEffect, useState } from 'react';

/** @template {object} P
 * @param {{module:import('../utils/preloadableModule.js').PreloadableModule<{default:React.ComponentType<P>}>,viewProps:P,label:string}} props
 */
export default function PreloadedWorkspace({ module, viewProps, label }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(() => {const initial=module.getResolved()?.default;return { module, Component:typeof initial === 'function' ? initial : null, error:false }});
  const cachedValue = module.getResolved()?.default;
  const cached = typeof cachedValue === 'function' ? cachedValue : null;
  const current = result.module === module ? result : null;
  const Component = cached || current?.Component;
  useEffect(() => {
    if (cached) return undefined;
    let cancelled = false;
    void module.preload().then(value => {
      if (typeof value?.default !== 'function') throw Error('Workspace component export is invalid.');
      if (!cancelled) setResult({module,Component:value.default,error:false});
    }).catch(() => {if (!cancelled) setResult({module,Component:null,error:true});});
    return () => {cancelled = true;};
  }, [module, cached, attempt]);
  if (Component) return <Component {...viewProps} />;
  if (current?.error) return <section role="alert" className="p-4 text-sm text-rose-700">
    Không thể mở {label}. <button type="button" className="font-bold underline" onClick={() => {
      setResult({module,Component:null,error:false});setAttempt(value => value + 1);
    }}>Thử lại</button>
  </section>;
  return <section role="status" aria-busy="true" data-hd-module-loading className="min-h-24 p-4 text-sm text-slate-600">Đang mở {label}…</section>;
}
