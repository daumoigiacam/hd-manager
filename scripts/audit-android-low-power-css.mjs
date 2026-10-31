import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { connectAndroidWebView } from './helpers/android-webview-cdp.mjs';

const output = process.env.HD_LOWPOWER_CSS_OUTPUT;
assert.ok(output, 'Set HD_LOWPOWER_CSS_OUTPUT');
const inject = process.env.HD_LOWPOWER_CSS_INJECT === 'true';
const source = await fs.readFile('src/index.css', 'utf8');
const start = source.indexOf('/* Legacy WebView power guard:');
const endMarker = '/* End legacy WebView power guard. */';
const end = source.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start);
const css = source.slice(start, end + endMarker.length);
assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /@import|url\(|:where\(|:is\(/);
const cdp = await connectAndroidWebView({ adb: 'D:/HD-DEV/android/sdk/platform-tools/adb.exe', serial: 'emulator-5554', packageName: 'com.hdmanager.app.acceptance', enableRuntime: false });
try {
  const result = await cdp.evaluate(`(function(){
    var root=document.documentElement, host=document.createElement('div'), base=document.createElement('style'), patch=null;
    var wasLow=root.classList.contains('hd-low-power-ui');
    var actual=document.querySelector('.premium-orders-module');
    function appearance(el){var s=getComputedStyle(el);return {animationName:s.animationName,animationDuration:s.animationDuration,backdropFilter:s.backdropFilter||s.webkitBackdropFilter||'unsupported',transform:s.transform}}
    var before=actual?appearance(actual):null;
    host.style.cssText='position:fixed;left:-10000px;top:0;width:20px;height:20px;pointer-events:none';
    host.className='hd-enterprise-app-shell';
    host.innerHTML='<div class="animate-in fade-in"><span class="hd-css-probe-spinner"></span></div><div class="hd-ds-dialog-layer"><div class="hd-ds-dialog"></div></div><div class="hd-dashboard-dialog-layer"><div class="hd-dashboard-dialog"></div></div>';
    base.textContent='@keyframes hd-css-probe-spin{to{transform:rotate(360deg)}}.hd-css-probe-spinner{display:block;animation:hd-css-probe-spin 1s linear infinite}';
    document.head.appendChild(base);document.body.appendChild(host);
    var parser=document.createElement('style');parser.textContent='.hd-css-selector-probe :where(span){--hd-css-probe:1}';document.head.appendChild(parser);
    var whereRules=parser.sheet.cssRules.length;parser.remove();
    try{
      root.classList.add('hd-low-power-ui');
      if(${inject}){patch=document.createElement('style');patch.textContent=${JSON.stringify(css)};document.head.appendChild(patch)}
      var entrance=appearance(host.querySelector('.animate-in'));
      var spinner=appearance(host.querySelector('.hd-css-probe-spinner'));
      var dialogs=Array.prototype.map.call(host.querySelectorAll('.hd-ds-dialog-layer,.hd-ds-dialog,.hd-dashboard-dialog-layer,.hd-dashboard-dialog'),appearance);
      var lowActual=actual?appearance(actual):null;
      root.classList.remove('hd-low-power-ui');
      var ordinaryEntrance=appearance(host.querySelector('.animate-in'));
      return {origin:performance.timeOrigin,hadLowPowerFlag:wasLow,whereRules:whereRules,injected:${inject},beforeActual:before,lowPowerActual:lowActual,entrance:entrance,spinner:spinner,dialogs:dialogs,ordinaryEntrance:ordinaryEntrance};
    }finally{if(wasLow)root.classList.add('hd-low-power-ui');else root.classList.remove('hd-low-power-ui');if(patch)patch.remove();host.remove();base.remove()}
  })()`);
  assert.equal(result.entrance.animationName, 'none');
  assert.equal(result.spinner.animationName, 'hd-css-probe-spin');
  for (const dialog of result.dialogs) assert.equal(dialog.animationName, 'none');
  assert.notEqual(result.ordinaryEntrance.animationName, 'none');
  if (result.lowPowerActual) assert.equal(result.lowPowerActual.animationName, 'none');
  await fs.mkdir(output, { recursive: true });
  const record = { at: new Date(), status: 'PASS_STYLE_COMPATIBILITY_ONLY', ...result,
    cssSourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    guardSha256: crypto.createHash('sha256').update(css).digest('hex'),
    scope: 'Computed CSS on actual Acceptance WebView, isolated fixture and current Orders surface if present. Temporarily toggles low-power flag; optional bounded local CSS injection, restored in finally. Preserves progress animation and ordinary mode. Not a latency, full APK or all-device acceptance.' };
  await fs.writeFile(output + '/result.json', JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
} finally { cdp.close(); }
