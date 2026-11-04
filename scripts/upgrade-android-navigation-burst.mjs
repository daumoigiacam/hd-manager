import fs from'node:fs/promises';
import{connectAndroidWebView}from'./helpers/android-webview-cdp.mjs';
import{assertNoActiveUpgradeSoak}from'./helpers/upgrade-observation-barrier.mjs';
await assertNoActiveUpgradeSoak();
const root='test-results/performance-upgrade-20261103',c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9254});
const result={at:new Date().toISOString(),status:'RUNNING',productionRequests:0,taps:[],errors:[],conditions:'Separate synthetic Android10/WebView74 rapid navigation/cancellation stress, not isolated latency acceptance. 30 trusted CDP pointer taps with 120ms requested gap AFTER acknowledgement; actual injection spacing retained. No data mutation, profiler, GC or reinstall by this script.'};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try{
 const remote=c.shell('shell','pm','path','com.hdmanager.caplab.diag').trim().replace(/^package:/,'');if(!remote.startsWith('/data/app/')||!remote.includes('com.hdmanager.caplab.diag')||!remote.endsWith('/base.apk'))throw Error('Unexpected fixture package');result.apkSha256=c.shell('shell','sha256sum',remote).trim().split(/\s+/)[0];
 if(!await c.evaluate('Boolean(window.__hdVerification&&window.__hdVerification.fixtureOnly&&document.querySelector("main[data-hd-module]"))'))throw Error('Require authenticated synthetic employee test view');
 await c.evaluate(`(function(){window.__navigationBurst={origin:performance.timeOrigin,events:[],startedAt:performance.now()};var s=window.__navigationBurst;s.handler=function(e){if(!e.isTrusted)return;var b=e.target.closest('button[aria-label]');if(!b||!b.closest('.hd-bottom-navigation'))return;var at=performance.now(),label=b.getAttribute('aria-label');requestAnimationFrame(function(){requestAnimationFrame(function(){var m=document.querySelector('main[data-hd-module]');s.events.push({at:at,feedbackMs:performance.now()-at,label:label,module:m&&m.getAttribute('data-hd-module')})})})};document.addEventListener('pointerdown',s.handler,true)})()`);
 result.before={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};
 const labels=['Đặt hàng','Xuất kho','Đơn hàng','Thêm','Trang chủ'];
 for(let index=0;index<30;index++){
  const label=labels[index%labels.length],point=await c.evaluate(`(function(){var e=Array.from(document.querySelectorAll('.hd-bottom-navigation button')).find(function(e){return e.getAttribute('aria-label')===${JSON.stringify(label)}&&!e.disabled&&e.getClientRects().length});if(!e)return null;var r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return h&&(h===e||e.contains(h))?{x:x,y:y,at:performance.now()}:null})()`);
  if(!point)throw Error('Footer target unavailable: '+label);const{x,y,at}=point;
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
  result.taps.push({index,label,preparedAt:at});await wait(120);
 }
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){if(await c.evaluate(`(function(){var m=document.querySelector('main[data-hd-module=home]');return Boolean(m&&window.__navigationBurst.events.length===30&&window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m))})()`))break;await wait(100)}
 result.final=await c.evaluate(`(function(){var s=window.__navigationBurst,m=document.querySelector('main[data-hd-module]'),p=window.__hdVerification;return{events:s.events,documentReloaded:performance.timeOrigin!==s.origin,module:m&&m.getAttribute('data-hd-module'),sourceReady:Boolean(m&&window.__hdSourceContract(m,'home',window.__hdPlans).sourcesReady&&!window.__hdModulePending(m)),jsErrors:p.errors,rejections:p.rejections,workersCreated:p.workersCreated,workersTerminated:p.workersTerminated}})()`);
 result.after={heap:await c.send('Runtime.getHeapUsage'),dom:await c.send('Memory.getDOMCounters')};
 if(result.final.documentReloaded||result.final.module!=='home'||!result.final.sourceReady||result.final.jsErrors.length||result.final.rejections||result.final.events.length!==30)throw Error('Rapid navigation did not preserve final route/readiness or runtime correctness');
 const a=result.final.events.map(e=>e.feedbackMs).sort((a,b)=>a-b);result.feedback={n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1)};result.status='RAPID_NAVIGATION_OBSERVED_NOT_SPEED_ACCEPTANCE';
}catch(error){result.status='FAILED';result.errors.push(error.message);process.exitCode=1}
finally{try{await c.evaluate('if(window.__navigationBurst)document.removeEventListener("pointerdown",window.__navigationBurst.handler,true)')}catch{}c.close();result.endedAt=new Date().toISOString();await fs.writeFile(`${root}/android-navigation-burst-${Date.now()}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
