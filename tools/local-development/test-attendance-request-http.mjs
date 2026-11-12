import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {loginLocalQa} from './auth-client.mjs';import {workspace} from './environment.mjs';
const directory=path.join(workspace,'.local-dev/test-results/attendance-request-http-'+randomUUID());await fs.mkdir(directory,{recursive:true});const report={at:new Date().toISOString(),status:'RUNNING',scope:'Actual Local HTTP and Firestore Emulator; not APK role evidence',checks:[],productionChanged:false};
try{
 const a=await loginLocalQa('A'),b=await loginLocalQa('B');
 async function call(account,body,endpoint='sync'){return fetch(account.configuration.apiEndpoint+endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+account.idToken},body:JSON.stringify(body)});}
 const make=(action,entityId,payload,revision)=>{const commandId=randomUUID();return{commandId,idempotencyKey:commandId,kind:'attendanceRequest.'+action,entityId,baseRevision:revision,payload,payloadDigest:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};};
 for(const decision of ['approve','reject']){
  const id=randomUUID(),c=make('create',id,{workDate:'2026-11-12',workRole:'Kiểm chứng luồng yêu cầu Local',adjustmentType:'Đề nghị kiểm tra',reason:'QA thông qua API nghiệp vụ',proposedDetail:'Không sửa giờ công hoặc lương lịch sử'},0);
  let response=await call(a,{command:c});assert.equal(response.status,200);const created=await response.json();assert.equal(created.document.status,'PENDING_REVIEW');assert.equal(created.payloadDigest,c.payloadDigest);assert.equal(created.document.applied,false);
  response=await call(a,{command:c});assert.deepEqual(await response.json(),created);
  const wrong={...c,payloadDigest:'0'.repeat(64)};assert.equal((await call(a,{command:wrong})).status,403);
  const review=make(decision,id,{reason:'Đã xem yêu cầu QA; chưa áp dụng dữ liệu công'},1);
  assert.notEqual((await call(b,{command:review})).status,200);
  response=await call(a,{command:review});assert.equal(response.status,200);const result=await response.json();assert.equal(result.document.history.length,2);assert.equal(result.document.revision,2);assert.equal(result.document.applied,false);assert.equal(result.document.status,decision==='approve'?'APPROVED_PENDING_APPLICATION':'REJECTED');
  assert.deepEqual(await(await call(a,{command:review})).json(),result);
  assert.notEqual((await call(a,{command:make(decision,id,{reason:'Thử quyết định cạnh tranh trên revision cũ'},1)})).status,200);
  report.checks.push({decision,requestId:id,status:'PASS',createReceipt:created.commandId,reviewReceipt:result.commandId,historyEntries:2,duplicateRetrySameReceipt:true,otherTenantDenied:true,staleRevisionDenied:true,attendanceApplied:false});
 }
 const unauthorized=await fetch(a.configuration.apiEndpoint+'attendance-adjustment',{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"list"}'});assert.equal(unauthorized.status,401);report.checks.push({name:'missing-authentication-denied',status:'PASS'});report.status='PASS_LOCAL_HTTP_REQUEST_RECORDING_NOT_ATTENDANCE_APPLICATION';
}catch(e){report.status='FAIL';report.error=e.message;}finally{await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(workspace,'.local-dev/runtime/latest-attendance-request-http.json'),JSON.stringify({directory,status:report.status},null,2));console.log(JSON.stringify(report));if(report.status==='FAIL')process.exitCode=1;}
