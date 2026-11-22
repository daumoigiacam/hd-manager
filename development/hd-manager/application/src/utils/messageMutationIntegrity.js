import {payloadFingerprint} from './customerProductAutoSync.js';
import {buildCustomerMessageRouting} from './employeeScopedCustomerMessaging.js';

const text=value=>typeof value==='string'?value.trim():'';
const idValid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,180}$/.test(value);
const fail=(message,code='message/invalid')=>{throw Object.assign(new Error(message),{code});};
export const messageScopeError=()=>fail('Phiên hội thoại đã thay đổi. Vui lòng mở lại trước khi gửi.','message/scope');
const attachmentActions={image:'send_image_attachment',contact:'send_contact_attachment',customer:'send_contact_attachment',
  location:'send_location_attachment',bank:'send_bank_qr_attachment',order:'send_order_attachment',
  order_request:'send_order_request_attachment',report:'send_report_attachment'};
const isManager=user=>['super_admin','owner','admin','manager','company_owner','business_owner','accounting','accountant']
  .includes(text(user?.role).toLowerCase());
const metadata=new Set(['clientMutationId','clientMutationAt','id','companyId','senderEmpId','senderCustomerId','senderType','senderName',
  'createdAt','updatedAt','isArchived','archivedAt','archivedByEmpId','lastMessageCommand','employeeReadAt','employeeReadById','customerReadAt','customerReadById']);
