import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {validateOfflineOrderDocument} from '../utils/offlineOrderDocument.js';
export async function createOfflineOrderRepository(options){
 const {database,session,authorize}=options,scope=session.scope,keys=[scope.tenantId,scope.principalId];
 const check=()=>{if(!session.isCurrent())throw Error('Phiên đơn hàng đã đóng');};
 const tx=work=>database.transaction(async db=>{check();const r=await work(db);check();return r;});
 await tx(db=>db.run('CREATE TABLE IF NOT EXISTS offline_orders_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,command_id TEXT NOT NULL,server_json TEXT,receipt_json TEXT,PRIMARY KEY(tenant_id,principal_id,id))'));
 const commands=createOfflineCommandRepository({...options,
  async onEnqueue(db,command){
   if(command.kind!=='order.create')throw Error('Unsupported Offline order change');validateOfflineOrderDocument(command.payload,scope.tenantId);
   if(options.duplicateSignature){
    const signature=options.duplicateSignature(command.payload);
    const local=await db.query("SELECT body FROM offline_orders_v1 WHERE tenant_id=? AND principal_id=? AND json_extract(body,'$.customerId')=?",[...keys,command.payload.customerId]);
    const source=await db.query("SELECT body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND source='orders' AND json_extract(body,'$.customerId')=?",[...keys,command.payload.customerId]);
    if([...local,...source].some(row=>options.duplicateSignature(JSON.parse(row.body))===signature))throw Error('Đơn hàng này đã tồn tại trên thiết bị. Không tạo lại đơn trùng.');
   }
   await db.run('INSERT INTO offline_orders_v1 VALUES (?,?,?,?,?,?,?)',[...keys,command.entityId,JSON.stringify(command.payload),command.commandId,null,null]);
  },
  async onReceipt(db,{commandId,entityId,receipt}){
   const row=(await db.query('SELECT * FROM offline_orders_v1 WHERE tenant_id=? AND principal_id=? AND id=?',[...keys,entityId]))[0];
   if(!row||row.command_id!==commandId||receipt.kind!=='order.create')throw Error('Order receipt scope mismatch');
   if(receipt.outcome==='accepted'){
    validateOfflineOrderDocument(receipt.document,scope.tenantId);
    const local=JSON.parse(row.body);if(receipt.document.id!==local.id||JSON.stringify(receipt.document.items)!==JSON.stringify(local.items)||receipt.document.amount!==local.amount)throw Error('Order receipt changed intent');
   }
   await db.run('UPDATE offline_orders_v1 SET server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND id=?',[receipt.outcome==='accepted'?JSON.stringify(receipt.document):null,JSON.stringify(receipt),...keys,entityId]);
  },
 });
 const select='SELECT o.*,c.state,c.idempotency_key FROM offline_orders_v1 o JOIN local_commands c ON c.tenant_id=o.tenant_id AND c.principal_id=o.principal_id AND c.command_id=o.command_id WHERE o.tenant_id=? AND o.principal_id=?';
 const decode=row=>({...JSON.parse(row.body),localSyncState:row.state,idempotencyKey:row.idempotency_key,commandId:row.command_id,serverConfirmed:row.state==='SYNCED'});
 let mutations;
 const mutationRepository=()=>mutations||=(import('../features/orders/offlineOrderMutations.js').then(({createOfflineOrderMutations})=>createOfflineOrderMutations(options)).catch(error=>{mutations=null;throw error;}));
 return Object.freeze({...commands,
  mutationRepository,
  async applyReceipt(candidate,command,receipt){if(command.kind==='order.create')return commands.applyReceipt(candidate,command,receipt);if(!['order.update','order.archive'].includes(command.kind))throw Error('Unsupported order receipt');return (await mutationRepository()).applyReceipt(candidate,command,receipt);},
  async update(id,patch,base){return (await mutationRepository()).enqueue({...base,id,kind:'order.update',patch});},
  async archive(id,isArchived,base){return (await mutationRepository()).enqueue({...base,id,kind:'order.archive',patch:{isArchived}});},
  async mutationConflict(id){return (await mutationRepository()).conflict(id);},
  async create(document){validateOfflineOrderDocument(document,scope.tenantId);await authorize({scope,kind:'order.create'});const existing=await this.detail(document.id);if(existing){const body={...existing};for(const key of ['localSyncState','idempotencyKey','commandId','serverConfirmed'])delete body[key];if(JSON.stringify(body)!==JSON.stringify(document))throw Error('Order identity already has another intent');return {commandId:existing.commandId,state:existing.localSyncState,serverConfirmed:existing.serverConfirmed};}return commands.enqueue({kind:'order.create',entityId:document.id,baseRevision:0,payload:document});},
  async page(){await authorize({scope,kind:'order.read'});return tx(async db=>(await db.query(select+' ORDER BY c.created_at DESC LIMIT 100',keys)).map(decode));},
  async detail(id){await authorize({scope,kind:'order.read'});return tx(async db=>{const row=(await db.query(select+' AND o.id=?',[...keys,id]))[0];return row?decode(row):null;});},
 });
}
