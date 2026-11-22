import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {createMessageSendController} from '../src/services/messageSendController.js';

const source=fs.readFileSync(new URL('../src/features/legacy/MessageCenterView.jsx',import.meta.url),'utf8');
const ast=parse(source,{sourceType:'module',plugins:['jsx']}),declarations=new Map();
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name)declarations.set(n.id.name,n.init);
  for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v?.type)walk(v);}
walk(ast);
function actual(name,env){const n=declarations.get(name);assert.ok(n,name);return Function(...Object.keys(env),`return (${source.slice(n.start,n.end)});`)(...Object.values(env));}
function fixture(){
  const state={draft:'QA draft',busy:false,status:'',groupName:'QA group',members:['driver']},calls=[];
  const context={current:{active:true,scope:'session-a/chat-a'}},env={
    sendScope:context.current.scope,sendContextRef:context,isSending:false,draft:state.draft,
    selectedConversation:{id:'chat-a',type:'internal'},canSendInSelectedConversation:true,
    buildOutgoingMessageMeta:()=>({conversationId:'chat-a',conversationType:'internal',recipientEmpId:'driver'}),
    setDraft:value=>{state.draft=value;},setIsSending:value=>{state.busy=value;},setStatus:value=>{state.status=value;},
    console:{warn(){}},getFriendlyFirebaseErrorMessage:error=>error.message,
    onAddMessage:async value=>{calls.push(structuredClone(value));return 'confirmed';},
    canSendInternalMessages:true,currentEmployeeId:'owner',groupMemberIds:state.members,groupNameDraft:state.groupName,
    employeeById:new Map([['driver',{id:'driver',name:'QA driver'}]]),groupIntentRef:{current:null},
    setActiveType(){},setSelectedConversationId(){},setShowCreateGroup(){},setGroupNameDraft(){},setGroupMemberIds(){},setGroupSearchKeyword(){}
  };
  const controller=createMessageSendController({isCurrent:scope=>context.current.active&&context.current.scope===scope});
  env.sendControllerRef={current:controller};env.isCurrentSendScope=scope=>context.current.active&&context.current.scope===scope;
  const f={state,calls,env,context};
  f.render=()=>{env.draft=state.draft;env.isSending=state.busy;env.sendScope=context.current.scope;
    env.sendScopedMessage=actual('sendScopedMessage',env);env.closeCreateGroup=actual('closeCreateGroup',env);
    f.send=actual('handleSendMessage',env);f.attach=actual('sendAttachmentPayload',env);f.group=actual('handleCreateInternalGroup',env);};
  f.render();return f;
}

test('actual text handler keeps draft until ACK, synchronously rejects duplicate clicks and reuses failed intent ID',async()=>{
  const f=fixture();let reject;
  f.env.onAddMessage=value=>{f.calls.push(structuredClone(value));return new Promise((_,r)=>{reject=r;});};f.render();
  const pending=f.send();await f.send();assert.equal(f.calls.length,1);assert.equal(f.state.busy,true);assert.equal(f.state.draft,'QA draft');
  reject(Error('ACK lost'));await pending;assert.equal(f.state.draft,'QA draft');assert.equal(f.state.busy,false);
  f.env.onAddMessage=async value=>{f.calls.push(structuredClone(value));return 'confirmed';};f.render();await f.send();
  assert.deepEqual(f.calls[1],f.calls[0]);assert.equal(f.state.draft,'');assert.match(f.state.status,/Đã gửi/);
});

test('false, queued, missing and rejected receipts never clear the actual text draft or claim synchronized success',async()=>{
  for(const outcome of [false,undefined,{queued:true},{success:false},{confirmed:false}]){
    const f=fixture();f.env.onAddMessage=async()=>outcome;f.render();await f.send();
    assert.equal(f.state.draft,'QA draft');assert.doesNotMatch(f.state.status,/Đã gửi/);assert.equal(f.state.busy,false);
  }
});

test('late success and failure from another conversation/account cannot change its draft or status',async()=>{
  for(const failed of [false,true]){
    const f=fixture();let finish;f.env.onAddMessage=()=>new Promise((resolve,reject)=>{finish=()=>failed?reject(Error('old failure')):resolve('old ACK');});f.render();
    const pending=f.send();f.context.current={active:true,scope:'session-b/chat-b'};f.state.draft='New private draft';f.state.status='New context';f.state.busy=false;
    finish();await pending;assert.equal(f.state.draft,'New private draft');assert.equal(f.state.status,'New context');
  }
});

