// Chromium 74 retains removed editor ancestors in its native undo history.
// Release only a discarded tree's parent/child links. Never replay undo, clear
// a value, touch a connected tree, or change React's properties/listeners.
export function createDetachedEditorCleanup({ schedule = callback => setTimeout(callback, 100),
  cancel = clearTimeout, now = () => performance.now(), budgetMs = 2, maxOperations = 64 } = {}) {
  const roots = new Set();
  const stack = [];
  let timer = null, disposed = false;
  const arm = () => { if (!disposed && timer === null && (roots.size || stack.length)) timer = schedule(drain); };
  function drain() {
    timer = null;
    const started = now();
    for (let operations = 0; operations < maxOperations && now() - started < budgetMs; operations++) {
      if (!stack.length) {
        const root = roots.values().next().value;
        if (!root) break;
        roots.delete(root);
        if (!root.isConnected) stack.push(root);
      }
      const node = stack[stack.length - 1];
      if (!node) continue;
      // A portal/widget may reattach a node between observation and work.
      if (node.isConnected || !node.firstChild) { stack.pop(); continue; }
      const child = node.firstChild;
      node.removeChild(child);
      if (child.firstChild) stack.push(child);
    }
    arm();
  }
  return {
    enqueue(root) {
      if (disposed || root?.nodeType !== 1 || root.isConnected || !root.firstChild) return;
      if (!root.matches('input,textarea,[contenteditable]') && !root.querySelector('input,textarea,[contenteditable]')) return;
      roots.add(root); arm();
    },
    dispose() { disposed = true; if (timer !== null) cancel(timer); timer = null; roots.clear(); stack.length = 0; },
  };
}

// Limit the workaround to the exact old engine on which retention is proven.
// This is browser compatibility, not a device-model performance policy.
export function needsDetachedEditorCleanup(userAgent = '') {
  return /Android/.test(userAgent) && /(?:Chrome|Chromium)\/74\./.test(userAgent);
}

export function installDetachedEditorCleanup(root, { userAgent = globalThis.navigator?.userAgent || '',
  Observer = globalThis.MutationObserver, ...options } = {}) {
  if (!root || !Observer || !needsDetachedEditorCleanup(userAgent)) return () => {};
  const cleanup = createDetachedEditorCleanup(options);
  const observer = new Observer(records => {
    for (const record of records) for (const node of record.removedNodes) cleanup.enqueue(node);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => { observer.disconnect(); cleanup.dispose(); };
}
