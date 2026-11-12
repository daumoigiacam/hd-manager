import {createOfflineCommandRepository} from './offlineCommandRepository.js';
// Same SQLite owner and existing Outbox repository. No schema/connection,
// customer materialization, result cache, listener or second Runtime.
export function createOfflineCoreQueueFacade(options){
 const {database,session,authorize}=options,scope=session.scope,keys=[scope.tenantId,scope.principalId];
 const commands=createOfflineCommandRepository(options);
 const denied=()=>{throw Object.assign(Error('Customer capability required'),{code:'permission-denied'});};
 const core=async()=>{if(!session.isCurrent())denied();await authorize({scope,kind:'app.session'});if(!session.isCurrent())denied();};
 const facade={...commands};
 for(const name of ['page','detail','managerPage','explainSearch','conflict','resolveConflict','serverCursor','syncCheckpoint','ingestPage','create','update','archive'])facade[name]=async()=>denied();
 for(const name of ['countPending','list','claimDue','failLease'])facade[name]=async(...args)=>{await core();const value=await commands[name](...args);await core();return value;};
 // Module repositories own their atomic overlays and receipts. The Core shell
 // must never enqueue or acknowledge a command without its original handler.
 facade.enqueue=async()=>denied();
 facade.applyReceipt=async()=>denied();
 facade.countRetryable=async()=>{await core();const sql="SELECT COUNT(*) AS n FROM local_commands WHERE tenant_id=? AND principal_id=? AND state IN ('PENDING_SYNC','SYNCING')";
  const rows=database.readQuery?await database.readQuery(sql,keys):await database.transaction(db=>db.query(sql,keys));await core();return rows[0].n;};
 facade.activateDirectory=()=>()=>{};facade.noteDirectoryVisible=()=>{};facade.noteDirectoryRequested=()=>{};facade.closeDirectoryMemo=()=>{};
 facade.directoryReadState=()=>Object.freeze({state:'UNAVAILABLE',reason:'customers-capability-denied'});
 return Object.freeze(facade);
}
