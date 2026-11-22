import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {appFunction} from './helpers/app-source-function.mjs';
import {shareDispatchSheet} from '../src/features/warehouse/shareDispatchSheet.js';

test('past-date order sheet filename matches the selected business date',()=>{
 const filename=appFunction('buildOrderRequestSheetFilename',{requestFilterDate:'2026-11-21',getTodayString:()=> '2026-11-22'},{scope:'OrderRequestView'});
 assert.equal(filename(),'bang-don-dat-hang-2026-11-21');
});

test('invoice, QR, price table, delivery images and backup files use the same delivery gate',async()=>{
 const calls=[];
 const shareBlobFile=appFunction('shareBlobFile',{
  deliverShareFiles:async(options,ports)=>{calls.push(options);assert.equal(ports.platform,'web');assert.equal(typeof ports.writeFile,'function');return{status:'cancelled'};},
  Capacitor:{getPlatform:()=> 'web'},CapacitorShare:{canShare:async()=>({value:true}),share:()=>assert.fail()},writeBlobToShareCache:()=>assert.fail(),saveBlobFile:()=>assert.fail(),
 });
 for(const name of ['invoice.png','payment-qr.png','employee-bank-qr.png','price-table.png','delivery.png']){
  const blob=new Blob([name],{type:'image/png'});assert.equal((await shareBlobFile({filename:name,blob,title:name})).status,'cancelled');assert.equal(calls.at(-1).entries[0].blob,blob);
 }
 const content=appFunction('shareContentFile',{shareBlobFile,Blob});
 for(const [filename,mimeType] of [['backup.json','application/json'],['report.csv','text/csv'],['statement.txt','text/plain']]){
  await content({filename,mimeType,content:'synthetic'});const entry=calls.at(-1).entries[0];assert.equal(entry.name,filename);assert.equal(await entry.blob.text(),'synthetic');assert.equal(entry.blob.type,mimeType);
 }
 assert.equal(calls.length,8);
});
test('warehouse four-page export uses one complete delivery and never loops downloads',async()=>{
 let sends=0;const canvases=[],errors=[],lock={current:false};
 const rows=[1,2,3,4];await shareDispatchSheet(rows,'2026-11-22',{
  lock,canShare:true,setDispatchActionError:e=>errors.push(e),setIsDispatchExporting:()=>{},splitDispatchSharePages:r=>r.map(x=>[x]),
  renderDispatchSheetCanvas:async r=>{const c={width:100,height:100,row:r[0]};canvases.push(c);return c;},canvasToBlob:async c=>new Blob(['page'+c.row],{type:'image/png'}),buildDispatchSheetFilename:()=> 'dispatch',
  shareBlobFile:async({entries})=>{sends++;assert.equal(entries.length,4);assert.deepEqual(await Promise.all(entries.map(e=>e.blob.text())),['page1','page2','page3','page4']);return{status:'partial',count:1,expectedCount:4};},
  isShareCancelled:()=>false,getFriendlyFirebaseErrorMessage:e=>e.message,
 });
 assert.equal(sends,1);assert.equal(lock.current,false);assert(canvases.every(c=>c.width===0&&c.height===0));assert.match(errors.at(-1),/1\/4/);
});
test('all actual browser/native send calls live in the audited transport utility',()=>{
 const root=new URL('../development/hd-manager/application/src/',import.meta.url),direct=[];
 function visit(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=new URL(item.name+(item.isDirectory()?'/':''),dir);if(item.isDirectory())visit(file);else if(/\.(jsx?|tsx?)$/.test(item.name)){
  const source=fs.readFileSync(file,'utf8');if(/navigator\.share\(|CapacitorShare\.share\(/.test(source))direct.push(file.pathname.slice(root.pathname.length));
 }}}
 visit(root);
 assert.deepEqual(direct.sort(),['App.jsx','features/customers/productCRMShared.jsx','utils/shareDelivery.js']);
 assert.match(fs.readFileSync(new URL('App.jsx',root),'utf8'),/share: options => CapacitorShare\.share\(options\)/);
 assert.match(fs.readFileSync(new URL('features/customers/productCRMShared.jsx',root),'utf8'),/deliverShareText\(/);
});
