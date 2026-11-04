import fs from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {chromiumLaunchOptions} from '../tests/helpers/chromium-launch-options.mjs';
import {dispatchTrustedTap,dispatchTrustedKeyPair} from './helpers/trusted-input-pair.mjs';
const label=process.argv[2];if(label&&!/^[a-z0-9-]+$/.test(label))throw Error('Invalid calibration label');
const out='test-results/performance-upgrade-20261103/tap-ack-desktop-calibration'+(label?'-'+label:'')+'.json';
try{await fs.access(out);throw Error('Preserve existing calibration')}catch(e){if(e.code!=='ENOENT')throw e}
const browser=await chromium.launch(chromiumLaunchOptions());
const result={at:new Date().toISOString(),status:'RUNNING',trials:[],productionRequests:0,conditions:'Desktop about:blank control only. Add150ms delay to HOST down-ACK resolution after Chromium has handled it; native timestamp/event order is untouched. Not Android compatibility or HDManager improvement.'};
try{
 const page=await browser.newPage({viewport:{width:400,height:400}});await page.setContent('<button style="position:absolute;left:20px;top:20px;width:200px;height:60px">Synthetic control</button><input style="position:absolute;left:20px;top:120px" value="">');
 await page.evaluate(()=>{window.samples=[];for(const name of['pointerdown','pointerup','click'])document.querySelector('button').addEventListener(name,e=>window.samples.push({name,at:performance.now(),trusted:e.isTrusted}));});
 const session=await page.context().newCDPSession(page);
 const delayed={send:async(method,args)=>{const value=await session.send(method,args);if(method==='Input.dispatchMouseEvent'&&args.type==='mousePressed')await new Promise(r=>setTimeout(r,150));return value}};
 for(const variant of['serial','paired','paired','serial','serial','paired']){
  await page.evaluate(()=>{window.samples=[]});
  if(variant==='serial'){await delayed.send('Input.dispatchMouseEvent',{type:'mousePressed',x:80,y:45,button:'left',clickCount:1});await delayed.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:80,y:45,button:'left',clickCount:1})}
  else await dispatchTrustedTap(delayed,{x:80,y:45});
  const events=await page.evaluate(()=>window.samples);if(events.map(e=>e.name).join(',')!=='pointerdown,pointerup,click'||events.some(e=>!e.trusted))throw Error('Browser did not preserve trusted event order');
  result.trials.push({variant,events,downUpGapMs:events[1].at-events[0].at});
 }
 await page.locator('input').fill('a');await page.locator('input').focus();await dispatchTrustedKeyPair(session,{key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});if(await page.locator('input').inputValue()!=='')throw Error('Key pair editing order failed');
 if(result.trials.filter(r=>r.variant==='serial').some(r=>r.downUpGapMs<140)||result.trials.filter(r=>r.variant==='paired').some(r=>r.downUpGapMs>100))throw Error('Host-delay calibration did not reproduce independently');
 result.status='HOST_ACK_DELAY_REPRODUCED_NOT_APP_BENEFIT';
}catch(e){result.status='FAILED';result.error=e.message;process.exitCode=1}
finally{await browser.close();result.endedAt=new Date().toISOString();await fs.writeFile(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result))}
