import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Execute installed SDK bodies, not a reimplementation of callback ownership.
// The map exposure exists only in this test VM, never in packaged runtime.
export function installedBridge(transform = value => value) {
  const bridge = transform(fs.readFileSync('node_modules/@capacitor/android/capacitor/src/main/assets/native-bridge.js', 'utf8'));
  const start = bridge.indexOf('function initNativeBridge(win) {');
  const end = bridge.indexOf('\n        initNativeBridge(w);', start);
  assert.ok(start > 0 && end > start);
  const calls = [];
  const win = {console, androidBridge: {postMessage: text => calls.push(JSON.parse(text))},Capacitor:{PluginHeaders:[{name:'App',methods:[{name:'addListener',rtype:'callback'},{name:'removeListener',rtype:'callback'},{name:'getInfo',rtype:'promise'}]}]}};
  const noOp = () => {};
  Object.assign(win,{window: win, getPlatformId: () => 'android',
    convertFileSrcServerUrl: noOp, initLogger: noOp, initEvents: noOp,
    initLegacyHandlers: noOp, initVendor: noOp, dummy: noOp, CapacitorException: Error});
  const context = vm.createContext(win);
  vm.runInContext(bridge.slice(start, end).replace('const callbacks = new Map();',
    'const callbacks = new Map(); win.testCallbacks = callbacks;') + '\ninitNativeBridge(window);', context);
  const core = fs.readFileSync('node_modules/@capacitor/core/dist/index.js', 'utf8');
  const endExports = core.lastIndexOf('\nexport {');
  assert.ok(endExports > 0);
  vm.runInContext(core.slice(0,endExports) + '\nwindow.testRegister = registerPlugin;', context);
  return {calls, callbacks: win.testCallbacks, plugin:win.testRegister('App'), cap:win.Capacitor,win};
}
