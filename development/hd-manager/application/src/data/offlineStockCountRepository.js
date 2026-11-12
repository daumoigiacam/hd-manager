import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {
  STOCK_COUNT_RULES,STOCK_COUNT_REASON_CAPABILITY,stockCountIdentifier,canonicalStockCount,publicStockCount,
  stockCountRevision,buildStockCountValues,validateStockCountPayload,applyStockCountIntent,assertLegacyStockCount,normalizeLeadingLabel,
} from '../features/warehouse/stockCountProtocol.js';

const deny=message=>{throw Object.assign(Error(message),{code:'permission-denied'});};
export async function createOfflineStockCountRepository(options){
  const {database,session,authorize,digest,deviceId,employeeId,protocol}=options,now=options.now||Date.now;
  const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
  if(!stockCountIdentifier(employeeId)||typeof digest!=='function'||(scope.deviceId!==undefined&&scope.deviceId!==deviceId))throw Error('Verified stock-count employee/device/digest required');
  const ready=protocol?.version===1&&protocol.serverCAS===true&&protocol.receiptDispatch===true&&protocol.atomicOutbox===true;
  const check=()=>{if(!session.isCurrent(scope)||Object.keys(scope).some(key=>session.scope[key]!==scope[key]))deny('Phiên kiểm tồn đã đóng.');};
  async function access(kind='stockCount.read'){
    check();const grant=await authorize({scope,kind});check();
    const cap=kind==='stockCount.read'?'home.stock.read':STOCK_COUNT_RULES[kind]?.capability;
    if(!cap||!Number.isSafeInteger(grant?.expiresAtMs)||now()>=grant.expiresAtMs||
      !['tenantId','principalId','permissionRevision','sessionId'].every(key=>grant[key]===scope[key])||
      !['home.read','home.stock.read',cap].every(value=>grant.capabilities?.includes(value))||
      grant.appSession?.user?.id!==employeeId||grant.appSession.user.companyId!==scope.tenantId||grant.appSession?.sourceProfile==='native-isolation-v1')deny('Thiếu quyền kiểm tồn có chữ ký hoặc phiên đã hết hạn.');
    return grant;
  }
  const tx=work=>database.transaction(async db=>{await access();const result=await work(db);check();await access();return result;});
  await tx(async db=>{
    await db.run('CREATE TABLE IF NOT EXISTS offline_stock_counts_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,local_json TEXT NOT NULL,base_json TEXT,last_command_id TEXT NOT NULL,server_json TEXT,receipt_json TEXT,PRIMARY KEY(tenant_id,principal_id,id))');
    await db.run('CREATE TABLE IF NOT EXISTS offline_stock_count_receipts_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,command_id TEXT NOT NULL,id TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,command_id))');
  });
  const select='SELECT s.*,c.state FROM offline_stock_counts_v1 s JOIN local_commands c ON c.tenant_id=s.tenant_id AND c.principal_id=s.principal_id AND c.command_id=s.last_command_id WHERE s.tenant_id=? AND s.principal_id=?';
  const overlay=async(db,id)=>(await db.query(select+' AND s.id=?',[...keys,id]))[0];
  async function feed(db,id){
    const rows=await db.query(`SELECT r.body FROM offline_home_feed_records_v1 r
      JOIN offline_home_head_v1 h ON h.tenant_id=r.tenant_id AND h.principal_id=r.principal_id AND h.generation=r.generation
      JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation
      WHERE r.tenant_id=? AND r.principal_id=? AND h.revision=? AND r.source='warehouseStockCounts' AND r.id=? AND r.seq<=c.applied_seq
      AND json_extract(h.snapshot_json,'$.feedGeneration')=h.generation AND c.applied_seq=json_extract(h.snapshot_json,'$.feedSeq') AND c.reported_seq=c.applied_seq
      AND EXISTS (SELECT 1 FROM json_each(h.snapshot_json,'$.availableSources') WHERE value='warehouseStockCounts')
      AND COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1')='legacy-v1'`,[...keys,scope.permissionRevision,id]);
    if(rows.length>1)throw Error('Nguồn kiểm tồn trùng định danh.');
    if(!rows.length)return null;
    const document=publicStockCount(JSON.parse(rows[0].body));assertLegacyStockCount(document);
    if(document.companyId!==scope.tenantId||document.id!==id)deny('Nguồn kiểm tồn ngoài phạm vi.');return document;
  }
  async function base(db,id,row){
    const source=await feed(db,id);
    if(row?.state==='SYNCED'&&row.server_json){const accepted=JSON.parse(row.server_json);
      if(!source||canonicalStockCount(source)===canonicalStockCount(JSON.parse(row.base_json||'null'))||canonicalStockCount(source)===canonicalStockCount(accepted))return accepted;
    }
    return source;
  }
  function commandStore(uuid=options.uuid){return createOfflineCommandRepository({...options,uuid,
    async onEnqueue(db,command){
      const payload=validateStockCountPayload(command.kind,command.payload);await access(command.kind);
      const existing=await overlay(db,command.entityId);
      if(existing&&existing.state!=='SYNCED'){
        const receipt=existing.receipt_json?JSON.parse(existing.receipt_json):null;
        if(existing.state!=='CONFLICT_REQUIRES_REVIEW'||payload.resolvesConflictId!==existing.last_command_id||receipt?.outcome!=='conflict'||receipt.currentFingerprint!==payload.baseFingerprint||canonicalStockCount(receipt.currentDocument)!==canonicalStockCount(payload.baseDocument))throw Error('Phiếu đang chờ hoặc cần đối soát; không ghi đè ý định đã lưu.');
      }else if(command.kind==='stockCount.create'){
        if(existing||await feed(db,command.entityId))throw Error('Mã phiếu kiểm tồn đã tồn tại.');
      }else{
        const current=await base(db,command.entityId,existing);
        if(!current||canonicalStockCount(current)!==canonicalStockCount(payload.baseDocument))throw Error('Nguồn kiểm tồn đã đổi. Hãy tải lại trước khi sửa.');
      }
      const next=applyStockCountIntent(payload.baseDocument,command.kind,payload.values,{id:command.entityId,tenantId:scope.tenantId,employeeId,editedAt:payload.editedAt});
      await db.run('INSERT INTO offline_stock_counts_v1 VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET local_json=excluded.local_json,base_json=excluded.base_json,last_command_id=excluded.last_command_id,receipt_json=NULL',
        [...keys,command.entityId,JSON.stringify(next),JSON.stringify(payload.baseDocument),command.commandId,existing?.server_json||null,null]);
    },
    async onReceipt(db,{commandId,entityId,receipt}){
      await access();const row=await overlay(db,entityId);
      const saved=(await db.query('SELECT kind,payload_json FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,commandId]))[0];
      if(!row||!saved||!STOCK_COUNT_RULES[saved.kind]||receipt.kind!==saved.kind||receipt.entityId!==entityId)throw Error('Receipt kiểm tồn không khớp lệnh.');
      const payload=validateStockCountPayload(saved.kind,JSON.parse(saved.payload_json));
      if(receipt.outcome==='accepted'){
        const expected=publicStockCount(applyStockCountIntent(payload.baseDocument,saved.kind,payload.values,{id:entityId,tenantId:scope.tenantId,employeeId,editedAt:payload.editedAt}));
        if(canonicalStockCount(expected)!==canonicalStockCount(receipt.document)||await digest(canonicalStockCount(receipt.document))!==receipt.fingerprint)throw Error('Receipt thay đổi ý định kiểm tồn.');
      }else if(receipt.outcome==='conflict'&&receipt.currentDocument){
        assertLegacyStockCount(receipt.currentDocument);
        if(receipt.currentDocument.id!==entityId||receipt.currentDocument.companyId!==scope.tenantId||await digest(canonicalStockCount(receipt.currentDocument))!==receipt.currentFingerprint)throw Error('Bản xung đột kiểm tồn ngoài phạm vi hoặc sai fingerprint.');
      }
      await db.run('INSERT INTO offline_stock_count_receipts_v1 VALUES (?,?,?,?,?)',[...keys,commandId,entityId,JSON.stringify(receipt)]);
      if(row.last_command_id===commandId)await db.run('UPDATE offline_stock_counts_v1 SET local_json=?,server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND id=?',[
        receipt.outcome==='accepted'?JSON.stringify(receipt.document):row.local_json,receipt.outcome==='accepted'?JSON.stringify(receipt.document):row.server_json,JSON.stringify(receipt),...keys,entityId]);
    },
  });}
  const commands=commandStore();
  async function submit(kind,id,draft,{mutationId,editedAt,base:givenBase=null,resolvesConflictId=null}={}){
    if(!ready)deny('Giao thức kiểm tồn chưa được nối đầy đủ; chưa ghi lệnh.');
    if(!STOCK_COUNT_RULES[kind]||!stockCountIdentifier(mutationId)||!stockCountIdentifier(id))throw Error('Định danh kiểm tồn không hợp lệ.');
    const grant=await access(kind),values=kind==='stockCount.archive'?null:buildStockCountValues(draft);
    let baseDocument=kind==='stockCount.create'?null:publicStockCount(givenBase);
    if(kind!=='stockCount.create'&&(!baseDocument||baseDocument.id!==id||baseDocument.companyId!==scope.tenantId))throw Error('Cần đọc đầy đủ bản nguồn kiểm tồn trước khi sửa.');
    if(values&&values.reason!==(baseDocument?.reason||'')&&!grant.capabilities.includes(STOCK_COUNT_REASON_CAPABILITY))deny('Chưa có quyền ghi lý do kiểm tồn.');
    const payload=validateStockCountPayload(kind,{version:1,baseFingerprint:baseDocument?await digest(canonicalStockCount(baseDocument)):null,baseRevision:stockCountRevision(baseDocument),baseDocument,values,editedAt,employeeId,resolvesConflictId});
    if(JSON.stringify(payload).length>512000)throw Error('Phiếu kiểm tồn vượt giới hạn giao thức; cần luồng đầy đủ.');
    const retry=async()=>tx(async db=>{const row=(await db.query('SELECT kind,entity_id,payload_json,state FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,mutationId]))[0];if(!row)return null;if(row.kind!==kind||row.entity_id!==id||row.payload_json!==JSON.stringify(payload))throw Error('Mã thao tác bất biến đã chứa ý định khác.');return {commandId:mutationId,entityId:id,state:row.state,serverConfirmed:row.state==='SYNCED'};});
    const previous=await retry();if(previous)return previous;
    try{
      const result={...await commandStore(()=>mutationId).enqueue({kind,entityId:id,baseRevision:payload.baseRevision,payload}),entityId:id};
      // Optional wake-up of the EXISTING sync owner, only after durable commit.
      // A connectivity callback cannot turn a saved intent into a failed save.
      try{const wake=options.onQueued?.(result);wake?.catch?.(()=>{});}catch{}
      return result;
    }
    catch(error){const previous=await retry();if(previous)return previous;throw error;}
  }
  return Object.freeze({
    ready,protocolVersion:ready?1:0,scope,employeeId,applyReceipt:commands.applyReceipt,
    async groups(){return tx(async db=>{
      const rows=await db.query(`SELECT json_extract(h.snapshot_json,'$.feedSeq') AS seq,h.generation,groups.value AS name
        FROM offline_home_feed_records_v1 r JOIN offline_home_head_v1 h ON h.tenant_id=r.tenant_id AND h.principal_id=r.principal_id AND h.generation=r.generation
        JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation,
        json_each(r.body,'$.productGroups') groups
        WHERE r.tenant_id=? AND r.principal_id=? AND h.revision=? AND r.source='companies' AND r.id=? AND json_extract(r.body,'$.id')=?
        AND json_extract(h.snapshot_json,'$.feedGeneration')=h.generation AND r.seq<=c.applied_seq AND c.applied_seq=json_extract(h.snapshot_json,'$.feedSeq') AND c.reported_seq=c.applied_seq
        AND COALESCE(json_extract(h.snapshot_json,'$.sourceProfile'),'legacy-v1')='legacy-v1'
        AND EXISTS (SELECT 1 FROM json_each(h.snapshot_json,'$.availableSources') WHERE value='companies')
        AND groups.type='text' ORDER BY CAST(groups.key AS INTEGER) LIMIT 101`,[...keys,scope.permissionRevision,scope.tenantId,scope.tenantId]);
      if(rows.length>100||rows.some(row=>row.name.length>160))throw Error('Danh mục nhóm vượt giới hạn form; cần luồng chọn nhóm đầy đủ.');
      return {items:[...new Set(rows.map(row=>normalizeLeadingLabel(row.name)).filter(Boolean))],generation:rows[0]?.generation||null,seq:rows[0]?.seq??null};
    });},
    create:(draft,options)=>submit('stockCount.create',`wsc_${options?.mutationId}`,draft,options),
    update:(id,draft,options)=>submit('stockCount.update',id,draft,options),
    archive:(id,options)=>submit('stockCount.archive',id,null,options),
    async detail(id){if(!stockCountIdentifier(id))throw Error('Mã phiếu không hợp lệ.');return tx(async db=>{
      const row=await overlay(db,id),document=row?JSON.parse(row.local_json):await feed(db,id);
      if(!document)return null;
      const authoritative=await base(db,id,row),receipt=row?.receipt_json?JSON.parse(row.receipt_json):null;
      return {document,state:row?.state||'SERVER_CONFIRMED',commandId:row?.last_command_id||null,base:authoritative,receipt};
    });},
    async page({after='',limit=25}={}){if(typeof after!=='string'||!Number.isInteger(limit)||limit<1||limit>25)throw Error('Trang kiểm tồn không hợp lệ.');return tx(async db=>{
      const rows=await db.query(select+(after?' AND s.id<?':'')+' ORDER BY s.id DESC LIMIT ?',[...keys,...(after?[after]:[]),limit+1]);
      return {items:rows.slice(0,limit).map(row=>({id:row.id,document:JSON.parse(row.local_json),state:row.state,commandId:row.last_command_id,receipt:row.receipt_json?JSON.parse(row.receipt_json):null})),hasMore:rows.length>limit,nextCursor:rows.length>limit?rows[limit-1].id:null};
    });},
  });
}
