import { execFileSync } from 'node:child_process';
import {createHash} from 'node:crypto';

export async function connectAndroidWebView({ adb, serial, packageName, port = 9227, enableRuntime = true }) {
  const shell = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000 }).trim();
  let pid, socket;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      pid = shell('shell', 'pidof', packageName);
      socket = `webview_devtools_remote_${pid}`;
      if (/^\d+$/.test(pid) && shell('shell', 'cat', '/proc/net/unix').includes(`@${socket}`)) break;
    } catch { /* Activity launch can return before the process/socket exists. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!/^\d+$/.test(pid || '') || !shell('shell', 'cat', '/proc/net/unix').includes(`@${socket}`)) throw Error('App has no debug WebView; use the isolated Acceptance APK');
  shell('forward', `tcp:${port}`, `localabstract:${socket}`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find(item => item.type === 'page' && item.url.startsWith('https://localhost'));
  if (!page) throw Error('Acceptance WebView target not found');
  const socketConnection = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socketConnection.onopen = resolve; socketConnection.onerror = reject; });
  let sequence = 0;
  const tasks = new Map();
  const events = [];
  const listeners = new Set();
  const rejectPending = reason => {
    for (const task of tasks.values()) { clearTimeout(task.timer); const error=Error(reason);error.request={method:task.method,expressionDigest:task.expressionDigest};task.reject(error); }
    tasks.clear();
  };
  socketConnection.onclose = event => rejectPending(`CDP WebSocket closed: code=${event.code}, clean=${event.wasClean}`);
  socketConnection.onerror = event => rejectPending('CDP WebSocket transport error: '+(event.message||'no detail'));
  socketConnection.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = tasks.get(message.id);
      if (!task) return;
      clearTimeout(task.timer); tasks.delete(message.id);
      if (message.error) task.reject(Error(JSON.stringify(message.error))); else task.resolve(message.result);
    } else if (['Runtime.exceptionThrown', 'Page.loadEventFired', 'Inspector.targetCrashed'].includes(message.method)) {
      events.push(message);
    }
    if (message.method) for (const listener of listeners) listener(message);
  };
  const send = (method, params = {}, timeoutMs = 30000) => new Promise((resolve, reject) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 180000) { reject(Error('Invalid diagnostic transport timeout')); return; }
    const id = ++sequence;
    const expressionDigest = params.expression ? createHash('sha256').update(params.expression).digest('hex') : null;
    const requestedAt = performance.now();
    const timer = setTimeout(() => {
      tasks.delete(id);
      const error=Error(`CDP timeout: ${method}`);
      error.request={method,expressionDigest,elapsedMs:performance.now()-requestedAt,socketReadyState:socketConnection.readyState};
      reject(error);
    }, timeoutMs);
    tasks.set(id, { resolve, reject, timer, method, expressionDigest });
    socketConnection.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  if (enableRuntime) { await send('Runtime.enable'); await send('Page.enable'); }
  return { pid, shell, send, evaluate, events, onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); }, close() {
    for (const task of tasks.values()) { clearTimeout(task.timer); task.reject(Error('Connection closed')); }
    tasks.clear(); socketConnection.close();
  } };
}
