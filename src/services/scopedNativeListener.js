// Keep the callback registered with Capacitor outside the component's lexical
// scope. Some bridge versions retain removed callbacks (including the callback
// passed to removeListener). Clearing this cell severs the application closure
// even if that small forwarding function outlives native unregistration.
function createForwarder(current) {
  return {
    callback: (...args) => current?.(...args),
    clear: () => { current = null; },
  };
}

export function subscribeScopedNativeEvent(plugin, eventName, listener, onError = () => {}) {
  const forwarder = createForwarder(listener);
  let disposed = false;
  let handle = null;
  const report = error => { if (!disposed) onError(error); };
  const remove = value => {
    try { Promise.resolve(value?.remove?.()).catch(report); }
    catch (error) { report(error); }
  };
  try {
    Promise.resolve(plugin.addListener(eventName, forwarder.callback)).then(value => {
      if (disposed) remove(value);
      else handle = value;
    }).catch(error => { forwarder.clear(); report(error); });
  } catch (error) {
    forwarder.clear(); report(error);
  }
  return () => {
    if (disposed) return;
    disposed = true;
    // Clear synchronously, before awaiting either registration or removal.
    forwarder.clear();
    remove(handle);
    handle = null;
    onError = () => {};
  };
}
