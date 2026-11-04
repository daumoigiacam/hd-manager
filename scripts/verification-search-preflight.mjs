import fs from 'node:fs/promises';
import {connectAndroidWebView} from './helpers/android-webview-cdp.mjs';
const c=await connectAndroidWebView({adb:'D:/HD-DEV/android/sdk/platform-tools/adb.exe',serial:'emulator-5554',packageName:'com.hdmanager.caplab.diag',port:9240});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function press(expression){
 const point=await c.evaluate(`(()=>{const e=${expression};if(!e||!e.getClientRects().length)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 if(!point)return false;
 await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});return true;
}
const button=label=>`Array.from(document.querySelectorAll('button')).find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(label)})`;
const rows=[];
try{
 for(const label of ['Khách hàng','Kho sản phẩm']){
  await press(button('Thêm'));await wait(500);const clicked=await press(button(label));await wait(1000);
  const inspect=()=>c.evaluate(`(()=>{const m=document.querySelector('main[data-hd-module]');return{module:m&&m.getAttribute('data-hd-module'),buttons:Array.from(document.querySelectorAll('button')).filter(e=>e.getClientRects().length).map(e=>({aria:e.getAttribute('aria-label'),title:e.title,text:e.textContent.trim().slice(0,30)})),inputs:Array.from(document.querySelectorAll('input')).filter(e=>e.getClientRects().length).map(e=>({type:e.type,placeholder:e.placeholder,aria:e.getAttribute('aria-label')}))}})()`);
  const before=await inspect();const opened=await press(`document.querySelector('button[aria-label="Tìm kiếm"]')`);await wait(400);const after=await inspect();rows.push({label,clicked,opened,before,after});
 }
 await press(button('Trang chủ'));await wait(500);
 await fs.writeFile('test-results/phase2-verification-20261102/search-control-preflight.json',JSON.stringify({at:new Date().toISOString(),scope:'Control availability only, not a performance benchmark',rows},null,2));
 console.log(JSON.stringify(rows));
}finally{c.close()}
