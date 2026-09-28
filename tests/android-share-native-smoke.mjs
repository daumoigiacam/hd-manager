import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', 'com.hdmanager.app');
assert.ok(pid, 'HD Manager must be open on an Android emulator.');
adb('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`);

const target = (await (await fetch('http://127.0.0.1:9222/json')).json())
  .find((item) => item.type === 'page' && item.url.startsWith('https://localhost/'));
assert.ok(target, 'The app WebView must expose a debug page.');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
  else resolve(message.result?.result?.value);
});
const evaluate = (expression) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

const png = new PNG({ width: 20, height: 20 });
png.data.fill(255);
const cases = [
  { name: 'PNG', path: 'HDManagerShare/native-share-smoke.png', data: PNG.sync.write(png).toString('base64') },
  { name: 'CSV', path: 'HDManagerShare/native-share-smoke.csv', data: Buffer.from('name,amount\nTest,123\n').toString('base64') },
  { name: 'text', text: 'HD Manager native share smoke' }
];
try {
  for (const item of cases) {
    const result = await evaluate(`(async () => {
      const filesystem = window.Capacitor.Plugins.Filesystem;
      const share = window.Capacitor.Plugins.Share;
      let options = { title: 'Kiểm tra chia sẻ', dialogTitle: 'Kiểm tra chia sẻ' };
      if (${Boolean(item.path)}) {
        const path = ${JSON.stringify(item.path || '')};
        await filesystem.writeFile({ path, data: ${JSON.stringify(item.data || '')}, directory: 'CACHE', recursive: true });
        const { uri } = await filesystem.getUri({ path, directory: 'CACHE' });
        options = { ...options, files: [uri] };
      } else {
        options = { ...options, text: ${JSON.stringify(item.text || '')} };
      }
      window.__nativeShareSmoke = { status: 'pending' };
      share.share(options)
        .then(() => { window.__nativeShareSmoke.status = 'shared'; })
        .catch((error) => { window.__nativeShareSmoke = { status: 'rejected', message: error.message }; });
      return options.files?.[0] || 'text';
    })()`);
    if (item.path) assert.match(result, /^file:\/\//);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const activities = adb('shell', 'dumpsys', 'activity', 'activities');
    assert.match(activities, /ChooserActivity|ResolverActivity/, `Android share chooser should be visible for ${item.name}.`);
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    await new Promise((resolve) => setTimeout(resolve, 500));
    const outcome = JSON.parse(await evaluate('JSON.stringify(window.__nativeShareSmoke)'));
    assert.equal(outcome.status, 'rejected', `${item.name} chooser cancellation must not count as a completed share.`);
    assert.match(outcome.message, /cancel|abort/i);
    if (item.path) await evaluate(`window.Capacitor.Plugins.Filesystem.deleteFile({ path: ${JSON.stringify(item.path)}, directory: 'CACHE' })`);
  }
  console.log('Android native share: PNG, CSV and text opened the chooser; each was cancelled without sending.');
} finally {
  socket.close();
  adb('forward', '--remove', 'tcp:9222');
}
