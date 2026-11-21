import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '@babel/parser';
const source=readFileSync(new URL('../src/features/legacy/OrderManagementView.jsx',import.meta.url),'utf8');let handler;
function walk(node){if(!node||typeof node!=='object')return;if(node.type==='VariableDeclarator'&&node.id?.name==='handleArchiveOrder')handler=node.init;
  for(const[key,value]of Object.entries(node)){if(['loc','extra','comments'].includes(key))continue;if(Array.isArray(value))value.forEach(walk);else if(value?.type)walk(value);}}
walk(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(handler);
function fixture(save){
  const f={ids:[],error:'',calls:0};const env={archiveScope:'current',archiveScopeRef:{current:'current'},archiveMountedRef:{current:true},archiveInFlightRef:{current:new Set()},canDeleteOrder:true,
    setArchivingOrderIds:update=>{f.ids=update(f.ids);},setArchiveError:value=>{f.error=value;},getFriendlyFirebaseErrorMessage:error=>error.message,
    onDeleteOrder:async id=>{f.calls++;return save(id);}};
  f.env=env;f.run=()=>Function(...Object.keys(env),'return ('+source.slice(handler.start,handler.end)+');')(...Object.values(env));return f;
}
test('actual archive UI serializes duplicate clicks and surfaces failed server acknowledgement on the visible list',async()=>{
  let reject;const f=fixture(()=>new Promise((_resolve,no)=>{reject=no;})),run=f.run();const pending=run('order');await run('order');
  assert.equal(f.calls,1);assert.deepEqual(f.ids,['order']);reject(Error('Archive rejected'));await pending;
  assert.equal(f.error,'Archive rejected');assert.deepEqual(f.ids,[]);assert.equal(f.env.archiveInFlightRef.current.size,0);
  assert.match(source,/archiveError&&<p role="alert"/);assert.doesNotMatch(source,/Xóa vĩnh viễn đơn hàng này/);
});
test('false, pending and incomplete receipts never silently complete an archive action',async()=>{
  for(const receipt of [undefined,{success:false,message:'Denied'},{success:true},{success:true,confirmed:true,queued:true}]){
    const f=fixture(async()=>receipt);await f.run()('order');assert.ok(f.error);assert.deepEqual(f.ids,[]);
  }
  const f=fixture(async()=>({success:true,confirmed:true}));await f.run()('order');assert.equal(f.error,'');assert.deepEqual(f.ids,[]);
});
test('revoked rights and stale scope cannot submit; late errors after scope/unmount cannot overwrite another screen',async()=>{
  for(const condition of ['permission','scope']){
    const f=fixture(async()=>({success:true,confirmed:true}));if(condition==='permission')f.env.canDeleteOrder=false;else f.env.archiveScopeRef.current='other';
    await f.run()('order');assert.equal(f.calls,0);
  }
  for(const condition of ['scope','unmount']){
    let reject;const f=fixture(()=>new Promise((_resolve,no)=>{reject=no;}));const pending=f.run()('order');
    if(condition==='scope')f.env.archiveScopeRef.current='other';else f.env.archiveMountedRef.current=false;
    f.error='New screen status';f.ids=[];reject(Error('Old failure'));await pending;assert.equal(f.error,'New screen status');assert.deepEqual(f.ids,[]);
  }
});
