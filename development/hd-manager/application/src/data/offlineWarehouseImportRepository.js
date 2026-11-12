import {createOfflineCommandRepository} from './offlineCommandRepository.js';
import {IMPORT_RULES,canonicalImport,plainImport,importIdentifier,importRevision,assertImportPair,buildImportValues,validateImportPayload,applyImportIntent,normalizeLeadingLabel} from '../features/warehouse/warehouseImportProtocol.js';
const deny=message=>{throw Object.assign(Error(message),{code:'permission-denied'});};
export async function createOfflineWarehouseImportRepository(options){
  const {database,session,deviceId,employeeId,authorize,digest,protocol,projectId}=options,now=options.now||Date.now;
  if(options.development!==true||!/^demo-[a-z0-9-]+$/.test(projectId||'')||!importIdentifier(employeeId)||!importIdentifier(deviceId)||typeof digest!=='function')deny('Cần Runtime Development hiện có và nhân viên được xác minh.');
  const scope=Object.freeze({...session.scope}),keys=[scope.tenantId,scope.principalId];
  const ready=protocol?.version===1&&protocol.serverCAS===true&&protocol.atomicOutbox===true&&protocol.receiptDispatch===true&&protocol.atomicImportExpense===true;
  const check=()=>{if(!session.isCurrent(scope)||Object.keys(scope).some(k=>scope[k]!==session.scope[k]))deny('Phiên nhập kho đã đóng.');};
  async function access(kind='warehouseImport.read'){
    // Same authority boundary as cashflow: four-key lifecycle scope, project
    // from the existing signature verifier, capabilities from its signed body.
    const verify=kind==='warehouseImport.read'?authorize:(options.authorizeWrite||authorize);
    check();const grant=await verify({scope,kind:'home.read'});check();
    if(!Number.isSafeInteger(grant?.expiresAtMs)||now()>=grant.expiresAtMs||grant.projectId!==projectId||!['tenantId','principalId','permissionRevision','sessionId'].every(k=>grant[k]===scope[k])||!['home.read','home.imports.read','home.cashflow.read',...(kind==='warehouseImport.read'?[]:[IMPORT_RULES[kind]?.capability])].every(cap=>cap&&grant.capabilities?.includes(cap))||grant.appSession?.user?.id!==employeeId||grant.appSession.user.companyId!==scope.tenantId||grant.appSession.sourceProfile!==undefined)deny('Thiếu quyền nhập kho/chi phí có chữ ký còn hiệu lực.');return grant;
  }
  const tx=work=>database.transaction(async db=>{await access();const result=await work(db);await access();return result;});
  await tx(async db=>{
    await db.run('CREATE TABLE IF NOT EXISTS offline_warehouse_imports_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,id TEXT NOT NULL,local_json TEXT NOT NULL,base_json TEXT NOT NULL,last_command_id TEXT NOT NULL,server_json TEXT,receipt_json TEXT,PRIMARY KEY(tenant_id,principal_id,id))');
    await db.run('CREATE TABLE IF NOT EXISTS offline_warehouse_import_receipts_v1 (tenant_id TEXT NOT NULL,principal_id TEXT NOT NULL,command_id TEXT NOT NULL,id TEXT NOT NULL,receipt_json TEXT NOT NULL,PRIMARY KEY(tenant_id,principal_id,command_id))');
  });
  const select='SELECT i.*,c.state FROM offline_warehouse_imports_v1 i JOIN local_commands c ON c.tenant_id=i.tenant_id AND c.principal_id=i.principal_id AND c.command_id=i.last_command_id WHERE i.tenant_id=? AND i.principal_id=?';
  const overlay=async(db,id)=>(await db.query(select+' AND i.id=?',[...keys,id]))[0];
  async function head(db){
    const h=(await db.query(`SELECT h.generation,h.captured_at,h.day_key,
      json_extract(h.snapshot_json,'$.feedGeneration') AS feed_generation,
      json_extract(h.snapshot_json,'$.feedSeq') AS feed_seq,
      json_extract(h.snapshot_json,'$.sourceProfile') AS source_profile,
      json_extract(h.snapshot_json,'$.availableSources') AS available_sources,
      json_extract(h.snapshot_json,'$.sourceCounts.warehouseImports') AS import_count,
      json_extract(h.snapshot_json,'$.sourceCounts.expenses') AS expense_count,
      json_extract(h.snapshot_json,'$.sourceCounts.companies') AS company_count,
      c.applied_seq,c.reported_seq FROM offline_home_head_v1 h JOIN offline_home_feed_checkpoint_v1 c ON c.tenant_id=h.tenant_id AND c.principal_id=h.principal_id AND c.revision=h.revision AND c.generation=h.generation WHERE h.tenant_id=? AND h.principal_id=? AND h.revision=?`,[...keys,scope.permissionRevision]))[0];
    const sources=h&&JSON.parse(h.available_sources||'null');
    if(!h||h.feed_generation!==h.generation||!Number.isSafeInteger(h.feed_seq)||h.feed_seq!==h.applied_seq||h.reported_seq!==h.applied_seq)throw Object.assign(Error('Nguồn nhập kho và chi phí chưa cùng checkpoint hoàn tất.'),{code:'source-catchup'});
    if((h.source_profile??'legacy-v1')!=='legacy-v1'||!['warehouseImports','expenses'].every(s=>sources?.includes(s))||![h.import_count,h.expense_count].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Nguồn nhập kho và chi phí chưa cùng checkpoint hoàn tất.');
    return {...h,seq:h.feed_seq,sources};
  }
  async function source(db,h,source,id){
    const rows=await db.query('SELECT body FROM offline_home_feed_records_v1 WHERE tenant_id=? AND principal_id=? AND generation=? AND source=? AND id=? AND seq<=?',[...keys,h.generation,source,id,h.seq]);
    if(rows.length>1)throw Error('Nguồn nhập kho trùng định danh.');return rows.length?plainImport(JSON.parse(rows[0].body)):null;
  }
  async function feedPair(db,id){
    const h=await head(db),pair=assertImportPair({document:await source(db,h,'warehouseImports',id),expense:await source(db,h,'expenses',`exp_warehouse_import_${id}`)},scope.tenantId,id);
    return pair;
  }
  function commandStore(uuid=options.uuid){return createOfflineCommandRepository({...options,uuid,authorize:request=>access(request.kind),
    async onEnqueue(db,command){
      await access(command.kind);const p=validateImportPayload(command.kind,command.payload),row=await overlay(db,command.entityId);
      assertImportPair(p.base,scope.tenantId,command.entityId);
      const other=await db.query("SELECT command_id FROM local_commands WHERE tenant_id=? AND principal_id=? AND entity_id=? AND state!='SYNCED'",[...keys,`exp_warehouse_import_${command.entityId}`]);
      if(other.length)throw Error('Phiếu chi đang có ý định chưa đối soát; không ghi đè.');
      if(row&&row.state!=='SYNCED'){
        const receipt=row.receipt_json&&JSON.parse(row.receipt_json);
        if(row.state!=='CONFLICT_REQUIRES_REVIEW'||p.resolvesConflictId!==row.last_command_id||receipt?.outcome!=='conflict'||receipt.currentFingerprint!==p.baseFingerprint||canonicalImport(receipt.current)!==canonicalImport(p.base))throw Error('Phiếu đang chờ hoặc cần đối chiếu; giữ nguyên ý định đã lưu.');
      }else if(command.kind==='warehouseImport.create'&&row)throw Error('Mã phiếu nhập đã tồn tại.');
      // Queue the exact pair the user reviewed, even if the feed moved since
      // opening the form. Only server paired CAS may accept or conflict it.
      const planned=applyImportIntent(p.base,command.kind,p.values,{id:command.entityId,tenantId:scope.tenantId,employeeId,editedAt:p.editedAt,mutationId:command.commandId});
      await db.run('INSERT INTO offline_warehouse_imports_v1 VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,principal_id,id) DO UPDATE SET local_json=excluded.local_json,base_json=excluded.base_json,last_command_id=excluded.last_command_id,receipt_json=NULL',[...keys,command.entityId,JSON.stringify(planned.pair),canonicalImport(p.base),command.commandId,row?.server_json||null,null]);
    },
    async onReceipt(db,{commandId,entityId,receipt}){
      await access();const row=await overlay(db,entityId),saved=(await db.query('SELECT kind,payload_json FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,commandId]))[0];
      if(!row||!saved||!IMPORT_RULES[saved.kind]||receipt.kind!==saved.kind||receipt.entityId!==entityId)throw Error('Receipt nhập kho không khớp lệnh.');
      const p=validateImportPayload(saved.kind,JSON.parse(saved.payload_json));let accepted;
      if(receipt.outcome==='accepted'){
        accepted=assertImportPair({document:receipt.document,expense:receipt.expense},scope.tenantId,entityId);
        const expected=applyImportIntent(p.base,saved.kind,p.values,{id:entityId,tenantId:scope.tenantId,employeeId,editedAt:p.editedAt,mutationId:commandId});
        if(receipt.expenseWritten!==expected.expenseWritten||canonicalImport(accepted)!==canonicalImport(expected.pair)||await digest(canonicalImport(accepted))!==receipt.fingerprint)throw Error('Receipt thay đổi phiếu nhập hoặc phiếu chi dự kiến.');
      }else if(receipt.outcome==='conflict'){
        assertImportPair(receipt.current,scope.tenantId,entityId);
        if(await digest(canonicalImport(receipt.current))!==receipt.currentFingerprint||importRevision(receipt.current.document)!==receipt.currentRevision)throw Error('Bản đối chiếu nhập/chi phí không hợp lệ.');
      }
      await db.run('INSERT INTO offline_warehouse_import_receipts_v1 VALUES (?,?,?,?,?)',[...keys,commandId,entityId,JSON.stringify(receipt)]);
      if(row.last_command_id===commandId)await db.run('UPDATE offline_warehouse_imports_v1 SET local_json=?,server_json=?,receipt_json=? WHERE tenant_id=? AND principal_id=? AND id=?',[accepted?JSON.stringify(accepted):row.local_json,accepted?JSON.stringify(accepted):row.server_json,JSON.stringify(receipt),...keys,entityId]);
    }
  });}
  const commands=commandStore();
  async function submit(kind,id,draft,{mutationId,editedAt,base:givenBase,resolvesConflictId=null}={}){
    if(!ready)deny('Giao thức nhập kho + phiếu chi chưa được nối đầy đủ.');
    if(!IMPORT_RULES[kind]||!importIdentifier(mutationId)||!importIdentifier(id)||id.length>120)throw Error('Mã thao tác nhập kho không hợp lệ.');
    await access(kind);
    const b=kind==='warehouseImport.create'?{document:null,expense:null}:plainImport(givenBase),values=kind==='warehouseImport.archive'?null:buildImportValues(draft);
    assertImportPair(b,scope.tenantId,id);
    const payload=validateImportPayload(kind,{version:1,base:b,baseFingerprint:await digest(canonicalImport(b)),baseRevision:importRevision(b.document),values,editedAt,employeeId,resolvesConflictId});
    const retry=()=>tx(async db=>{const row=(await db.query('SELECT kind,entity_id,payload_json,state FROM local_commands WHERE tenant_id=? AND principal_id=? AND command_id=?',[...keys,mutationId]))[0];if(!row)return null;if(row.kind!==kind||row.entity_id!==id||row.payload_json!==JSON.stringify(payload))throw Error('Mã thao tác bất biến đã chứa ý định khác.');return {commandId:mutationId,entityId:id,state:row.state,serverConfirmed:row.state==='SYNCED'};});
    const old=await retry();if(old)return old;
    try{const result={...await commandStore(()=>mutationId).enqueue({kind,entityId:id,baseRevision:payload.baseRevision,payload}),entityId:id};try{options.onQueued?.(result)?.catch?.(()=>{});}catch{}return result;}
    catch(error){const old=await retry();if(old)return old;throw error;}
  }
  return Object.freeze({scope,employeeId,projectId,ready,protocolVersion:ready?1:0,applyReceipt:commands.applyReceipt,
    create:(draft,o)=>submit('warehouseImport.create',`wi_${o?.mutationId}`,draft,o),update:(id,draft,o)=>submit('warehouseImport.update',id,draft,o),archive:(id,o)=>submit('warehouseImport.archive',id,null,o),
    async groups(){return tx(async db=>{const h=await head(db);if(!h.sources.includes('companies')||!Number.isSafeInteger(h.company_count)||h.company_count<1)throw Error('Nguồn cấu hình công ty chưa được cấp quyền.');const company=await source(db,h,'companies',scope.tenantId);if(!company||company.id!==scope.tenantId||!Array.isArray(company.productGroups)||company.productGroups.length>100)throw Error('Cần danh mục nhóm công ty đã đồng bộ (tối đa 100).');return {items:[...new Set(company.productGroups.filter(x=>typeof x==='string').map(normalizeLeadingLabel).filter(Boolean))]};});},
    async detail(id,{preferFeed=false}={}){
      if(!importIdentifier(id)||typeof preferFeed!=='boolean')throw Error('Mã phiếu nhập hoặc nguồn đọc không hợp lệ.');
      return tx(async db=>{
        const row=await overlay(db,id),local=row?assertImportPair(JSON.parse(row.local_json),scope.tenantId,id):null;
        let pair=local,readSource=local?'local':'feed',sourceCatchup=false,catchupReason=null;
        // Queue/pending/conflict always retains its own durable intent. A main
        // list reopen may select the completed feed without mutating that row.
        if(!local||preferFeed&&row.state==='SYNCED'){
          let feed;
          try{feed=await feedPair(db,id);}catch(error){if(!local||error.code!=='source-catchup')throw error;sourceCatchup=true;catchupReason='feed-not-ready';}
          if(feed&&local){
            const previous=JSON.parse(row.base_json);
            if(!feed.document)catchupReason='import-not-in-feed';
            else if(importRevision(feed.document)<importRevision(local.document))catchupReason='older-import-revision';
            else if(local.expense&&!feed.expense)catchupReason='expense-not-in-feed';
            else if(canonicalImport(feed.document)===canonicalImport(local.document)&&canonicalImport(feed.expense)!==canonicalImport(local.expense)&&canonicalImport(feed.expense)===canonicalImport(previous.expense))catchupReason='expense-before-accepted-write';
            if(catchupReason)sourceCatchup=true;
            else {pair=feed;readSource='feed';}
          }else if(feed)pair=feed;
        }
        if(!pair.document)return null;
        const ownReceipt=Boolean(row&&canonicalImport(pair)===canonicalImport(local));
        return {pair,base:plainImport(pair),state:ownReceipt?row.state:'SERVER_CONFIRMED',commandId:ownReceipt?row.last_command_id:null,receipt:ownReceipt&&row.receipt_json?JSON.parse(row.receipt_json):null,readSource,sourceCatchup,catchupReason};
      });
    },
    async page({after='',limit=25}={}){if(typeof after!=='string'||!Number.isInteger(limit)||limit<1||limit>25)throw Error('Trang nhập kho không hợp lệ.');return tx(async db=>{const rows=await db.query(select+(after?' AND i.id<?':'')+' ORDER BY i.id DESC LIMIT ?',[...keys,...(after?[after]:[]),limit+1]);return {items:rows.slice(0,limit).map(row=>({id:row.id,pair:JSON.parse(row.local_json),state:row.state,commandId:row.last_command_id,receipt:row.receipt_json?JSON.parse(row.receipt_json):null})),hasMore:rows.length>limit,nextCursor:rows.length>limit?rows[limit-1].id:null};});}
  });
}
