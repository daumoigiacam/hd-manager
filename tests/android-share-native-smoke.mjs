import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { setTimeout as poll } from 'node:timers/promises';

const serial = process.env.HD_MANAGER_ANDROID_SERIAL || 'emulator-5554';
assert.match(serial, /^emulator-\d+$/, 'Native smoke tests may only target an emulator');
const packageName = process.env.HD_MANAGER_NATIVE_PACKAGE || 'com.hdmanager.app';
assert.match(packageName, /^[a-zA-Z][\w.]+$/);
const adb = (...args) => execFileSync(process.env.HD_MANAGER_ADB || 'adb', ['-s', serial, ...args], { encoding: 'utf8' }).trim();
const pid = adb('shell', 'pidof', packageName);
assert.ok(pid, 'HD Manager must be open on an Android emulator.');
const port = adb('forward', 'tcp:0', `localabstract:webview_devtools_remote_${pid}`);

const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json())
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
  const { resolve, reject, timeout } = pending.get(message.id);
  pending.delete(message.id);
  clearTimeout(timeout);
  if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
  else resolve(message.result?.result?.value);
});
const evaluate = (expression) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timeout = setTimeout(() => {
    pending.delete(id);
    reject(new Error('Native share WebView command did not respond.'));
  }, 10000);
  pending.set(id, { resolve, reject, timeout });
  socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

const chooserHasFocus = () => /mCurrentFocus=.*(?:ChooserActivity|ResolverActivity)/
  .test(adb('shell', 'dumpsys', 'window'));
const waitForChooser = async (name) => {
  const deadline = Date.now() + 10000;
  do {
    if (chooserHasFocus()) {
      // A task record exists before the chooser can receive the Back command.
      adb('shell', 'uiautomator', 'dump', '/sdcard/hd-manager-share-smoke.xml');
      const hierarchy = adb('shell', 'cat', '/sdcard/hd-manager-share-smoke.xml');
      if (/package="com\.android\.(?:intentresolver|internal)/.test(hierarchy) && chooserHasFocus()) return;
    }
    await poll(50);
  } while (Date.now() < deadline);
  assert.fail(`Android share chooser did not become interactive for ${name}.`);
};

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
    await waitForChooser(item.name);
    adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
    const deadline = Date.now() + 10000;
    let outcome;
    do {
      outcome = JSON.parse(await evaluate('JSON.stringify(window.__nativeShareSmoke)'));
      if (outcome.status !== 'pending') break;
      await poll(50);
    } while (Date.now() < deadline);
    assert.equal(outcome.status, 'rejected', `${item.name} chooser cancellation must not count as a completed share.`);
    assert.match(outcome.message, /cancel|abort/i);
    if (item.path) await evaluate(`window.Capacitor.Plugins.Filesystem.deleteFile({ path: ${JSON.stringify(item.path)}, directory: 'CACHE' })`);
  }
  console.log('Android native share: PNG, CSV and text opened the chooser; each was cancelled without sending.');
} finally {
  for (const { timeout, reject } of pending.values()) {
    clearTimeout(timeout);
    reject(new Error('Native share test closed.'));
  }
  socket.close();
  adb('forward', '--remove', `tcp:${port}`);
  adb('shell', 'rm', '-f', '/sdcard/hd-manager-share-smoke.xml');
}
