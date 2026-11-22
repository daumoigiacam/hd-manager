import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync} from 'fflate';
import {prepareShareEntries,createShareArchive,createShareProgress,webFileShare,nativeFileShare,deliverShareFiles,deliverShareText,isShareDismissed} from '../src/utils/shareDelivery.js';
const entries=Array.from({length:4},(_,i)=>({name:`đơn-đặt-trang-${i+1}.png`,blob:new Blob([Uint8Array.from([137,80,78,71,i,255,0])],{type:'image/png'})}));
test('per-page retry tracks distinct pages; downloading one never erases a complete prior handoff',()=>{
 const progress=createShareProgress(4);
 assert.deepEqual(progress({status:'shared'},[3]),{status:'partial',count:1,savedCount:0,expectedCount:4});
 assert.equal(progress({status:'shared'},[3]).count,1);
 assert.equal(progress({status:'downloaded'},[0,1,2]).status,'partial','mixed modes must not claim all files were shared');
 assert.equal(progress({status:'shared'},[0,1,2,3]).status,'shared');
 assert.equal(progress({status:'downloaded'},[3]).status,'shared','later download must preserve already complete handoff');
 const saved=createShareProgress(4);assert.equal(saved({status:'downloaded'},[0,1,2,3]).status,'downloaded');
});
test('four pages and UTF-8 filenames survive one archive byte-for-byte',async()=>{
 const zip=await createShareArchive(entries), restored=unzipSync(new Uint8Array(await zip.arrayBuffer()));
 assert.deepEqual(Object.keys(restored),entries.map(e=>e.name));
 for(const e of entries)assert.deepEqual(restored[e.name],new Uint8Array(await e.blob.arrayBuffer()));
 assert.equal(zip.type,'application/zip');
});
test('empty, missing, duplicate or unsafe page rejects before any handoff',async()=>{
 for(const value of [[],[entries[0],entries[0]],[{name:'../bad.png',blob:entries[0].blob}],[{name:'empty.png',blob:new Blob([])}]]){
  assert.throws(()=>prepareShareEntries(value));
  let sends=0;await assert.rejects(deliverShareFiles({entries:value},{present:()=>{sends++;}}));assert.equal(sends,0);
 }
});
test('Web sends all four files synchronously from the click, exactly once',async()=>{
 let called=false;const nav={canShare:({files})=>files.length===4,share:({files,text})=>{
  called=true;assert.equal(text,undefined);assert.deepEqual(files.map(f=>f.name),entries.map(e=>e.name));
  return Promise.all(files.map(async(f,i)=>assert.deepEqual(new Uint8Array(await f.arrayBuffer()),new Uint8Array(await entries[i].blob.arrayBuffer()))));
 }};
 const pending=webFileShare(entries,{title:'QA',text:'omit for batch'},nav);assert.equal(called,true);await pending;
});
test('unsupported multi-file browser never silently truncates pages',()=>{
 let sends=0;assert.throws(()=>webFileShare(entries,{}, {canShare:()=>false,share:()=>sends++}),/từng ảnh/);assert.equal(sends,0);
});
test('receiver error never triggers an automatic second share or downloads',async()=>{
 let sends=0;await assert.rejects(webFileShare(entries,{}, {canShare:()=>true,share:async()=>{sends++;throw Error('receiver accepted only two');}}));assert.equal(sends,1);
});
test('native serializes unique immutable files and sends one complete batch',async()=>{
 let pending=0,sends=0;const names=[];
 const ports={writeFile:async(name,blob)=>{assert.equal(pending++,0);await Promise.resolve();pending--;names.push(name);assert(blob.size);return{uri:'file:///'+name};},share:async({files})=>{sends++;assert.equal(files.length,4);assert.equal(new Set(files).size,4);}};
 await nativeFileShare(entries,{},ports);await nativeFileShare(entries,{},ports);
 assert.equal(sends,2);assert.equal(new Set(names).size,8);
});
test('native preparation failure at any page sends nothing',async()=>{
 for(let fail=0;fail<4;fail++){
  let writes=0,sends=0;await assert.rejects(nativeFileShare(entries,{}, {writeFile:async()=>{if(writes++===fail)throw Error('storage full');return{uri:'file:///'+writes};},share:()=>sends++}));assert.equal(sends,0);
 }
 await assert.rejects(nativeFileShare(entries,{}, {writeFile:async()=>({uri:'same'}),share:()=>assert.fail()}),/Chưa gửi/);
});
test('native receiver error opens recovery with all pages without automatic resend',async()=>{
 let sends=0,saves=0,presents=0;const result=await deliverShareFiles({entries},{platform:'android',canShare:async()=>({value:true}),writeFile:async name=>({uri:'file:///'+name}),share:async()=>{sends++;throw Error('target failed');},saveFile:()=>saves++,
 present:async options=>{presents++;assert.equal(options.entries.length,4);assert.match(options.initialError,/chưa hoàn tất/);return{status:'cancelled'};}});
 assert.equal(result.status,'cancelled');assert.deepEqual([sends,saves,presents],[1,0,1]);
});
test('cancellation does not download, retry or mark native share completed',async()=>{
 const result=await deliverShareFiles({entries},{platform:'android',canShare:async()=>({value:true}),writeFile:async name=>({uri:'file:///'+name}),share:async()=>{throw Object.assign(Error('cancelled'),{name:'AbortError'});},present:()=>assert.fail()});assert.equal(result.status,'cancelled');
 assert.equal(isShareDismissed({name:'DataError',message:'file transfer failed'}),false);
});
test('Web preview waits for fresh gesture and prevents concurrent actions',async()=>{
 let finish;const first=deliverShareFiles({entries},{platform:'web',present:options=>{assert.equal(options.entries.length,4);return new Promise(r=>finish=r);}});
 const second=await deliverShareFiles({entries},{present:()=>assert.fail()});assert.equal(second.status,'busy');finish({status:'cancelled'});await first;
 const next=await deliverShareFiles({entries},{platform:'web',present:()=>({status:'cancelled'})});assert.equal(next.status,'cancelled');
});
test('text invokes browser share without awaiting Capacitor Web proxy',async()=>{
 let sends=0;const result=await deliverShareText({title:'QA',text:'synthetic'}, {platform:'web',navigator:{share:()=>{sends++;return Promise.resolve();}},canShare:()=>assert.fail()});assert.equal(result.status,'shared');assert.equal(sends,1);
});
test('expired activation or ambiguous text failure requires explicit fresh gesture',async()=>{
 for(const active of [false,true]){
  let sends=0,presents=0;const result=await deliverShareText({text:'synthetic'}, {platform:'web',navigator:{userActivation:{isActive:active},share:async()=>{sends++;throw Error('receiver failed');}},present:async({text})=>{presents++;assert.equal(text,'synthetic');return{status:'cancelled'};}});
  assert.equal(result.status,'cancelled');assert.equal(sends,active?1:0);assert.equal(presents,1);
 }
});
