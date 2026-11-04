import test from 'node:test';import assert from 'node:assert/strict';
import {findOwnedWebViewRendererPids} from '../scripts/helpers/android-renderer-ownership.mjs';
test('renderer RSS attribution requires both the exact service package and the current native client PID',()=>{
 const text=`ACTIVITY MANAGER SERVICES
  * ServiceRecord{abc u0 com.hdmanager.app.acceptance/org.chromium.content.app.SandboxedProcessService0}
    app=ProcessRecord{xyz 6844:com.google.android.webview:sandboxed_process0/u0a148i93}
    * Client AppBindRecord{foo ProcessRecord{bar 6802:com.hdmanager.app.acceptance/u0a148}}
  * ServiceRecord{other u0 com.other.app/org.chromium.content.app.SandboxedProcessService0}
    app=ProcessRecord{xyz 481:com.google.android.webview:sandboxed_process0/u0a150i90}
    * Client AppBindRecord{foo ProcessRecord{bar 6000:com.other.app/u0a150}}
 `;
 assert.deepEqual(findOwnedWebViewRendererPids(text,'com.hdmanager.app.acceptance',6802),[6844]);
 assert.deepEqual(findOwnedWebViewRendererPids(text,'com.hdmanager.app.acceptance',6803),[]);
 assert.deepEqual(findOwnedWebViewRendererPids(text.replace('com.hdmanager.app.acceptance/org.','com.hdmanager.app.acceptance-other/org.'),'com.hdmanager.app.acceptance',6802),[]);
});
