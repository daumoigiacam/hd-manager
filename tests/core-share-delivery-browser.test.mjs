import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import {unzipSync} from 'fflate';

test('share dialog preserves four images through target failure, explicit retry and one ZIP download',async()=>{
 const compiled=await build({entryPoints:['tests/fixtures/share-delivery.browser.js'],bundle:true,write:false,outfile:'fixture.js',format:'iife'});
 const js=compiled.outputFiles.find(f=>f.path.endsWith('.js')).text,css=compiled.outputFiles.find(f=>f.path.endsWith('.css')).text;
 const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':req.url==='/fixture.css'?'text/css':'text/html');res.end(req.url==='/fixture.js'?js:req.url==='/fixture.css'?css:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.selectOption('#mode','partial');await page.getByRole('button',{name:'Chuẩn bị 4 ảnh đơn đặt',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.locator('img').count(),4);
  await dialog.getByRole('button',{name:'Chia sẻ toàn bộ (4 tệp)',exact:true}).click();await page.getByText(/Ứng dụng nhận lỗi sau 2 ảnh/).waitFor();
  assert.equal((await page.locator('#events').innerText()).split('\n').filter(x=>x.includes('"call"')).length,1);
  await dialog.getByRole('button',{name:'Chia sẻ tệp 4',exact:true}).click();await page.getByText(/Ứng dụng nhận lỗi sau 2 ảnh/).waitFor();
  const calls=(await page.locator('#events').innerText()).trim().split('\n').map(JSON.parse);assert.deepEqual(calls.map(v=>v.count),[4,1]);assert(calls.every(v=>v.active));assert.match(calls[1].names[0],/4\.png$/);
  const downloadEvent=page.waitForEvent('download');await dialog.getByRole('button',{name:'Tải trọn bộ 4 tệp (ZIP)',exact:true}).click();
  const download=await downloadEvent,bytes=await fs.readFile(await download.path()),archive=unzipSync(bytes);assert.equal(Object.keys(archive).length,4);for(const value of Object.values(archive))assert.deepEqual([...value.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  await dialog.getByRole('button',{name:'Xong / Đóng'}).click();await page.getByText('Kết quả: downloaded',{exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.selectOption('#mode','unsupported');await page.getByRole('button',{name:'Chuẩn bị 4 ảnh đơn đặt',exact:true}).click();await dialog.waitFor();
  await dialog.getByRole('button',{name:'Chia sẻ toàn bộ (4 tệp)',exact:true}).click();await page.getByText(/Thiết bị không nhận bộ tệp/).waitFor();
  await dialog.getByRole('button',{name:'Chia sẻ tệp 4',exact:true}).click();await page.getByText(/Đã chuyển 1 tệp/).waitFor();
  await dialog.getByRole('button',{name:'Xong / Đóng'}).click();await page.getByText('Kết quả: partial',{exact:true}).waitFor();
  await page.selectOption('#mode','cancel');await page.getByRole('button',{name:'Hóa đơn / QR / giao hàng (1 ảnh)',exact:true}).click();await dialog.waitFor();
  await dialog.getByRole('button',{name:'Chia sẻ toàn bộ (1 tệp)',exact:true}).click();await page.getByText(/Đã đóng hộp chia sẻ/).waitFor();await dialog.getByRole('button',{name:'Xong / Đóng'}).click();await page.getByText('Kết quả: cancelled',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Công nợ / báo giá / báo cáo (chữ)',exact:true}).click();await dialog.waitFor();await dialog.getByRole('button',{name:'Sao chép nội dung',exact:true}).click();await page.getByText(/Đã sao chép nội dung/).waitFor();await dialog.getByRole('button',{name:'Xong / Đóng'}).click();await page.getByText('Kết quả: copied',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
