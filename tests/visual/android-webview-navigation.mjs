import assert from 'node:assert/strict';

const endpoint = process.env.HD_MANAGER_ANDROID_CDP || 'http://127.0.0.1:9223';
const limitMs = Number(process.env.HD_MANAGER_ANDROID_NAV_MAX_MS || 1000);
const targets = await (await fetch(`${endpoint}/json`)).json();
const target = targets.find(item => item.type === 'page' && item.url === 'https://localhost/');
assert(target?.webSocketDebuggerUrl, 'HD Manager WebView is not available through adb forward');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error || message.result?.exceptionDetails) {
    request.reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
  } else {
    request.resolve(message.result);
  }
});

const send = (method, params) => new Promise((resolve, reject) => {
  const id = nextId++;
  const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error(`CDP ${method} timed out`));
  }, 30000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});

const measure = async (name, selector, expectedText = '') => {
  const expression = `(async () => {
    const name = ${JSON.stringify(name)};
    const selector = ${JSON.stringify(selector)};
    const expectedText = ${JSON.stringify(expectedText)};
    const button = [...document.querySelectorAll('[data-hd-navigation="bottom"] button')]
      .find(item => item.textContent.trim() === name && item.getClientRects().length);
    if (!button) throw new Error('Missing visible footer button: ' + name);
    const started = performance.now();
    button.click();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Navigation timed out: ' + name)); }, 20000);
      const check = () => {
        const content = document.querySelector(selector);
        if (!content || (expectedText && !content.textContent.includes(expectedText))) return;
        clearTimeout(timeout);
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      const observer = new MutationObserver(check);
      observer.observe(document.body, { childList: true, subtree: true });
      check();
    });
    return Math.round(performance.now() - started);
  })()`;
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  const ms = result?.result?.value;
  assert(Number.isFinite(ms), `No Android timing for ${name}`);
  return { screen: name, ms };
};

try {
  await send('Runtime.enable', {});
  const samples = [];
  for (let index = 0; index < 3; index += 1) {
    samples.push(await measure('Thêm', '.hd-more-menu, .hd-more-grid, .hd-more-screen'));
    samples.push(await measure('Trang chủ', '.business-report-workspace'));
  }
  for (const [button, title] of [
    ['Đặt hàng', 'Đơn đặt'],
    ['Xuất kho', 'Phiếu xuất kho'],
    ['Đơn hàng', 'Đơn hàng'],
  ]) {
    const profiling = process.env.HD_MANAGER_ANDROID_PROFILE === '1' && button === 'Đơn hàng';
    if (profiling) {
      await send('Profiler.enable', {});
      await send('Profiler.start', {});
    }
    samples.push(await measure(button, '.hd-app-header .hd-header-title', title));
    if (profiling) {
      const { profile } = await send('Profiler.stop', {});
      const hot = profile.nodes
        .filter(node => node.hitCount > 0)
        .sort((left, right) => right.hitCount - left.hitCount)
        .slice(0, 30)
        .map(node => ({ function: node.callFrame.functionName, hits: node.hitCount, line: node.callFrame.lineNumber }));
      console.log('Android Orders CPU profile:', JSON.stringify(hot));
    }
    samples.push(await measure('Trang chủ', '.business-report-workspace'));
  }
  console.log(JSON.stringify({ device: 'emulator-5554', samples }));
  for (const sample of samples) {
    assert(sample.ms < limitMs, `${sample.screen} took ${sample.ms} ms (limit ${limitMs} ms)`);
  }
} finally {
  socket.close();
}
