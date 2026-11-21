import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {getMessageWorkspaceReadCollections as plan,getMessageAttachmentReadCollections as sources,MESSAGE_PRIMARY_COLLECTIONS,pendingAttachmentDecision} from '../src/services/messageWorkspaceReadPlan.js';
const file=new URL('../src/features/legacy/MessageCenterView.jsx',import.meta.url),text=fs.readFileSync(file,'utf8'),ast=parse(text,{sourceType:'module',plugins:['jsx']});
const variables=new Map(),effects=[];
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id.type==='Identifier')variables.set(n.id.name,n.init);if(n.type==='CallExpression'&&n.callee.name==='useEffect')effects.push(n.arguments[0]);for(const[k,v]of Object.entries(n)){if(['loc','comments','extra'].includes(k))continue;if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}}walk(ast);
const compile=(node,bindings)=>Function(...Object.keys(bindings),'return ('+text.slice(node.start,node.end)+')')(...Object.values(bindings));
const actionNode=variables.get('handleRealAttachAction'),pendingEffect=effects.find(n=>text.slice(n.start,n.end).includes('pendingAttachmentDecision('));
test('chat opening omits five attachment histories, keeps existing background services, and demands only the chosen sources',()=>{
 assert.deepEqual(MESSAGE_PRIMARY_COLLECTIONS,['employees','customers','messages']);
 for(const name of ['orders','orderRequests','products','payments','expenses'])assert(!plan().includes(name));
 for(const name of ['zalo_send_queue','zalo_campaigns','zalo_campaign_queue','zalo_inbox_messages','zalo_inbox_bridge_logs','order_requests','ai_reply_rules','orders','payments','expenses','orderRequests','products']){assert(!plan().includes(name));assert(plan('',true).includes(name));}
 assert.deepEqual(sources('report'),['orders','payments','expenses']);assert.deepEqual(sources('order'),['orders','products','payments']);assert.deepEqual(sources('order_request'),['orderRequests','products']);
 assert(!plan('order').includes('expenses'));assert.equal(plan('unknown'),plan());assert(Object.isFrozen(plan('report')));assert.equal(new Set(plan('report')).size,plan('report').length);
 for(const invalid of ['constructor','__proto__','prototype']){assert.deepEqual(sources(invalid),[]);assert.equal(plan(invalid),plan());}
});
function fixture({ready=false,conversationId='one',allowed=true}={}){
 const calls=[],executed={current:0},selected={id:conversationId},request={id:7,conversationId:'one',action:{id:'order'}},state={pending:null};
 const bindings={selectedConversation:selected,attachActions:allowed?[{id:'order'},{id:'image'}]:[],attachmentSourcesReady:{order:ready},getMessageAttachmentReadCollections:sources,
  setShowAttachMenu:()=>{},setPendingAttachment:value=>{state.pending=value;},attachmentSequence:{current:0},setStatus:value=>calls.push(['status',value]),
  orders:[{id:'fresh-order',amount:420000}],pickChatItem:rows=>rows[0],buildChatOrderText:row=>row.id+':'+row.amount,
  sendAttachmentPayload:async value=>calls.push(['send',value]),cameraInputRef:{current:{click:()=>calls.push(['camera'])}},customerById:new Map()};
 const action=compile(actionNode,bindings);
 const effect=compile(pendingEffect,{pendingAttachment:request,pendingAttachmentDecision,selectedConversation:selected,canSendInSelectedConversation:allowed,
  attachActions:bindings.attachActions,attachmentSourcesReady:bindings.attachmentSourcesReady,setPendingAttachment:bindings.setPendingAttachment,setStatus:bindings.setStatus,executedAttachment:executed,handleRealAttachAction:action});
 return{action,effect,calls,state,request,bindings};
}
test('the actual handler queues without sending incomplete data; the actual effect consumes current data exactly once',async()=>{
 const waiting=fixture();await waiting.action({id:'order'});assert.equal(waiting.state.pending.action.id,'order');assert(!waiting.calls.some(x=>x[0]==='send'));waiting.effect();assert(!waiting.calls.some(x=>x[0]==='send'));
 const ready=fixture({ready:true});ready.effect();ready.effect();await Promise.resolve();
 const sent=ready.calls.filter(x=>x[0]==='send');assert.equal(sent.length,1);assert.equal(sent[0][1].attachmentText,'fresh-order:420000');
});
test('conversation change and revoked attachment permission cancel pending actions; existing camera still works',async()=>{
 for(const options of [{ready:true,conversationId:'two'},{ready:true,allowed:false}]){const f=fixture(options);f.effect();await Promise.resolve();assert.equal(f.state.pending,null);assert(!f.calls.some(x=>x[0]==='send'));}
 const camera=fixture();await camera.action({id:'camera'});assert.deepEqual(camera.calls,[['camera']]);
 assert.equal(pendingAttachmentDecision({request:null}),'none');
});
test('the canonical application owns demand by permission/session scope, resets it on teardown, and uses the same committed-source witness',()=>{
 const app=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 assert.match(app,/messageAttachmentDemand\?\.owner===readOwnerKey/);assert.match(app,/onMessageAttachmentDemandChange=useCallback\(action=>\{\s*if\(readOwnerRef.current!==readOwnerKey\)return/);
 assert.match(app,/activeTab==='messages'\?getMessageWorkspaceReadCollections\(messageAttachmentRequested,messageBackgroundRequested\)/);
 assert.match(app,/attachmentSourcesReady=\{Object.fromEntries\(\['order','order_request','report'\]/);
 assert.match(app,/messageListCommittedOwner===readOwnerKey/);assert.match(text,/if\(primarySourcesReady\)onPrimaryReady\?\.\(\)/);
 assert.match(text,/return\(\)=>onAttachmentSourceDemandChange\?\.\(''\)/);
});
test('the original report calculation still uses complete payments/expenses and the current day orders without changing any financial formula',()=>{
 const report=compile(variables.get('buildChatReportText'),{
  getTodayString:()=> '2026-11-16',getEntityTimestamp:()=>'',formatDateLabel:value=>value,formatCurrency:value=>String(value),
  orders:[{id:'current',date:'2026-11-16',amount:420000},{id:'previous',date:'2026-11-15',amount:900000}],
  payments:[{id:'p1',amount:120000},{id:'p2',amount:300000}],expenses:[{id:'e1',amount:10000},{id:'e2',amount:20000}],
 });
 const result=report();assert(result.includes('Đơn hôm nay: 1'));assert(result.includes('Doanh thu hôm nay: 420000'));
 assert(result.includes('Tổng thu đã ghi nhận: 420000'));assert(result.includes('Tổng chi đã ghi nhận: 30000'));
});