test('attachment retries retain one immutable intent and changed payload creates a fresh intent',async()=>{
  const f=fixture();f.env.onAddMessage=async value=>{f.calls.push(structuredClone(value));throw Error('offline');};f.render();
  const attachment={text:'Order QA',attachmentType:'order',attachmentText:'QA order 1000'};
  await f.attach(attachment);f.render();await f.attach(attachment);assert.deepEqual(f.calls[1],f.calls[0]);
  f.render();await f.attach({...attachment,attachmentText:'QA order 2000'});
  assert.notEqual(f.calls[2].clientMutationId,f.calls[0].clientMutationId);assert.equal(f.calls[2].attachmentText,'QA order 2000');
});

test('actual group retry preserves group and message identity, suppresses duplicate submits and keeps failure configuration',async()=>{
  const f=fixture();let reject;
  f.env.onAddMessage=value=>{f.calls.push(structuredClone(value));return new Promise((_,r)=>{reject=r;});};f.render();
  const pending=f.group();await f.group();assert.equal(f.calls.length,1);reject(Error('group failed'));await pending;
  assert.equal(f.env.groupNameDraft,'QA group');const first=f.calls[0];
  f.env.onAddMessage=async value=>{f.calls.push(structuredClone(value));return 'confirmed';};f.render();await f.group();
  assert.equal(f.calls[1].groupId,first.groupId);assert.equal(f.calls[1].clientMutationId,first.clientMutationId);assert.deepEqual(f.calls[1].participantEmpIds,['owner','driver']);
});

test('permission rejection and inactive scope produce no message writes',async()=>{
  const f=fixture();f.env.canSendInSelectedConversation=false;f.render();await f.send();await f.attach({text:'Blocked'});assert.equal(f.calls.length,0);
  f.env.canSendInSelectedConversation=true;f.context.current.active=false;f.render();await f.send();assert.equal(f.calls.length,0);
});

test('image decoding that finishes after changing conversation cannot send or overwrite the new status',async()=>{
  for(const fail of [false,true]){
    const f=fixture();let finish;f.env.readChatImageAttachment=()=>new Promise((resolve,reject)=>{finish=()=>fail?reject(Error('old image error')):resolve('data:image/png;base64,QA');});
    f.env.sendAttachmentPayload=async()=>assert.fail('Stale image must not send');
    const change=actual('handleImageAttachmentChange',f.env),pending=change({target:{files:[{name:'qa.png'}],value:'selected'}});
    f.context.current={active:true,scope:'replacement/chat'};f.state.status='New chat status';finish();await pending;assert.equal(f.state.status,'New chat status');
  }
});

test('call permission and missing phone are checked without launching a real dialer',()=>{
  let target='';const statuses=[];const env={canCallFromMessage:false,selectedConversation:{phone:'0900000043'},
    setStatus:value=>statuses.push(value),window:{location:{set href(value){target=value;}}}};
  actual('handleCall',env)();assert.equal(target,'');assert.match(statuses.at(-1),/chưa được cấp quyền/);
  env.canCallFromMessage=true;env.selectedConversation={};actual('handleCall',env)();assert.equal(target,'');assert.match(statuses.at(-1),/chưa có số/);
  env.selectedConversation={phone:'0900000043'};actual('handleCall',env)();assert.equal(target,'tel:0900000043');
});

test('conversation identity cannot be replaced by a name parsed from its most recent message',()=>{
  const env={customerById:new Map(),cleanChatDisplayText:value=>String(value||''),getConversationLatestMessage:()=>({})};
  env.extractNoticeLeadName=actual('extractNoticeLeadName',env);const display=actual('getConversationDisplayName',env);
  assert.equal(display({type:'support',title:'Hỗ trợ HD Manager',lastMessage:'Chào bạn, nếu app có lỗi hoặc cần góp ý'}),'Hỗ trợ HD Manager');
  assert.equal(display({type:'internal',title:'Tài xế QA',lastMessage:'Người khác đã chuyển tiền'}),'Tài xế QA');
  assert.equal(display({type:'internal',conversationKind:'internal_group',groupName:'Nhóm QA',lastMessage:'Khách A đã gửi hàng'}),'Nhóm QA');
  assert.equal(display({type:'notice',title:'Thông báo',sourceItem:{message:'Khách A đã chuyển tiền'}}),'Khách A');
});
