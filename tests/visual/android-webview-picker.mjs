import assert from 'node:assert/strict';

const endpoint = process.env.HD_MANAGER_ANDROID_CDP || 'http://127.0.0.1:9223';
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
  }, 10000);
  pending.set(id, { resolve, reject, timer });
  socket.send(JSON.stringify({ id, method, params }));
});

const findButton = async (predicate) => {
  const expression = `(() => {
    const button = [...document.querySelectorAll('button')].find(${predicate});
    if (!button) return null;
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: button.textContent.trim() };
  })()`;
  const response = await send('Runtime.evaluate', { expression, returnByValue: true });
  return response?.result?.value;
};

const tap = async ({ x, y }) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

try {
  await send('Runtime.enable', {});
  const avatar = await findButton('(item) => item.getAttribute("aria-label") === "Hồ sơ của tôi" && item.getClientRects().length');
  assert(avatar, 'Profile avatar is not available');
  await tap(avatar);
  await new Promise(resolve => setTimeout(resolve, 600));
  const chooseImage = await findButton('(item) => item.textContent.trim() === "Chọn ảnh" && item.getClientRects().length');
  assert(chooseImage, 'Profile image picker button is not available');
  await tap(chooseImage);
  console.log(JSON.stringify({ profileOpened: true, pickerRequested: true, noProfileSave: true }));
} finally {
  socket.close();
}
