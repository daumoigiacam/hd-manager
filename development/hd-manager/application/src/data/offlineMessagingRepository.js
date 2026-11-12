import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {ensureExactSQLiteTables} from './exactSQLiteSchema.js';
import {normalizeChatSearch} from '../features/messaging/messagingUiModel.js';
import {isEmployeeNotificationVisible} from '../utils/notificationVisibility.js';
import {MESSAGING_COMMAND_KINDS,MESSAGING_FAMILIES,MESSAGING_PAGE_SIZE,readMessagingGrant,readActionForConversation,readNotificationAction,requireMessagingMembership,requireQaParticipants,messagingAttachmentAction,validateMessagingDocument,sameMessagingScope,messagingError,messagingDenied} from './offlineMessagingContract.js';

export const MESSAGING_TABLES=Object.freeze([
 'CREATE TABLE IF NOT EXISTS offline_messaging_meta_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,session_id TEXT NOT NULL,permission_revision TEXT NOT NULL,generation TEXT NOT NULL,checkpoint TEXT NOT NULL,coverage_json TEXT NOT NULL,cursors_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id))',
 'CREATE TABLE IF NOT EXISTS offline_messaging_conversations_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,at INTEGER NOT NULL,membership_revision INTEGER NOT NULL,search_text TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,id))',
 'CREATE TABLE IF NOT EXISTS offline_messaging_memberships_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,conversation_id TEXT NOT NULL,employee_id TEXT NOT NULL,permission_revision TEXT NOT NULL,membership_revision INTEGER NOT NULL,expires_at INTEGER NOT NULL,active INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,conversation_id,employee_id))',
 'CREATE TABLE IF NOT EXISTS offline_messaging_messages_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,conversation_id TEXT NOT NULL,at INTEGER NOT NULL,search_text TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,id))',
 'CREATE TABLE IF NOT EXISTS offline_messaging_notifications_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,at INTEGER NOT NULL,search_text TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,id))',
 'CREATE TABLE IF NOT EXISTS offline_messaging_reads_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,through_at INTEGER NOT NULL,PRIMARY KEY(tenant_id,principal_id,kind,id))',
 'CREATE TABLE IF NOT EXISTS offline_messaging_pending_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,conversation_id TEXT NOT NULL,at INTEGER NOT NULL,kind TEXT NOT NULL,command_id TEXT NOT NULL,search_text TEXT NOT NULL,body TEXT NOT NULL,receipt_json TEXT,PRIMARY KEY(tenant_id,principal_id,id))',
]);
const indexes=[
 'CREATE INDEX IF NOT EXISTS offline_messaging_conversation_page_v1 ON offline_messaging_conversations_v1(tenant_id,principal_id,at DESC,id DESC)',
 'CREATE INDEX IF NOT EXISTS offline_messaging_thread_page_v1 ON offline_messaging_messages_v1(tenant_id,principal_id,conversation_id,at DESC,id DESC)',
 'CREATE INDEX IF NOT EXISTS offline_messaging_notice_page_v1 ON offline_messaging_notifications_v1(tenant_id,principal_id,at DESC,id DESC)',
];
const body=row=>JSON.parse(row.body),like=value=>'%'+normalizeChatSearch(value).replace(/[\\%_]/g,char=>'\\'+char)+'%';
const searchText=value=>normalizeChatSearch([value.title,value.groupName,value.text,value.message,value.attachmentLabel,value.attachmentText,value.senderName].filter(Boolean).join(' '));
const intentFields=['conversationId','text','attachmentType','attachmentLabel','attachmentText','attachmentImage'];
export async function createOfflineMessagingRepository(options){
 const {database,session,grant,employeeId,projectId,origin,authorize,authorizeWrite=authorize,now=Date.now,uuid,onChange=()=>{},onQueued=()=>{}}=options;
 if(!database?.transaction||!session?.isCurrent||!options.protocol?.sharedOutbox||!options.protocol?.receiptDispatch||options.protocol.version!==1)throw messagingError('source-unavailable','BLOCKED: shared Core messaging receipt dispatch is not installed');
 const scope=session.scope,keys=[scope.tenantId,scope.principalId];
 let closed=false;
 const check=()=>{
  if(closed||!session.isCurrent(scope))messagingDenied('Messaging owner changed');
  return readMessagingGrant({grant,scope,employeeId,projectId,origin,now:now()});
 };
 check();
 const tx=work=>database.transaction(async db=>{check();const value=await work(db);check();return value;});
 const authorizeAction=async(action,write=false)=>{
  const access=check();if(access.actions[action]!==true)messagingDenied('Original messaging action denied');
  await(write?authorizeWrite:authorize)({scope,kind:'messages.'+action,now:now()});check();
 };
 await ensureExactSQLiteTables({statements:MESSAGING_TABLES,read:database.readQuery?((sql,params)=>database.readQuery(sql,params)):undefined,transaction:tx});
 await tx(async db=>{for(const sql of indexes)await db.run(sql);});
 async function meta(db,families=[]){
  const row=(await db.query('SELECT * FROM offline_messaging_meta_v1 WHERE tenant_id=? AND principal_id=?',keys))[0];
  if(!row||row.session_id!==scope.sessionId||row.permission_revision!==scope.permissionRevision)throw messagingError('source-unavailable','BLOCKED: messaging source is not provisioned for this signed owner');
  const coverage=JSON.parse(row.coverage_json);
  if(families.some(family=>coverage[family]!==true))throw messagingError('source-unavailable','BLOCKED: authoritative messaging family coverage is missing');
  return {...row,coverage,cursors:JSON.parse(row.cursors_json)};
 }
 async function membership(db,id){
  const c=(await db.query('SELECT body FROM offline_messaging_conversations_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,id]))[0];
  const m=(await db.query('SELECT body FROM offline_messaging_memberships_v1 WHERE tenant_id=? AND principal_id=? AND conversation_id=? AND employee_id=?',[...keys,id,employeeId]))[0];
  const conversation=c?body(c):null,member=m?body(m):null;
  requireMessagingMembership({scope,employeeId,conversation,membership:member,expiresAtMs:grant.expiresAtMs,now:now()});
  return conversation;
 }
 async function ingest(db,page){
  check();
  if(!page||!sameMessagingScope(page.scope,scope)||typeof page.generation!=='string'||!page.generation||typeof page.checkpoint!=='string'
   ||!page.coverage||Object.entries(page.coverage).some(([family,value])=>!MESSAGING_FAMILIES.includes(family)||typeof value!=='boolean'))messagingDenied('Messaging page scope/coverage mismatch');
  const lists=MESSAGING_FAMILIES.map(family=>page[family]||[]);
  if(lists.some(list=>!Array.isArray(list)||list.length>200))throw messagingError('invalid-argument','Unbounded messaging page');
  const old=(await db.query('SELECT * FROM offline_messaging_meta_v1 WHERE tenant_id=? AND principal_id=?',keys))[0];
  const sameOwner=old&&old.session_id===scope.sessionId&&old.permission_revision===scope.permissionRevision;
  if(old&&(!sameOwner||old.generation!==page.generation)){
   for(const table of ['conversations','memberships','messages','notifications'])await db.run('DELETE FROM offline_messaging_'+table+'_v1 WHERE tenant_id=? AND principal_id=?',keys);
  }
  for(const c of page.conversations||[]){
   if(c.companyId!==scope.tenantId||!c.id||!['internal','internal_group','customer_support','support'].includes(c.kind)||!Number.isSafeInteger(c.lastActivityAt)||!Number.isSafeInteger(c.membershipRevision))messagingDenied('Invalid authoritative conversation');
   await db.run('INSERT INTO offline_messaging_conversations_v1 VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET kind=excluded.kind,at=excluded.at,membership_revision=excluded.membership_revision,search_text=excluded.search_text,body=excluded.body',[...keys,c.id,c.kind,c.lastActivityAt,c.membershipRevision,searchText(c),JSON.stringify(c)]);
  }
  for(const m of page.memberships||[]){
   if(m.companyId!==scope.tenantId||m.employeeId!==employeeId||!m.conversationId||m.permissionRevision!==scope.permissionRevision||typeof m.active!=='boolean')messagingDenied('Membership actor mismatch');
   if(m.active){const c=(await db.query('SELECT body FROM offline_messaging_conversations_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,m.conversationId]))[0];requireMessagingMembership({scope,employeeId,conversation:c&&body(c),membership:m,expiresAtMs:grant.expiresAtMs,now:now()});}
   await db.run('INSERT INTO offline_messaging_memberships_v1 VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,conversation_id,employee_id) DO UPDATE SET permission_revision=excluded.permission_revision,membership_revision=excluded.membership_revision,expires_at=excluded.expires_at,active=excluded.active,body=excluded.body',[...keys,m.conversationId,m.employeeId,m.permissionRevision,m.membershipRevision,m.expiresAtMs,m.active?1:0,JSON.stringify(m)]);
  }
  for(const message of page.messages||[]){
   validateMessagingDocument(message,scope);await membership(db,message.conversationId);
   await db.run('INSERT INTO offline_messaging_messages_v1 VALUES (?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET conversation_id=excluded.conversation_id,at=excluded.at,search_text=excluded.search_text,body=excluded.body',[...keys,message.id,message.conversationId,message.createdAt,searchText(message),JSON.stringify(message)]);
  }
  for(const notice of page.notifications||[]){
   if(notice.companyId!==scope.tenantId||!notice.id||!Number.isSafeInteger(notice.createdAt)||notice.projectionVersion!=='original-app-v1'||notice.authorizedEmployeeId!==employeeId)messagingDenied('Missing original notification projection/recipient proof');
   if(notice.sourceNotification&&!isEmployeeNotificationVisible(notice.sourceNotification,{currentEmployeeId:employeeId,isOwnerAccount:check().isOwnerAccount===true}))messagingDenied('Notification recipient denied');
   await db.run('INSERT INTO offline_messaging_notifications_v1 VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET at=excluded.at,search_text=excluded.search_text,body=excluded.body',[...keys,notice.id,notice.createdAt,searchText(notice),JSON.stringify(notice)]);
  }
  if((page.tombstones||[]).length>200)throw messagingError('invalid-argument','Unbounded messaging tombstones');
  for(const item of page.tombstones||[]){
   if(!['conversations','messages','notifications'].includes(item.family)||typeof item.id!=='string')messagingDenied('Invalid messaging tombstone');
   await db.run('DELETE FROM offline_messaging_'+item.family+'_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,item.id]);
   if(item.family==='conversations'){
    await db.run('DELETE FROM offline_messaging_memberships_v1 WHERE tenant_id=? AND principal_id=? AND conversation_id=?',[...keys,item.id]);
    await db.run('DELETE FROM offline_messaging_messages_v1 WHERE tenant_id=? AND principal_id=? AND conversation_id=?',[...keys,item.id]);
   }
  }
  const previous=sameOwner&&old.generation===page.generation?old:null;
  const coverage={...(previous?JSON.parse(previous.coverage_json):{}),...page.coverage};
  const cursors={...(previous?JSON.parse(previous.cursors_json):{})};
  if(page.queryKey!==undefined){if(typeof page.queryKey!=='string'||page.queryKey.length>500||page.nextCursor!==null&&typeof page.nextCursor!=='string')messagingDenied('Invalid messaging cursor envelope');cursors[page.queryKey]=page.nextCursor;}
  await db.run('INSERT INTO offline_messaging_meta_v1 VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id) DO UPDATE SET session_id=excluded.session_id,permission_revision=excluded.permission_revision,generation=excluded.generation,checkpoint=excluded.checkpoint,coverage_json=excluded.coverage_json,cursors_json=excluded.cursors_json',[...keys,scope.sessionId,scope.permissionRevision,page.generation,page.checkpoint,JSON.stringify(coverage),JSON.stringify(cursors)]);
 }
 const commands=createOfflineCommandRepository({...options,authorize:async request=>{
  const access=check();if(!MESSAGING_COMMAND_KINDS.includes(request.kind))messagingDenied('Unsupported messaging command');
  const action=request.kind==='messaging.conversation.create'?'send_internal_messages':request.payload.conversationType==='support'?'send_support_messages':'send_internal_messages';
  await authorizeAction(action,true);
  const attachment=messagingAttachmentAction(request.payload.attachmentType);if(attachment)await authorizeAction(attachment,true);
  if(request.kind==='messaging.conversation.create')requireQaParticipants(access,request.payload.participantEmpIds);
 },onEnqueue:async(db,command)=>{
  check();const p=command.payload;
  if(command.kind==='messaging.message.send'){
   validateMessagingDocument(p,scope);const c=await membership(db,p.conversationId);requireQaParticipants(check(),c.participantEmpIds);
   if(p.senderEmpId!==employeeId||p.membershipRevision!==c.membershipRevision||p.conversationType!==c.kind)messagingDenied('Message intent actor/membership mismatch');
  }else if(command.kind!=='messaging.conversation.create'||p.companyId!==scope.tenantId||p.creatorEmpId!==employeeId||!['internal','internal_group'].includes(p.kind)||!p.id||!Number.isSafeInteger(p.createdAt))messagingDenied('Invalid conversation creation intent');
  await db.run('INSERT INTO offline_messaging_pending_v1 VALUES (?,?,?,?,?,?,?,?,?,?)',[...keys,command.entityId,p.conversationId||p.id,p.createdAt,command.kind,command.commandId,searchText(p),JSON.stringify(p),null]);
 },onReceipt:async(db,{commandId,entityId,receipt})=>{
  const row=(await db.query('SELECT * FROM offline_messaging_pending_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,entityId]))[0];
  if(!row||row.command_id!==commandId||receipt.kind!==row.kind)messagingDenied('Messaging receipt dispatch mismatch');
  if(receipt.outcome==='accepted'){
   const document=receipt.document,local=body(row);
   if(document?.id!==entityId||document.companyId!==scope.tenantId||!receipt.projection)messagingDenied('Messaging receipt identity mismatch');
   if(row.kind==='messaging.message.send'&&intentFields.some(key=>(local[key]??'')!==(document[key]??'')))messagingDenied('Receipt changed original message intent');
   if(row.kind==='messaging.conversation.create'&&(document.kind!==local.kind||JSON.stringify([...(document.participantEmpIds||[])].sort())!==JSON.stringify([...local.participantEmpIds].sort())))messagingDenied('Receipt changed original participants');
   await ingest(db,receipt.projection);
   const table=row.kind==='messaging.message.send'?'messages':'conversations';
   const confirmed=(await db.query('SELECT body FROM offline_messaging_'+table+'_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,entityId]))[0];
   if(!confirmed||JSON.stringify(body(confirmed))!==JSON.stringify(document))messagingDenied('Receipt omitted its authoritative projection');
   await db.run('DELETE FROM offline_messaging_pending_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,entityId]);
  }else await db.run('UPDATE offline_messaging_pending_v1 SET receipt_json=? WHERE tenant_id=? AND principal_id=? AND id=?',[JSON.stringify(receipt),...keys,entityId]);
 }});
 const memberJoin=' JOIN offline_messaging_memberships_v1 m ON m.tenant_id=c.tenant_id AND m.principal_id=c.principal_id AND m.conversation_id=c.id AND m.employee_id=? AND m.permission_revision=? AND m.membership_revision=c.membership_revision AND m.active=1 AND m.expires_at>?';
 const pageNumber=value=>{if(!Number.isSafeInteger(value)||value<0||value>10000)throw messagingError('invalid-argument','Invalid bounded message page');return value;};
 const visibleKinds=access=>['internal','internal_group','customer_support','support'].filter(kind=>kind==='support'?access.actions.view_support_messages||access.actions.send_support_messages:access.actions.view_internal_messages||access.actions.send_internal_messages);
 const repo={
  access:()=>check(),scope,employeeId,
  async ingestPage(page){await tx(db=>ingest(db,page));onChange('messages');},
  async checkpoint(){return tx(db=>meta(db));},
  async conversations({page=0,keyword='',category='all',filter='all',searchTab='messages'}={}){
   const access=check(),kinds=visibleKinds(access);for(const type of [...new Set(kinds.map(kind=>kind==='support'?'support':'internal'))])await authorizeAction(readActionForConversation(access.actions,type));
   pageNumber(page);
   return tx(async db=>{
    const metadata=await meta(db,['conversations','memberships']);
    if(!kinds.length)messagingDenied('No original conversation read action');
    let where=' WHERE c.tenant_id=? AND c.principal_id=? AND c.kind IN ('+kinds.map(()=>'?').join(',')+')';
    const params=[employeeId,scope.permissionRevision,now(),...keys,...kinds];
    if(category==='group'||searchTab==='groups'){where+=' AND c.kind=?';params.push('internal_group');}
    else if(category==='customer'){where+=' AND c.kind=?';params.push('customer_support');}
    else if(category==='team'||searchTab==='people'){where+=' AND c.kind IN (?,?)';params.push('internal','support');}
    if(!['all','group','customer','team'].includes(category)||!['all','unread','read','promotion','care','customer','dispatch'].includes(filter)||!['messages','people','groups','files'].includes(searchTab))throw messagingError('invalid-argument','Unknown original chat filter');
    // The filter text and search are applied in SQL to authorized stored rows,
    // not just a slice already passed to React.
    if(keyword){where+=" AND (c.search_text LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM offline_messaging_messages_v1 s WHERE s.tenant_id=c.tenant_id AND s.principal_id=c.principal_id AND s.conversation_id=c.id AND s.search_text LIKE ? ESCAPE '\\'))";params.push(like(keyword),like(keyword));}
    if(searchTab==='files')where+=" AND EXISTS(SELECT 1 FROM offline_messaging_messages_v1 s WHERE s.tenant_id=c.tenant_id AND s.principal_id=c.principal_id AND s.conversation_id=c.id AND (json_extract(s.body,'$.attachmentType') IN ('document','file','image','video') OR COALESCE(json_extract(s.body,'$.attachmentImage'),'')!=''))";
    if(filter==='customer'){where+=' AND c.kind=?';params.push('customer_support');}
    const readThrough="COALESCE((SELECT through_at FROM offline_messaging_reads_v1 r WHERE r.tenant_id=c.tenant_id AND r.principal_id=c.principal_id AND r.kind='conversation' AND r.id=c.id),0)";
    // Match the actual legacy unread predicate; an outgoing/read message is not
    // made unread merely because it is newer than the personal watermark.
    const cachedUnread="(SELECT COUNT(*) FROM offline_messaging_messages_v1 s WHERE s.tenant_id=c.tenant_id AND s.principal_id=c.principal_id AND s.conversation_id=c.id AND s.at>"+readThrough+" AND COALESCE(json_extract(s.body,'$.senderEmpId'),'')!=? AND (json_extract(s.body,'$.isRead')=0 OR json_extract(s.body,'$.seen')=0 OR lower(COALESCE(json_extract(s.body,'$.status'),json_extract(s.body,'$.readStatus'),'')) IN ('unread','new','pending','need_human')))";
    const unread="c.at>"+readThrough+" AND (COALESCE(json_extract(c.body,'$.unreadCount'),0)>0 OR "+cachedUnread+">0)";
    if(filter==='unread'){where+=' AND ('+unread+')';params.push(employeeId);}
    if(filter==='read'){where+=' AND NOT ('+unread+')';params.push(employeeId);}
    if(['promotion','care','dispatch'].includes(filter))throw messagingError('source-unavailable','This original notification-backed filter requires the complete original notification projection');
    const from=' FROM offline_messaging_conversations_v1 c'+memberJoin+where;
    const count=(await db.query('SELECT COUNT(*) AS n'+from,params))[0].n;
    const rows=await db.query('SELECT c.body,'+readThrough+' AS read_through,'+cachedUnread+' AS cached_unread'+from+' ORDER BY c.at DESC,c.id DESC LIMIT ? OFFSET ?',[employeeId,...params,MESSAGING_PAGE_SIZE,page*MESSAGING_PAGE_SIZE]);
    return {items:rows.map(row=>{const c=body(row);return {...c,unreadCount:c.lastActivityAt<=row.read_through?0:Math.max(c.unreadCount||0,row.cached_unread)};}),total:count,page,pageCount:Math.max(1,Math.ceil(count/MESSAGING_PAGE_SIZE)),start:page*MESSAGING_PAGE_SIZE,end:Math.min(count,(page+1)*MESSAGING_PAGE_SIZE),metadata:{generation:metadata.generation,checkpoint:metadata.checkpoint,cursors:metadata.cursors,localOnly:true}};
   });
  },
  async conversation(id){return tx(async db=>{await meta(db,['conversations','memberships']);const c=await membership(db,id);await authorizeAction(readActionForConversation(check().actions,c.kind));return c;});},
  async messages(id,{before=null,keyword=''}={}){
   const c=await this.conversation(id);await authorizeAction(readActionForConversation(check().actions,c.kind));
   return tx(async db=>{
    const metadata=await meta(db,['messages','memberships']);await membership(db,id);
    const queryKey=JSON.stringify([id,normalizeChatSearch(keyword)]);
    if(before&&(!sameMessagingScope(before.scope,scope)||before.generation!==metadata.generation||before.membershipRevision!==c.membershipRevision||before.queryKey!==queryKey||!Number.isSafeInteger(before.at)||typeof before.id!=='string'))messagingDenied('Stale or foreign thread cursor');
    let where=' WHERE conversation_id=?',params=[...keys,...keys,scope.sessionId,scope.permissionRevision,id];
    if(before){where+=' AND (at<? OR (at=? AND id<?))';params.push(before.at,before.at,before.id);}
    if(keyword){where+=" AND search_text LIKE ? ESCAPE '\\'";params.push(like(keyword));}
    const union="SELECT id,conversation_id,at,search_text,body,NULL AS command_id,'SYNCED' AS state FROM offline_messaging_messages_v1 s WHERE tenant_id=? AND principal_id=? AND NOT EXISTS(SELECT 1 FROM offline_messaging_pending_v1 p WHERE p.tenant_id=s.tenant_id AND p.principal_id=s.principal_id AND p.id=s.id) UNION ALL SELECT p.id,p.conversation_id,p.at,p.search_text,p.body,p.command_id,c.state FROM offline_messaging_pending_v1 p JOIN local_commands c ON c.tenant_id=p.tenant_id AND c.principal_id=p.principal_id AND c.command_id=p.command_id WHERE p.tenant_id=? AND p.principal_id=? AND c.session_id=? AND c.permission_revision=? AND p.kind='messaging.message.send'";
    const rows=await db.query('SELECT * FROM ('+union+')'+where+' ORDER BY at DESC,id DESC LIMIT ?', [...params,MESSAGING_PAGE_SIZE+1]);
    const more=rows.length>MESSAGING_PAGE_SIZE,selected=rows.slice(0,MESSAGING_PAGE_SIZE),last=selected.at(-1);
    return {items:selected.map(row=>({...body(row),localSyncState:row.state,commandId:row.command_id,serverConfirmed:row.state==='SYNCED'})).reverse(),hasOlder:more,before:more&&last?{scope:{...scope},generation:metadata.generation,membershipRevision:c.membershipRevision,queryKey,at:last.at,id:last.id}:null,metadata:{generation:metadata.generation,checkpoint:metadata.checkpoint,cursors:metadata.cursors,localOnly:true}};
   });
  },
  async notifications({page=0,keyword='',unread=false}={}){
   await authorizeAction(readNotificationAction(check().actions));pageNumber(page);
   return tx(async db=>{
    const metadata=await meta(db,['notifications']);let where=' WHERE n.tenant_id=? AND n.principal_id=?';const params=[...keys];
    if(keyword){where+=" AND n.search_text LIKE ? ESCAPE '\\'";params.push(like(keyword));}
    if(unread)where+=" AND n.at>COALESCE((SELECT MAX(through_at) FROM offline_messaging_reads_v1 r WHERE r.tenant_id=n.tenant_id AND r.principal_id=n.principal_id AND r.kind='notification' AND r.id IN ('*',n.id)),0)";
    const count=(await db.query('SELECT COUNT(*) AS n FROM offline_messaging_notifications_v1 n'+where,params))[0].n;
    const rows=await db.query('SELECT n.body FROM offline_messaging_notifications_v1 n'+where+' ORDER BY n.at DESC,n.id DESC LIMIT ? OFFSET ?',[...params,MESSAGING_PAGE_SIZE,page*MESSAGING_PAGE_SIZE]);
    return {items:rows.map(body),total:count,page,pageCount:Math.max(1,Math.ceil(count/MESSAGING_PAGE_SIZE)),start:page*MESSAGING_PAGE_SIZE,end:Math.min(count,(page+1)*MESSAGING_PAGE_SIZE),metadata:{generation:metadata.generation,checkpoint:metadata.checkpoint,cursors:metadata.cursors,localOnly:true}};
   });
  },
  async readWatermarks(){return tx(async db=>Object.fromEntries((await db.query('SELECT kind,id,through_at FROM offline_messaging_reads_v1 WHERE tenant_id=? AND principal_id=?',keys)).map(row=>[row.kind+':'+row.id,row.through_at])));},
  async markRead(kind,id,throughAt){
   if(!['conversation','notification'].includes(kind)||typeof id!=='string'||!id||!Number.isSafeInteger(throughAt)||throughAt<0)throw messagingError('invalid-argument','Invalid personal read watermark');
   if(kind==='conversation')await this.conversation(id);else await authorizeAction(readNotificationAction(check().actions));
   await tx(db=>db.run('INSERT INTO offline_messaging_reads_v1 VALUES (?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,kind,id) DO UPDATE SET through_at=MAX(through_at,excluded.through_at)',[...keys,kind,id,throughAt]));onChange('messages');
  },
  async createConversation(document){
   const access=check();requireQaParticipants(access,document.participantEmpIds);
   const value={...document,id:document.id||uuid(),companyId:scope.tenantId,creatorEmpId:employeeId,createdAt:now()};
   const result=await commands.enqueue({kind:'messaging.conversation.create',entityId:value.id,baseRevision:0,payload:value});onChange('messages');onQueued();return result;
  },
  async send(document){
   const c=await this.conversation(document.conversationId);
   const value={...document,id:uuid(),companyId:scope.tenantId,conversationType:c.kind,senderType:'employee',senderEmpId:employeeId,createdAt:now(),membershipRevision:c.membershipRevision,text:document.text||''};
   validateMessagingDocument(value,scope);
   const result=await commands.enqueue({kind:'messaging.message.send',entityId:value.id,baseRevision:0,payload:value});onChange('messages');onQueued();return result;
  },
  async applyReceipt(...args){const result=await commands.applyReceipt(...args);onChange('messages');return result;},
  async failLease(...args){const result=await commands.failLease(...args);onChange('messages');return result;},
  close(){closed=true;},
 };
 return Object.freeze(repo);
}