const legacyPortalIntents=new Map();
export function completeMessageMutation(intent) {
  if(intent.legacyKey&&legacyPortalIntents.get(intent.legacyKey)?.clientMutationId===intent.command.id)legacyPortalIntents.delete(intent.legacyKey);
}
const trustedEmployee=(employees,id,companyId)=>{
  const employee=employees.find(row=>row.id===id&&row.companyId===companyId&&!row.isArchived);
  if(!idValid(id)||!employee)fail('Nhân sự nhận tin không tồn tại hoặc không thuộc công ty hiện tại.');
  return employee;
};
export async function prepareMessageMutation({input={},companyId,currentUser,employee,currentCustomer,customers,employees,company,hasPermission,isCurrent,scopeKey=''}) {
  if(!isCurrent()||!idValid(companyId))messageScopeError();
  const portal=currentUser?.accountType==='customer'||currentUser?.role==='customer';
  if(!portal&&input.companyId&&input.companyId!==companyId)messageScopeError();
  let legacyKey;
  if(portal&&!input.clientMutationId) {
    legacyKey=await payloadFingerprint({scopeKey,companyId,customerId:currentUser?.customerId||currentCustomer?.id,input});
    if(!legacyPortalIntents.has(legacyKey))legacyPortalIntents.set(legacyKey,{clientMutationId:crypto.randomUUID(),clientMutationAt:new Date().toISOString()});
    input={...input,...legacyPortalIntents.get(legacyKey)};
  }
  if(!idValid(input.clientMutationId))fail('Thiếu mã gửi tin ổn định. Vui lòng mở lại hội thoại.');
  const stamp=typeof input.clientMutationAt==='number'?input.clientMutationAt:Date.parse(input.clientMutationAt||'');
  if(!Number.isFinite(stamp)||stamp<=0)fail('Thời điểm gửi tin không hợp lệ.');
  const customerId=portal?text(currentUser?.customerId||currentCustomer?.id||currentCustomer?.customerId):text(input.customerId);
  const support=portal||input.conversationType==='customer_support'||['customer_to_employee','employee_to_customer'].includes(input.type);
  const conversationType=support?'customer_support':input.conversationType||'internal';
  if(!['internal','internal_group','support','customer_support'].includes(conversationType))fail('Loại hội thoại không hợp lệ.');
  const actorId=portal?'':text(employee?.id||currentUser?.employeeId||currentUser?.id);
  if(!portal) {
    trustedEmployee(employees,actorId,companyId);
    const action=['support','customer_support'].includes(conversationType)?'send_support_messages':'send_internal_messages';
    if(!hasPermission({company,employee,currentUser},'messages',action))fail('Bạn chưa được cấp quyền gửi tin trong hội thoại này.','message/permission-denied');
  }
  const attachmentType=text(input.attachmentType);
  if(attachmentType&&!Object.hasOwn(attachmentActions,attachmentType))fail('Loại thông tin đính kèm chưa được hỗ trợ.');
  if(!portal)for(const action of new Set([attachmentActions[attachmentType],input.attachmentImage?'send_image_attachment':''].filter(Boolean))) {
    if(!hasPermission({company,employee,currentUser},'messages',action))fail('Bạn chưa được cấp quyền gửi thông tin đính kèm này.','message/permission-denied');
  }
  if(!text(input.text)&&!text(input.attachmentText)&&!text(input.attachmentImage))fail('Vui lòng nhập nội dung tin nhắn.');
  const content=Object.fromEntries(Object.entries(input).filter(([key,value])=>!metadata.has(key)&&value!==undefined));
  let routing;
  if(support) {
    const customer=customers.find(row=>row.id===customerId&&row.companyId===companyId&&!row.isArchived)
      ||(portal&&currentCustomer?.companyId===companyId&&text(currentCustomer.id||currentCustomer.customerId)===customerId&&!currentCustomer.isArchived?currentCustomer:null);
    if(!idValid(customerId)||!customer)fail('Không tìm thấy khách hàng của hội thoại trong công ty hiện tại.');
    const route=buildCustomerMessageRouting({...customer,id:customerId});
    if(!portal&&!isManager(currentUser)&&route.assignedEmployeeId!==actorId)fail('Bạn không phụ trách khách hàng này nên không thể gửi tin trong hội thoại.','message/permission-denied');
    for(const key of ['assignedEmployeeId','receiverEmpId','recipientEmpId','targetEmpId','participantEmpIds','groupId','groupName'])delete content[key];
    routing={customerId:route.customerId,customerName:customer.name||'',conversationId:route.conversationId,assignmentState:route.assignmentState,conversationType:'customer_support',
      ...(route.assignedEmployeeId?{assignedEmployeeId:route.assignedEmployeeId,receiverEmpId:route.assignedEmployeeId,recipientEmpId:route.assignedEmployeeId,targetEmpId:route.assignedEmployeeId}:{}),
      type:portal?(input.type==='loyalty_point_withdraw_request'?input.type:'customer_to_employee'):'employee_to_customer'};
  }else{
    const aliases=['receiverEmpId','recipientEmpId','targetEmpId','assignedEmployeeId'];
    const recipients=[...new Set(aliases.map(key=>text(input[key])).filter(Boolean))];
    const participants=[...new Set(Array.isArray(input.participantEmpIds)?input.participantEmpIds:[])];
    for(const id of [...recipients,...participants])trustedEmployee(employees,id,companyId);
    if(conversationType==='internal_group') {
      if(participants.length<2||!participants.includes(actorId))fail('Nhóm nội bộ phải có người gửi và ít nhất một nhân sự khác.');
      const groupId=text(input.groupId||input.conversationId);
      if(!idValid(groupId)||(input.groupId&&input.conversationId&&input.groupId!==input.conversationId))fail('Mã nhóm nội bộ không hợp lệ.');
      routing={conversationType,conversationId:groupId,groupId,participantEmpIds:participants,recipientEmpId:'',receiverEmpId:'',type:'internal_group'};
    }else if(conversationType==='internal') {
      if(recipients.length!==1||recipients[0]===actorId||participants.some(id=>![actorId,recipients[0]].includes(id)))fail('Vui lòng chọn đúng một nhân sự nhận tin.');
      const conversationId=`internal-${[actorId,recipients[0]].sort().join('-')}`;
      if(input.conversationId&&input.conversationId!==conversationId)fail('Hội thoại không khớp người gửi và người nhận.');
      routing={conversationType,conversationId,
        recipientEmpId:recipients[0],receiverEmpId:recipients[0],type:'internal_message',participantEmpIds:[]};
    }else {
      const conversationId=text(input.conversationId)||'support-hd-manager';
      if(conversationId!=='support-hd-manager'&&!(conversationId===`support-customer-${customerId}`
        &&customers.some(row=>row.id===customerId&&row.companyId===companyId&&!row.isArchived)))fail('Hội thoại hỗ trợ không hợp lệ.');
      routing={conversationType,conversationId,type:'internal_message'};
    }
  }
  const id=`msg_${input.clientMutationId}`;
  const payload={...content,...routing,id,companyId,text:text(input.text),attachmentType,
    senderEmpId:actorId,senderCustomerId:portal?customerId:'',senderType:portal?'customer':'employee',
    senderName:portal?(currentUser?.name||currentUser?.phone||'Khách hàng'):(employee?.name||currentUser?.name||currentUser?.phone||'Nhân sự'),
    source:portal?'customer_portal':text(input.source),status:portal?'unread':'read',isArchived:false,createdAt:stamp,updatedAt:stamp};
  const {createdAt,updatedAt,...business}=payload;void createdAt;void updatedAt;
  const command={id:input.clientMutationId,fingerprint:await payloadFingerprint(business)};
  if(!isCurrent())messageScopeError();
  return {id,companyId,payload:{...payload,lastMessageCommand:command},command,legacyKey};
}

export async function commitMessageMutation({intent,transaction,reference,isCurrent}) {
  if(!isCurrent())messageScopeError();
  return transaction(async tx=>{
    const snapshot=await tx.get(reference);
    if(!isCurrent())messageScopeError();
    if(snapshot.exists()) {
      const saved=snapshot.data();
      if(saved.companyId!==intent.companyId||saved.lastMessageCommand?.id!==intent.command.id
        ||saved.lastMessageCommand?.fingerprint!==intent.command.fingerprint)fail('Mã gửi tin đã được sử dụng với nội dung khác.','message/conflict');
      return {id:intent.id,payload:{...saved,id:intent.id},duplicate:true};
    }
    tx.set(reference,intent.payload);
    return {id:intent.id,payload:intent.payload,duplicate:false};
  });
}
