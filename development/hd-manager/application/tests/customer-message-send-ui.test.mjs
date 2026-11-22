import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import {createMessageSendController} from '../src/services/messageSendController.js';
const source=fs.readFileSync(new URL('../src/features/legacy/CustomerPortalView.jsx',import.meta.url),'utf8');let send;
function visit(n){if(!n||typeof n!=='object')return;if(n.type==='VariableDeclarator'&&n.id?.name==='handleSendCustomerMessage')send=n.init;
  for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v?.type)visit(v);}
visit(parse(source,{sourceType:'module',plugins:['jsx']}));assert.ok(send);
function fixture(){
  const state={text:'Portal QA draft',busy:false,status:''},calls=[],context={active:true,scope:'portal-qa'};
  const controller=createMessageSendController({isCurrent:scope=>context.active&&context.scope===scope});
  const env={customerMessageText:state.text,isSendingCustomerMessage:false,customerSendScope:context.scope,
    customerSendControllerRef:{current:controller},customerProfile:{id:'customer-qa',name:'QA customer'},currentUser:{id:'portal-qa'},
    customerResponsibleConversationId:'customer_customer-qa',responsibleEmployeeId:'employee-qa',responsibleEmployeeName:'QA employee',responsibleEmployeePhone:'',
    isCurrentCustomerSendScope:scope=>context.active&&context.scope===scope,
    setCustomerMessageText:value=>{state.text=typeof value==='function'?value(state.text):value;},
    setIsSendingCustomerMessage:value=>{state.busy=value;},setSubmitMessage:value=>{state.status=value;},getFriendlyFirebaseErrorMessage:error=>error.message,
    onAddMessage:async data=>{calls.push(structuredClone(data));return 'confirmed';}};
  const f={state,calls,context,env};f.render=()=>{env.customerMessageText=state.text;env.isSendingCustomerMessage=state.busy;env.customerSendScope=context.scope;
    f.send=Function(...Object.keys(env),`return (${source.slice(send.start,send.end)});`)(...Object.values(env));};f.render();return f;
}

test('actual portal handler keeps draft until ACK, prevents synchronous duplicate Enter/click and retries one stable message',async()=>{
  const f=fixture();let reject;
  f.env.onAddMessage=data=>{f.calls.push(structuredClone(data));return new Promise((_,r)=>{reject=r;});};f.render();
  const pending=f.send();await f.send();assert.equal(f.calls.length,1);assert.equal(f.state.text,'Portal QA draft');assert.equal(f.state.busy,true);
  reject(Error('Lost ACK'));await pending;assert.equal(f.state.text,'Portal QA draft');assert.equal(f.state.busy,false);
  f.env.onAddMessage=async data=>{f.calls.push(structuredClone(data));return {confirmed:true};};f.render();await f.send();
  assert.deepEqual(f.calls[1],f.calls[0]);assert.equal(f.state.text,'');assert.match(f.state.status,/Đã gửi tin nhắn cho nhân viên/);
  assert.equal(f.calls[0].customerId,'customer-qa');assert.equal(f.calls[0].recipientEmpId,'employee-qa');
});

test('portal false or queued receipts retain text and unclassified success is reported only after confirmation',async()=>{
  for(const outcome of [false,undefined,{success:false},{queued:true}]){
    const f=fixture();f.env.onAddMessage=async()=>outcome;f.render();await f.send();assert.equal(f.state.text,'Portal QA draft');assert.doesNotMatch(f.state.status,/Đã gửi/);
  }
  const f=fixture();f.env.responsibleEmployeeId='';f.render();await f.send();assert.match(f.state.status,/Đã gửi tin nhắn vào hàng chờ phân loại/);
});

test('late portal ACK or error after account/assignment/conversation switch cannot affect the new draft',async()=>{
  for(const failed of [false,true]){
    const f=fixture();let finish;
    f.env.onAddMessage=()=>new Promise((resolve,reject)=>{finish=()=>failed?reject(Error('Old account error')):resolve('Old ACK');});f.render();
    const pending=f.send();f.context.scope='another-account';f.state.text='New private draft';f.state.status='New status';f.state.busy=false;
    finish();await pending;assert.equal(f.state.text,'New private draft');assert.equal(f.state.status,'New status');assert.equal(f.state.busy,false);
  }
});
