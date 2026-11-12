/** Audited source requirements, NOT an issued grant or an installed transport. */
export const OFFLINE_MESSAGE_READ_CONTRACT = Object.freeze({
  implemented:false,
  currentSources:['messages','notifications'],
  absentFrom:['src/data/homeFeedContract.js HOME_FEED_SOURCES and NATIVE_HOME_SOURCES','src/data/offlineBusinessDirectory.js sources','src/data/offlineCustomerGrant.js capability-kind map','performance/home-offline/start-workspace-services.mjs signed grant capabilities','performance/offline-first/schema-v1.sql message/notification mirror and feed checkpoints'],
  existingFirestorePath:'artifacts/{appId}/public/data/{messages|notifications}',
  existingMessages:{
    manager:'App.getTenantCollectionSources: companyId == tenant; orderBy(createdAt,desc); limit(200). Manager is resolved by current authenticated product policy, never inferred from an Offline display role.',
    employeeCustomerSupport:'companyId == tenant AND conversationType == customer_support AND assignedEmployeeId == currentEmployeeId AND assignmentState == assigned; createdAt desc; limit(200). Revalidate current customer assignment; reassignment revokes old employee access.',
    employeeInternal:'companyId == tenant AND conversationType IN [internal,internal_group,support]; createdAt desc; limit(200). Preserve participantEmpIds/group membership/product conversation visibility, not tenant-only disclosure.',
    customer:'companyId == tenant AND customerId == current customer AND conversationType == customer_support; createdAt desc; limit(100). Do not reuse employee access for customer accounts.',
  },
  existingNotifications:{
    employee:'App currently queries companyId == tenant; isEmployeeNotificationVisible then applies customer exclusion, audience and direct/list employee targets. Offline API/SQL must enforce that recipient policy before returning rows.',
    customer:'companyId == tenant AND customerId == current customer AND recipientType == customer; createdAt desc; limit(100).',
  },
  missingPermission:'No approved signed Offline message/notification permission, recipient/membership/assignment scope, or revocation/permission-revision binding. Do not introduce a client-only messages.read or notifications.read grant.',
  missingAPI:'No approved paginated local mirror / server page+delta API for these sources. Existing home-head/home-page cannot carry sources absent from the manifest. Need scoped opaque cursors, stable createdAt/id ordering, bounded query limits and tombstones for removal, reassignment or recipient changes.',
  missingSchema:'Use the EXISTING encrypted SQLite owner only: separately approved scoped message/notification rows and committed checkpoints including tenant, principal, permission revision, source generation and recipient scope. Do not append these sources to a completed Home manifest or use localStorage/another database.',
  requiredFields:{
    messages:['id','companyId','conversationId','conversationType','customerId','assignedEmployeeId','assignmentState','senderType','senderEmpId','senderName','recipientEmpId','receiverEmpId','participantEmpIds','groupId','text','message','createdAt','updatedAt','attachmentType','attachmentLabel','attachmentText'],
    notifications:['id','companyId','recipientType','customerId','audience','targetAudience','scope','targetEmpId','targetEmployeeId','recipientEmpId','receiverEmpId','employeeId','empId','targetEmployeeIds','title','message','createdAt','updatedAt','readAt'],
  },
  lifecycle:'Only after permission/API/schema approval: bounded local page on actual intent; at most one active-screen subscription on the EXISTING runtime, no hidden/global listener. Unsubscribe and invalidate pending callbacks on hide/logout/revocation. Retain same-scope UI state across React.Activity effect reattachment.',
  writes:'No send, attachment upload, read receipt, mark-read or notification acknowledgement. Current Offline commands cover customer profile mutations and order.create; none is an approved atomic/idempotent messaging command.',
});

export function offlineMessageSource(value) {return value === 'notifications' ? 'notifications' : 'messages';}

export function getOfflineMessageReadState(runtime,source='messages') {
  const scope=runtime?.scope,user=runtime?.appSession?.currentUser;
  if(!runtime?.isCurrent?.() || !scope?.tenantId || !scope.principalId || !scope.permissionRevision || !scope.sessionId ||
    !Number.isFinite(runtime.expiresAtMs) || Date.now() >= runtime.expiresAtMs || user?.accountType !== 'employee' ||
    user.companyId !== scope.tenantId || user.firebaseUid !== scope.principalId || runtime.appSession.currentCompany?.id !== scope.tenantId) {
    return {state:'SESSION_UNAVAILABLE',code:'permission-denied',message:'Phiên hoặc quyền đọc đã thay đổi. Vui lòng mở lại khu vực làm việc.'};
  }
  if(runtime.appSession.sourceProfile === 'native-isolation-v1') return {state:'SOURCE_UNSUPPORTED',code:'source-unavailable',message:'Phiên nguồn native hiện tại chưa hỗ trợ tin nhắn hoặc thông báo của sản phẩm. Không mở nguồn legacy trong phiên này.'};
  return {state:'NOT_PROVISIONED',code:source === 'notifications' ? 'OFFLINE_NOTIFICATION_FEED_NOT_PROVISIONED' : 'OFFLINE_MESSAGE_FEED_NOT_PROVISIONED',
    message:source === 'notifications' ? 'Thông báo chưa có nguồn đọc Offline được cấp quyền trên thiết bị. Chưa thể kết luận có hay không có thông báo.' : 'Tin nhắn chưa có nguồn đọc Offline được cấp quyền trên thiết bị. Chưa thể hiển thị hội thoại hoặc kết luận không có tin nhắn.'};
}
