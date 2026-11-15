import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import{parse}from'@babel/parser';
import{createMessageAttachmentSelection}from'../src/services/messageAttachmentSelection.js';
test('one scoped selection resolves exactly once; unknown rows and foreign scopes cannot be selected',async()=>{
 const row={id:'order-1'},other={id:'order-2'},selection=createMessageAttachmentSelection({isCurrent:scope=>scope==='tenant-a:conversation-a'});
 const result=selection.open('tenant-a:conversation-a',[row]);assert.equal(selection.choose('tenant-b:conversation-a',row),false);assert.equal(selection.choose('tenant-a:conversation-a',other),false);
 assert.equal(selection.choose('tenant-a:conversation-a',row),true);assert.equal(selection.choose('tenant-a:conversation-a',row),false);assert.equal(await result,row);
});
test('cancel, replacement, hidden view and revoked scope settle waiters without delayed sends; reattachment can open a new selection',async()=>{
 let active=true;const row={id:'a'},selection=createMessageAttachmentSelection({isCurrent:()=>active});
 const a=selection.open('a',[row]),b=selection.open('b',[row]);assert.equal(await a,null);selection.cancel();assert.equal(await b,null);
 const revoked=selection.open('a',[row]);active=false;assert.equal(selection.choose('a',row),false);assert.equal(await revoked,null);assert.equal(await selection.open('a',[row]),null);
 active=true;const resumed=selection.open('a',[row]);selection.choose('a',row);assert.equal(await resumed,row);
});
const text=fs.readFileSync(new URL('../src/features/legacy/MessageCenterView.jsx',import.meta.url),'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']});let picker;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.name==='pickChatItem')picker=n.init;for(const[k,v]of Object.entries(n)){if(['loc','comments','extra'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}}walk(ast);
function fixture(){const rows=Array.from({length:1000},(_,i)=>({id:'o'+i})),context={current:{scope:'tenant-a:conversation-a',allowed:true,actions:new Set(['order']),sources:{order:rows}}},state={};const selection=createMessageAttachmentSelection({isCurrent:scope=>scope===context.current.scope});
 const bindings={attachmentSelectionContext:context,attachmentSelector:{current:selection},attachmentViewActive:{current:true},setStatus:value=>{state.status=value;},setAttachmentPickerType:()=>{},setAttachmentPickerSearch:()=>{},setAttachmentPickerConfig:value=>{state.config=value;}};
 const pick=Function(...Object.keys(bindings),'return ('+text.slice(picker.start,picker.end)+')')(...Object.values(bindings));return{pick,rows,context,state,selection};}
test('actual picker exposes the whole authorized list including row1000; no native prompt, only twenty rendered rows/page',async()=>{
 const f=fixture(),result=f.pick(f.rows,'Chọn đơn',item=>item.id,'order');assert.equal(f.state.config.items.length,1000);f.state.config.onSelect(f.rows[999]);assert.equal(await result,f.rows[999]);
 assert(!text.includes('window.prompt('));assert.match(text,/usePagedList\(attachmentPickerItems,JSON.stringify\(\[attachmentPickerType,attachmentPickerSearch\]\),20\)/);assert.match(text,/attachmentPickerPage.items.map/);
});
test('actual picker refuses a changed business record and cancelled selectors never produce a selection',async()=>{
 const f=fixture(),result=f.pick(f.rows,'Chọn đơn',item=>item.id,'order');f.context.current={...f.context.current,sources:{order:f.rows.map(row=>({...row}))}};f.state.config.onSelect(f.rows[0]);assert.equal(await result,null);assert.match(f.state.status,/vừa thay đổi/);
 const cancelled=f.pick(f.rows,'Chọn đơn',item=>item.id,'order');f.selection.cancel();assert.equal(await cancelled,null);
});
