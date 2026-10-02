export function createReadLifecycle() {
  const controllers = new Set();
  let disposed = false;
  return {
    async run(read, timeoutMs = 9000) {
      if (disposed) throw new DOMException('Read scope disposed', 'AbortError');
      const controller = new AbortController();
      controllers.add(controller);
      let timer;
      let onAbort;
      const aborted = new Promise((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => controller.abort(new DOMException('Firebase read timeout', 'AbortError')), timeoutMs);
      });
      try {
        return await Promise.race([Promise.resolve().then(() => {
          controller.signal.throwIfAborted();
          return read(controller.signal);
        }), aborted]);
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', onAbort);
        controllers.delete(controller);
      }
    },
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort(new DOMException('Read scope disposed', 'AbortError'));
      controllers.clear();
    }
  };
}
