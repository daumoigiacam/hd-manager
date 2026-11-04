import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
import {dispatchTrustedTap,assertNativeTapProtocolProof} from './helpers/trusted-input-pair.mjs';
import {armUiTiming} from './helpers/prearmed-ui-timing.mjs';
const root='test-results/performance-upgrade-20261103',out=root+'/home-warm-navigation-v5-20261104.json';
try{await fs.access(out);throw Error('Preserve prior observation')}catch(error){if(error.code!=='ENOENT')throw error}
assertNativeTapProtocolProof(JSON.parse(await fs.readFile(root+'/native-tap-ack-after-listener-scope-protocol-01.json')));
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9251});
const r={at:new Date().toISOString(),status:'RUNNING',qualification:'Warm already-initialized Home UI only, unchanged fictional data. Does NOT prove source revalidation freshness, cold data, production latency or all-device performance. Source confirmations may retain prior committed readiness on reopen; this is explicitly not fresh-read acceptance.',home:[],customer:[],errors:[],productionRequests:0};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression){const end=Date.now()+30000;while(Date.now()<end){if(await c.evaluate(expression))return;await wait(30)}throw Error('Warm UI wait timeout')}
async function press(selector){const point=await c.evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||!e.getClientRects().length)return null;const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);if(!point)throw Error('Missing warm navigation control '+selector);await dispatchTrustedTap(c,point)}
async function measured(module,selector){await c.evaluate(`(${armUiTiming.toString()})(${JSON.stringify({kind:'navigation',module,selector})})`);await press(selector);return c.evaluate('window.__upgradeArmedPromise')}
try{
 if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly)'))throw Error('Not synthetic APK');
 r.before=await c.evaluate('({heap:performance.memory?performance.memory.usedJSHeapSize:null,longTasks:window.__hdVerification.longTaskTotal})');
 r.oracle=await c.evaluate("Array.from(document.querySelectorAll('.business-report-kpi')).map(function(e){return e.title})");if(r.oracle.length!==4)throw Error('Home financial cards missing');
 for(let i=0;i<21;i++){
  await press('button[aria-label="Thêm"]');await until('Boolean(document.querySelector("button[data-hd-more-module=customers]"))');
  const customer=await measured('customers','button[data-hd-more-module="customers"]');
  const home=await measured('home','button[aria-label="Trang chủ"]');
  const kpis=await c.evaluate("Array.from(document.querySelectorAll('.business-report-kpi')).map(function(e){return e.title})");if(JSON.stringify(kpis)!==JSON.stringify(r.oracle))throw Error('Warm financial values changed');
  if(i===0)r.prime={customer,home};else{r.customer.push(customer);r.home.push(home)}
  await fs.writeFile(out,JSON.stringify(r,null,2));
 }
 r.after=await c.evaluate('({heap:performance.memory?performance.memory.usedJSHeapSize:null,longTasks:window.__hdVerification.longTaskTotal,errors:window.__hdVerification.errors,rejections:window.__hdVerification.rejections})');
 const summary=rows=>{const a=rows.map(x=>x.ms).sort((a,b)=>a-b);return{n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)}};
 r.summary={home:summary(r.home),customer:summary(r.customer)};r.status='WARM_UI_OBSERVED_NOT_GLOBAL_ACCEPTANCE';
}catch(error){r.status='FAILED';r.errors.push(error.message);process.exitCode=1}finally{try{await c.evaluate('if(window.__upgradeArmedAbort)window.__upgradeArmedAbort()')}catch{}c.close();r.endedAt=new Date().toISOString();await fs.writeFile(out,JSON.stringify(r,null,2));console.log(JSON.stringify({status:r.status,summary:r.summary,errors:r.errors}))}
