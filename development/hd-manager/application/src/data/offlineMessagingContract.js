// Signed OriginalApp action names, not a new role/permission vocabulary.
export const MESSAGING_ACTIONS = Object.freeze(['view_message_center','view_support_messages','send_support_messages','view_internal_messages','send_internal_messages','view_own_notifications','view_all_notifications','send_image_attachment','send_contact_attachment','send_location_attachment','send_bank_qr_attachment','send_order_attachment','send_order_request_attachment','send_report_attachment','call_from_message']);
export const MESSAGING_CAPABILITY_KINDS = Object.freeze(Object.fromEntries(MESSAGING_ACTIONS.map(action=>['messages.'+action,'messages.'+action])));
export const MESSAGING_COMMAND_KINDS = Object.freeze(['messaging.message.send','messaging.conversation.create']);
export const MESSAGING_FAMILIES = Object.freeze(['conversations','memberships','messages','notifications']);
export const MESSAGING_PAGE_SIZE = 40;
export const messagingError = (code,message)=>Object.assign(new Error(message),{code});
export const messagingDenied = message=>{throw messagingError('permission-denied',message);};
export const sameMessagingScope = (a,b)=>Boolean(a&&b&&['tenantId','principalId','sessionId','permissionRevision'].every(key=>typeof a[key]==='string'&&a[key]&&a[key]===b[key]));
export function assertMessagingEnvironment(projectId,origin){
  const url=new URL(origin);
  if(!/^demo-[a-z0-9-]+$/.test(projectId||'')||url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password||url.search||url.hash)messagingDenied('Messaging requires the approved demo loopback service');
  return url;
}
export function readMessagingGrant({grant,scope,employeeId,projectId,origin,now=Date.now()}){
  assertMessagingEnvironment(projectId,origin);
  const value=grant?.messaging,user=grant?.appSession?.user;
  if(!value||value.version!==1)throw messagingError('source-unavailable','BLOCKED: signed messaging protocol has not been provisioned');
  if(!sameMessagingScope(grant,scope)||!Number.isFinite(grant.expiresAtMs)||now>=grant.expiresAtMs||grant.appSession.sourceProfile!==undefined
    ||user?.id!==employeeId||user?.firebaseUid!==scope.principalId||user?.companyId!==scope.tenantId||user?.accountType!=='employee'
    ||value.employeeId!==employeeId||value.moduleAccess!==true||value.qaOnly!==true||value.projectId!==projectId
    ||!Array.isArray(value.qaEmployeeIds)||!value.qaEmployeeIds.includes(employeeId)||value.qaEmployeeIds.some(id=>typeof id!=='string'||!id)
    ||value.binding?.source!=='original-employees'||value.binding.employeeId!==employeeId||value.binding.tenantId!==scope.tenantId
    ||value.binding.principalId!==scope.principalId||!/^[a-f0-9]{64}$/.test(value.binding.sourceFingerprint||''))messagingDenied('Signed original employee messaging binding is invalid');
  if(!value.actions||Object.entries(value.actions).some(([key,allowed])=>!MESSAGING_ACTIONS.includes(key)||typeof allowed!=='boolean'
    ||allowed&&!grant.capabilities?.includes('messages.'+key)))messagingDenied('Messaging actions must come from the signed original policy');
  return Object.freeze({...value,actions:Object.freeze({...value.actions}),qaEmployeeIds:Object.freeze([...value.qaEmployeeIds])});
}
export function readActionForConversation(actions,type){
  const support=type==='support';
  const view=support?'view_support_messages':'view_internal_messages',send=support?'send_support_messages':'send_internal_messages';
  if(actions?.[view])return view;
  if(actions?.[send])return send; // OriginalApp visibleMessageTypes uses view OR send.
  messagingDenied('Original conversation read action denied');
}
export function readNotificationAction(actions){
  if(actions?.view_all_notifications)return 'view_all_notifications';
  if(actions?.view_own_notifications)return 'view_own_notifications';
  messagingDenied('Original notification read action denied');
}
export function requireMessagingMembership({scope,employeeId,conversation,membership,expiresAtMs,now=Date.now()}){
  if(!conversation||!membership||conversation.id!==membership.conversationId||conversation.companyId!==scope.tenantId
    ||membership.companyId!==scope.tenantId||membership.employeeId!==employeeId||membership.permissionRevision!==scope.permissionRevision
    ||!Number.isSafeInteger(conversation.membershipRevision)||conversation.membershipRevision<1
    ||membership.membershipRevision!==conversation.membershipRevision||membership.active!==true
    ||!Number.isFinite(membership.expiresAtMs)||membership.expiresAtMs<=now||membership.expiresAtMs>expiresAtMs
    ||!membership.proof||!['original-source-membership-v1','accepted-qa-conversation-v1'].includes(membership.proof.kind)
    ||!membership.proof.sourceId||!/^[a-f0-9]{64}$/.test(membership.proof.fingerprint||''))messagingDenied('BLOCKED: current authoritative membership proof is missing');
  return membership;
}
export function messagingAttachmentAction(type){
  const actions={image:'send_image_attachment',contact:'send_contact_attachment',customer:'send_contact_attachment',location:'send_location_attachment',bank:'send_bank_qr_attachment',order:'send_order_attachment',order_request:'send_order_request_attachment',report:'send_report_attachment'};
  if(!type)return null;
  if(!actions[type])messagingDenied('Attachment type has no approved original product action');
  return actions[type];
}
export function requireQaParticipants(access,ids){
  if(!Array.isArray(ids)||ids.length<2||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!access.qaEmployeeIds.includes(id))||!ids.includes(access.employeeId))messagingDenied('Recipients must be approved original-employee QA bindings');
  return ids;
}
export function validateMessagingDocument(value,scope){
  if(!value||typeof value.id!=='string'||!value.id||value.companyId!==scope.tenantId||typeof value.conversationId!=='string'||!value.conversationId
    ||!Number.isSafeInteger(value.createdAt)||value.createdAt<0||typeof value.text!=='string'||value.text.length>20000
    ||(!value.text.trim()&&!value.attachmentText&&!value.attachmentImage))throw messagingError('invalid-argument','Invalid original message document');
  if(JSON.stringify(value).length>480000)throw messagingError('invalid-argument','Attachment exceeds the existing bounded Offline command size; nothing was truncated');
  return value;
}
