import React, {useEffect, useRef, useState} from 'react';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import OfflineStockCountEditor,{OfflineStockCountPending,stockCountWriteAccess} from './OfflineStockCountEditor.jsx';
import OfflineWarehouseImportEditor,{importWriteAccess} from './OfflineWarehouseImportEditor.jsx';
import OfflineWarehouseImportQueue from './OfflineWarehouseImportQueue.jsx';
import {dispatchWriteAccess} from './warehouseDispatchAccess.js';
const OfflineWarehouseDispatchEditor=React.lazy(()=>import('./OfflineWarehouseDispatchEditor.jsx'));
const OfflineWarehouseDispatchQueue=React.lazy(()=>import('./OfflineWarehouseDispatchQueue.jsx'));
import {HDButton, HDBadge, HDEmptyState, HDInput, HDDateInput} from '../../design-system/components.jsx';
import {
  WAREHOUSE_SOURCES, WAREHOUSE_WRITE_GAP, warehouseSource, warehouseStoredValue,
  warehouseLineFields, warehouseStatus, warehouseImportLabel, warehouseDateRange,
  assertWarehouseRuntime, assertWarehouseDocument, warehouseErrorMessage,
} from './offlineWarehouseModel.js';

const PAGE_SIZE = 25;
const scopeIdentity = runtime => JSON.stringify(['projectId','tenantId','principalId','permissionRevision','sessionId'].map(key => runtime?.scope?.[key]));

function validPage(runtime, source, result) {
  assertWarehouseRuntime(runtime);
  const metadata = result?.metadata, cp = metadata?.checkpoint;
  if(metadata?.source !== source || metadata?.serverConfirmedOnly !== true || metadata?.financialCalculationAllowed !== false ||
    metadata?.timeZone !== 'Asia/Ho_Chi_Minh' || !cp?.generation || !Number.isSafeInteger(cp.seq) || cp.seq < 0 ||
    cp.sourceProfile !== 'legacy-v1' || !Array.isArray(result.items) || result.items.length > PAGE_SIZE ||
    (result.hasMore && typeof result.nextCursor !== 'string')) throw Error('Invalid completed warehouse directory page');
  for(const row of result.items) {
    if(row.state !== 'SERVER_CONFIRMED') throw Error('Unconfirmed warehouse record');
    if(row.document?.id && row.document.id !== row.id) throw Error('Warehouse identity mismatch');
    assertWarehouseDocument(runtime, {...row.document,id:row.id});
  }
  return result;
}

function StoredFields({fields}) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
    {fields.map(([label,value]) => <React.Fragment key={label}><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium">{warehouseStoredValue(value)}</dd></React.Fragment>)}
  </dl>;
}

function StoredMeasures({measures}) {
  const labels = {measures:'Số đo đã lưu',countedMeasures:'Số đo kiểm tồn thực tế',extraMeasures:'Số đo bổ sung'};
  return Object.entries(measures || {}).map(([key,group]) => group.items?.length ? <section key={key} className="mt-4">
    <h3 className="font-bold">{labels[key]}</h3>
    {group.items.map((row,index) => <div key={index} className="my-2 rounded-xl border p-3"><StoredFields fields={[
      ['Đơn vị',row.unit],['Số lượng đã lưu',row.quantity],['Thực tế đã lưu',row.actual],
      ['Sổ sách đã lưu',row.expected],['Chênh lệch đã lưu',row.difference],['Trạng thái đã lưu',row.status],
    ]}/></div>)}
    {group.hasMore && <p role="status">Chứng từ có hơn 100 số đo; phần này chưa hiển thị đầy đủ. Không dùng phần hiển thị để tính tồn.</p>}
  </section> : null);
}

/**
 * Existing runtime owner only. directory is Goodall's scoped SQL API, optionally
 * wrapped with createOfflineWarehouseRepository for exact stored-product detail.
 * No listener, connection, network request, write bridge or alternate cache here.
 */
export default function OfflineWarehouseWorkspace({runtime, onNavigate, directory, initialSource = 'warehouseImports', stockCountRepository = null, warehouseImportRepository = null, warehouseDispatchRepository = null,onInitialContentReady}) {
  const [source,setSource] = useState(() => warehouseSource(initialSource));
  const [draft,setDraft] = useState({text:'',from:'',through:'',employeeId:'',status:''});
  const [filters,setFilters] = useState({text:'',from:null,to:null,employeeId:null,status:null});
  const [filterError,setFilterError] = useState('');
  const [cursors,setCursors] = useState([null]),[page,setPage] = useState(0),[refresh,setRefresh] = useState(0);
  const [loaded,setLoaded] = useState(null),[detail,setDetail] = useState(null);
  const [stockEditor,setStockEditor] = useState(null),[stockRefresh,setStockRefresh] = useState(0);
  const [importEditor,setImportEditor] = useState(null),[importRefresh,setImportRefresh] = useState(0);
  const importClose=useRef(null);
  const [dispatchEditor,setDispatchEditor]=useState(null),[dispatchRefresh,setDispatchRefresh]=useState(0),dispatchClose=useRef(null);
  const [readState,setReadState] = useState(null);
  const sync = runtime.home?.status?.();
  const completedKey = JSON.stringify([sync?.generation || '',sync?.seq ?? null]);
  const queryKey = JSON.stringify([scopeIdentity(runtime),source,filters,cursors[page]]);
  const requestKey = JSON.stringify([queryKey,refresh,completedKey]);
  const activeKey = useRef(queryKey); activeKey.current = queryKey;
  const activeRequest = useRef(requestKey); activeRequest.current = requestKey;
  const lastQuery = useRef(queryKey),initialSourceRef = useRef(initialSource),readTask = useRef(null),loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const detailTicket = useRef(0);
  const detailPanel = useRef(null);
  useAppScreenBack(() => {
    // Editors own draft confirmation. Navigation cannot silently discard them.
    if(runtime.isCurrent() && dispatchEditor) {dispatchClose.current?.();return true;}
    if(runtime.isCurrent() && importEditor) {importClose.current?.();return true;}
    if(runtime.isCurrent() && stockEditor) {setStockEditor(null);return true;}
    if(!runtime.isCurrent() || detail?.key !== queryKey) return false;
    detailTicket.current++;setDetail(null);return true;
  });
  useEffect(() => {if(detail?.key === queryKey) detailPanel.current?.focus();},[detail,queryKey]);
  useEffect(() => {
    if(initialSourceRef.current === initialSource) return;
    initialSourceRef.current = initialSource;
    setSource(warehouseSource(initialSource));setCursors([null]);setPage(0);
  },[initialSource]);
  useEffect(() => {
    let active = true;
    if(lastQuery.current !== queryKey) {lastQuery.current = queryKey;setDetail(null);setStockEditor(null);detailTicket.current++;}
    // Activity reattaches effects. A completed unchanged query retains its UI;
    // an in-flight query is reused rather than opening a second SQLite read.
    if(loadedRef.current?.requestKey === requestKey && loadedRef.current.result && loadedRef.current.directory === directory) return;
    setReadState({key:requestKey,pending:true});
    if(readTask.current?.key !== requestKey || readTask.current.directory !== directory) readTask.current = {key:requestKey,directory,promise:Promise.resolve().then(() => {
      assertWarehouseRuntime(runtime);
      if(runtime.appSession.sourceProfile === 'native-isolation-v1') throw Object.assign(Error('Unmapped native warehouse source'),{code:'source-unavailable'});
      if(!directory?.page) throw Error('Warehouse directory not attached');
      return directory.page(source,{...filters,limit:PAGE_SIZE,cursor:cursors[page]});
    })};
    readTask.current.promise.then(value => {
      if(!active || activeRequest.current !== requestKey) return;
      const result = validPage(runtime,source,value);
      setLoaded({key:queryKey,requestKey,directory,result});
      setReadState({key:requestKey,pending:false});
      setDetail(previous => previous?.key === queryKey && JSON.stringify(previous.checkpoint) !== JSON.stringify(result.metadata.checkpoint) ? null : previous);
    }).catch(error => {
      if(!active || activeRequest.current !== requestKey) return;
      readTask.current = null;
      const invalid = ['permission-denied','unauthenticated','stale-checkpoint','source-unavailable'].includes(error?.code);
      if(invalid) {setLoaded(null);setDetail(null);detailTicket.current++;}
      setReadState({key:requestKey,pending:false,error:warehouseErrorMessage(error),invalid});
    });
    return () => {active = false;};
  },[runtime,directory,queryKey,requestKey]);
  useEffect(()=>{if(runtime.isCurrent()&&loaded?.key===queryKey&&readState?.key===requestKey&&!readState.pending&&!readState.error)onInitialContentReady?.(source);},[runtime,loaded,queryKey,readState,requestKey,source,onInitialContentReady]);

  let allowed = true;
  try {assertWarehouseRuntime(runtime);} catch {allowed = false;}
  if(!allowed) return <section role="alert" className="p-4">Phiên hoặc quyền xem kho đã thay đổi. Vui lòng mở lại khu vực làm việc.</section>;
  if(runtime.appSession.sourceProfile === 'native-isolation-v1') return <section role="status" className="p-4">Nguồn native hiện tại có bút toán và số dư kho riêng; chưa có ánh xạ được xác nhận sang phiếu nhập, xuất hoặc kiểm tồn của sản phẩm. Chưa thể hiển thị các phiếu này.</section>;
  const descriptor = WAREHOUSE_SOURCES[source];
  const knownCheckpointChanged = loaded?.result && sync?.generation && Number.isSafeInteger(sync?.seq) &&
    (sync.generation !== loaded.result.metadata.checkpoint.generation || sync.seq !== loaded.result.metadata.checkpoint.seq);
  const invalidRead = readState?.key === requestKey && readState.invalid;
  const result = loaded?.key === queryKey && !knownCheckpointChanged && !invalidRead ? loaded.result : null;
  const error = readState?.key === requestKey ? readState.error : null, pending = !result && !error;
  const activeDetail = detail?.key === queryKey && !knownCheckpointChanged && !invalidRead ? detail : null;
  const checkpoint = result?.metadata.checkpoint;
  const syncedCheckpoint = sync?.state === 'SYNCED' && sync.generation === checkpoint?.generation && sync.seq === checkpoint?.seq;
  const employeeOptions = (runtime.appSession.employees || []).filter(employee => employee.companyId === runtime.scope.tenantId);
  const employeeName = id => employeeOptions.find(employee => employee.id === id)?.name || id || 'Chưa ghi nhận';
  const sourceAllowed = runtime.capabilities.includes(descriptor.capability);
  const stockRepositoryReady = source === 'warehouseStockCounts' && stockCountRepository?.ready === true && stockCountRepository.protocolVersion === 1 &&
    ['projectId','tenantId','principalId','permissionRevision','sessionId'].every(key => stockCountRepository.scope?.[key] === runtime.scope[key]) &&
    stockCountRepository.employeeId === runtime.appSession.currentUser.id && runtime.capabilities.includes('home.stock.read');
  const canCreateCount = stockRepositoryReady && stockCountWriteAccess(runtime,stockCountRepository,'stockCount.create');
  const importRepositoryReady=source==='warehouseImports'&&warehouseImportRepository?.ready===true&&warehouseImportRepository.protocolVersion===1;
  const canCreateImport=importRepositoryReady&&importWriteAccess(runtime,warehouseImportRepository,'warehouseImport.create');
  const dispatchRepositoryReady=source==='warehouseDispatches'&&warehouseDispatchRepository?.ready===true&&warehouseDispatchRepository.protocolVersion===1;
  const canCreateDispatch=dispatchRepositoryReady&&dispatchWriteAccess(runtime,warehouseDispatchRepository,'warehouseDispatch.create');

  function changeSource(next) {if(importEditor||dispatchEditor)return;setSource(next);setPage(0);setCursors([null]);setDraft({text:'',from:'',through:'',employeeId:'',status:''});setFilters({text:'',from:null,to:null,employeeId:null,status:null});setFilterError('');}
  function applyFilters(event) {
    event.preventDefault();if(dispatchEditor)return;
    try {const range = warehouseDateRange(draft.from,draft.through);setFilters({...range,text:draft.text.trim(),employeeId:draft.employeeId || null,status:draft.status.trim() || null});setCursors([null]);setPage(0);setRefresh(value => value+1);setFilterError('');}
    catch {setFilterError('Khoảng ngày chưa hợp lệ. Ngày kết thúc phải từ ngày bắt đầu trở đi.');}
  }
  async function openDetail(item, cursor = null) {
    const ticket = ++detailTicket.current, key = queryKey;
    setDetail({key,item,checkpoint,pending:true});
    try {
      assertWarehouseRuntime(runtime);
      if(!directory?.detail) {
        if(activeKey.current === key) setDetail({key,item,checkpoint,unavailable:true});
        return;
      }
      const value = await directory.detail(source,item.id,{checkpoint,cursor,limit:PAGE_SIZE});
      if(ticket !== detailTicket.current || activeKey.current !== key) return;
      assertWarehouseRuntime(runtime);
      if(JSON.stringify(value.metadata?.checkpoint) !== JSON.stringify(checkpoint) || value.metadata?.projection !== 'warehouse-stored-detail-v1') throw Error('Warehouse detail checkpoint changed');
      if(value.document) assertWarehouseDocument(runtime,value.document);
      if(!Array.isArray(value.items) || value.items.length > PAGE_SIZE) throw Error('Unbounded warehouse lines');
      if(value.hasMore && typeof value.nextCursor !== 'string') throw Error('Warehouse line cursor missing');
      for(const line of value.items) if(line.document?.companyId && line.document.companyId !== runtime.scope.tenantId) throw Error('Warehouse product scope changed');
      setDetail({key,item,checkpoint,value});
    } catch(failure) {if(ticket === detailTicket.current && activeKey.current === key) setDetail({key,item,checkpoint,error:warehouseErrorMessage(failure)});}
  }

  return <section className="space-y-4 p-4 pb-24" data-offline-warehouse={source}>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold text-slate-500">Kho hàng · Bản đã lưu trên thiết bị</p><h1 className="text-xl font-black">{descriptor.label}</h1></div>
      {onNavigate && <HDButton disabled={Boolean(dispatchEditor)} variant="secondary" onClick={() => onNavigate('home')}>Trang chủ</HDButton>}
    </header>
    <nav className="flex flex-wrap gap-2" aria-label="Chức năng kho">
      {Object.entries(WAREHOUSE_SOURCES).filter(([key])=>!runtime.business?.readSources||runtime.business.readSources.includes(key)).map(([key,value]) => <HDButton key={key} disabled={Boolean(importEditor||dispatchEditor)} variant={source === key ? 'primary' : 'secondary'} aria-current={source === key ? 'page' : undefined} onClick={() => changeSource(key)}>{value.label}</HDButton>)}
    </nav>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3" aria-label="Quyền ghi kho Offline">
      <p className="text-sm">{dispatchRepositoryReady?'Chỉ hỗ trợ phiếu xuất một dòng ngoài đơn đặt. Máy chủ kiểm tra tồn, đơn vị và giá; phiếu gắn đơn đặt/hóa đơn/giao hàng hoặc sổ kho cần hợp đồng gốc riêng.':importRepositoryReady?'Phiếu nhập và chi phí liên quan được lưu cùng giao dịch trên thiết bị, chờ máy chủ xác nhận.':stockRepositoryReady?'Phiếu kiểm tồn được lưu trên thiết bị và kiểm tra quyền tạo, sửa, lưu trữ riêng.':WAREHOUSE_WRITE_GAP.message}</p>
      <div className="mt-2 flex flex-wrap gap-2"><HDButton disabled={Boolean(importEditor||dispatchEditor)||(!canCreateCount&&!canCreateImport&&!canCreateDispatch)} onClick={() => canCreateDispatch?setDispatchEditor({id:null,readSource:'local'}):canCreateImport?setImportEditor({id:null,readSource:'local'}):setStockEditor({id:null})}>{descriptor.action}</HDButton>{!stockRepositoryReady&&!importRepositoryReady&&!dispatchRepositoryReady&&<><HDButton disabled variant="secondary">Sửa phiếu</HDButton><HDButton disabled variant="secondary">Xóa phiếu</HDButton></>}</div>
    </section>
    {stockRepositoryReady&&stockEditor&&<OfflineStockCountEditor key={JSON.stringify([scopeIdentity(runtime),stockEditor.id])} runtime={runtime} repository={stockCountRepository} id={stockEditor.id} onClose={()=>setStockEditor(null)} onSaved={()=>setStockRefresh(value=>value+1)}/>}
    {stockRepositoryReady&&<OfflineStockCountPending runtime={runtime} repository={stockCountRepository} refreshToken={stockRefresh} onEdit={id=>setStockEditor({id})}/>}
    {importRepositoryReady&&importEditor&&<OfflineWarehouseImportEditor key={JSON.stringify([scopeIdentity(runtime),importEditor.id,importEditor.readSource||'local'])} runtime={runtime} repository={warehouseImportRepository} id={importEditor.id} readSource={importEditor.readSource||'local'} closeRequestRef={importClose} onClose={()=>setImportEditor(null)} onSaved={()=>setImportRefresh(value=>value+1)}/>}
    {importRepositoryReady&&<OfflineWarehouseImportQueue runtime={runtime} repository={warehouseImportRepository} disabled={Boolean(importEditor)} refreshToken={importRefresh} onEdit={id=>{if(!importEditor)setImportEditor({id,readSource:'local'});}}/>}
    {dispatchRepositoryReady&&dispatchEditor&&<React.Suspense fallback={<p role="status">Đang mở trình sửa xuất kho…</p>}><OfflineWarehouseDispatchEditor key={JSON.stringify([scopeIdentity(runtime),dispatchEditor.id,dispatchEditor.readSource||'local'])} runtime={runtime} repository={warehouseDispatchRepository} id={dispatchEditor.id} readSource={dispatchEditor.readSource||'local'} closeRequestRef={dispatchClose} onClose={()=>setDispatchEditor(null)} onSaved={()=>setDispatchRefresh(value=>value+1)}/></React.Suspense>}
    {dispatchRepositoryReady&&<React.Suspense fallback={<p role="status">Đang mở hàng chờ xuất kho…</p>}><OfflineWarehouseDispatchQueue runtime={runtime} repository={warehouseDispatchRepository} disabled={Boolean(dispatchEditor)} refreshToken={dispatchRefresh} onOpen={id=>{if(!dispatchEditor)setDispatchEditor({id,readSource:'local'});}}/></React.Suspense>}
    <form onSubmit={applyFilters} className="grid gap-3 rounded-2xl border bg-white p-3 sm:grid-cols-2" aria-label="Lọc chứng từ kho">
      <HDInput label="Tìm chứng từ" maxLength={128} value={draft.text} placeholder="Mã phiếu, tên sản phẩm trên phiếu, ghi chú" onChange={event => setDraft({...draft,text:event.target.value})}/>
      <label className="grid gap-1 text-sm">Nhân viên lập phiếu<select className="rounded-xl border p-2" value={draft.employeeId} onChange={event => setDraft({...draft,employeeId:event.target.value})}><option value="">Tất cả nhân viên được cấp quyền</option>{employeeOptions.map(employee => <option key={employee.id} value={employee.id}>{employee.name || employee.id}</option>)}</select></label>
      <HDDateInput label="Từ ngày nghiệp vụ" value={draft.from} onChange={event => setDraft({...draft,from:event.target.value})}/>
      <HDDateInput label="Đến hết ngày nghiệp vụ" value={draft.through} onChange={event => setDraft({...draft,through:event.target.value})}/>
      <HDInput label="Trạng thái nguồn (đúng giá trị đã lưu)" maxLength={128} value={draft.status} placeholder="Để trống để xem tất cả" onChange={event => setDraft({...draft,status:event.target.value})}/>
      <div className="flex items-end gap-2"><HDButton type="submit">Áp dụng bộ lọc</HDButton><HDButton variant="secondary" onClick={async() => {try{await directory.syncSource?.(source);setCursors([null]);setPage(0);setRefresh(value => value+1);}catch(error){setFilterError(warehouseErrorMessage(error));}}}>Tải lại danh sách</HDButton></div>
      {filterError && <p role="alert" className="text-sm text-rose-700">{filterError}</p>}
      <p className="text-xs text-slate-500 sm:col-span-2">Ngày nghiệp vụ theo múi giờ Việt Nam. Chứng từ không có ngày vẫn hiện khi không lọc ngày. Danh sách gồm cả phiếu lưu trữ và ghi rõ trạng thái.</p>
    </form>
    <div role="status" className="text-sm text-slate-600">
      {result?.metadata.coverage ? <>Phạm vi đã lưu: {result.metadata.coverage.cachedRows} / {result.metadata.coverage.totalSourceRows} phiếu · {result.metadata.coverage.mode==='stored-only'?'Đang lọc trong phần đã lưu trên thiết bị':'Trang truy vấn máy chủ đã lưu'} · {result.metadata.coverage.completeSource?'Đã lưu đủ nguồn Nhập kho':'Còn chứng từ chưa được lưu; không phải toàn bộ nguồn'}</> : checkpoint ? <>Nguồn hoàn tất đến {checkpoint.dayKey} · Checkpoint {checkpoint.seq} · {syncedCheckpoint ? 'Đã đồng bộ nguồn máy chủ' : sync?.state === 'SYNCING' ? 'Đang đồng bộ; đang xem bản hoàn tất đã lưu' : sync?.state === 'SYNC_FAILED' ? 'Đồng bộ chưa thành công; đang xem bản hoàn tất đã lưu' : 'Bản hoàn tất trên thiết bị; tải lại danh sách để đối chiếu nguồn mới'}</> : 'Chưa xác nhận nguồn hoàn tất cho danh sách này.'}
    </div>
    {!sourceAllowed && <p role="alert">Phiên này chưa được cấp quyền xem {descriptor.label.toLowerCase()} Offline. Cần cập nhật quyền từ phiên trực tuyến được cấp phép và đồng bộ lại.</p>}
    {pending && <p role="status" aria-busy="true">Đang đọc chứng từ kho từ thiết bị…</p>}
    {result && readState?.key === requestKey && readState.pending && <p role="status" aria-busy="true">Đang đối chiếu lại danh sách; giữ bản hoàn tất đang xem…</p>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-rose-800">{error}</p>}
    {result?.items.length === 0 && <HDEmptyState title={result.metadata.coverage&&!result.metadata.coverage.completeSource?"Chưa thấy chứng từ trong phạm vi đã đọc":"Không có chứng từ phù hợp"} description={result.metadata.coverage&&!result.metadata.coverage.completeSource?"Có thể còn chứng từ chưa được lưu. Khi Online, mở trang tiếp theo hoặc truy vấn lại; khi Offline, chỉ lọc phần đã lưu.":"Hãy kiểm tra bộ lọc ngày, nhân viên hoặc trạng thái."}/>}
    {result && <div className="space-y-3" aria-label="Danh sách chứng từ kho">
      {result.items.map(item => {const row = {...item.document,id:item.id}, status = warehouseStatus(source,row);return <article key={item.id} className="rounded-2xl border bg-white p-4">
        <div className="flex items-start justify-between gap-2"><div><h2 className="font-bold">{row.productName || row.groupName || descriptor.singular}</h2><p className="break-all text-xs text-slate-500">{item.id}</p></div><HDBadge>{status.label}</HDBadge></div>
        <p className="mt-2 text-sm">Ngày nghiệp vụ: {item.businessDate || 'Chưa ghi nhận'} · Nhân viên: {employeeName(row.empId || row.createdByEmpId)}</p>
        {source === 'warehouseDispatches' && <p className="text-sm">Khách hàng: {row.customerName || row.customerNameSnapshot || 'Chưa ghi nhận'}</p>}
        {row.note && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{row.note}</p>}
        <HDButton variant="secondary" disabled={Boolean(dispatchEditor)} className="mt-3" onClick={() => {void openDetail(item);}}>Mở chi tiết</HDButton>
      </article>;})}
      <nav className="flex items-center justify-between gap-2" aria-label="Trang chứng từ kho">
        <HDButton variant="secondary" disabled={page === 0} onClick={() => setPage(value => value-1)}>Trang trước</HDButton><span>Trang {page+1} · {result.items.length} phiếu trên trang</span>
        <HDButton variant="secondary" disabled={!result.hasMore} onClick={() => {setCursors(previous => [...previous.slice(0,page+1),result.nextCursor]);setPage(value => value+1);}}>Trang sau</HDButton>
      </nav>
    </div>}
    {activeDetail && <section ref={detailPanel} tabIndex={-1} className="rounded-2xl border-2 border-emerald-200 bg-white p-4" aria-label="Chi tiết chứng từ kho" aria-busy={activeDetail.pending || undefined}>
      <div className="mb-4 flex items-center justify-between gap-2"><h2 className="font-black">{descriptor.singular}</h2><HDButton variant="secondary" onClick={() => {detailTicket.current++;setDetail(null);}}>Đóng chi tiết</HDButton></div>
      {activeDetail.pending && <p role="status">Đang đọc chi tiết đã lưu…</p>}
      {activeDetail.error && <p role="alert">{activeDetail.error}</p>}
      {activeDetail.unavailable && <p role="status">Chi tiết sản phẩm chưa được gắn vào bộ đọc kho của phiên này. Chưa có dữ liệu để hiển thị đơn vị hoặc đơn giá lịch sử.</p>}
      {activeDetail.value && !activeDetail.value.document && <p role="status">Không còn chứng từ này trong nguồn hoàn tất. Hãy tải lại danh sách.</p>}
      {activeDetail.value?.document && <>
        {stockRepositoryReady&&<HDButton variant="secondary" onClick={()=>setStockEditor({id:activeDetail.item.id})}>Mở phiếu để sửa / lưu trữ / đối chiếu</HDButton>}
        {dispatchRepositoryReady&&<HDButton variant="secondary" disabled={Boolean(dispatchEditor)} onClick={()=>setDispatchEditor({id:activeDetail.item.id,readSource:'feed'})}>Mở xuất kho để đối chiếu / sửa / lưu trữ trong phạm vi hỗ trợ</HDButton>}
        {importRepositoryReady&&<HDButton variant="secondary" disabled={Boolean(importEditor)} onClick={()=>setImportEditor({id:activeDetail.item.id,readSource:'feed'})}>Mở nhập kho để sửa / lưu trữ / đối chiếu chi phí</HDButton>}
        <StoredFields fields={[
          ['Mã phiếu',activeDetail.item.id],['Ngày nghiệp vụ',activeDetail.item.businessDate],
          ['Nhóm hàng',activeDetail.value.document.groupName ?? activeDetail.value.document.productGroup],
          ['Nhân viên lập',employeeName(activeDetail.value.document.empId || activeDetail.value.document.createdByEmpId)],
          ['Nhà cung cấp',activeDetail.value.document.supplier ?? activeDetail.value.document.supplierName],
          ['Khách hàng',activeDetail.value.document.customerName ?? activeDetail.value.document.customerNameSnapshot],
          ['Kho',activeDetail.value.document.warehouseName ?? activeDetail.value.document.warehouseId],
          ['Nguồn nhập',source === 'warehouseImports' ? warehouseImportLabel(activeDetail.value.document) : undefined],
          ['Lý do kiểm tồn',activeDetail.value.document.reason],['Ghi chú',activeDetail.value.document.note],
        ]}/>
        <p className="my-3 rounded-xl bg-slate-50 p-3 text-xs">Các số lượng, đơn vị và giá dưới đây là giá trị đã lưu. “Chưa ghi nhận” không được coi là 0. Không suy đơn vị lịch sử, không tính lại thành tiền hay tồn kho từ trang đang xem.</p>
        {activeDetail.value.items.map(line => <section key={line.ordinal} className="my-3 rounded-xl border p-3"><h3 className="mb-2 font-bold">Dòng sản phẩm {line.ordinal+1}</h3><StoredFields fields={warehouseLineFields(line.document)}/></section>)}
        {activeDetail.value.hasMore && <HDButton variant="secondary" onClick={() => {void openDetail(activeDetail.item,activeDetail.value.nextCursor);}}>Trang dòng sản phẩm tiếp theo</HDButton>}
        {activeDetail.value.items[0]?.ordinal > 0 && <HDButton variant="secondary" onClick={() => {void openDetail(activeDetail.item);}}>Về dòng sản phẩm đầu</HDButton>}
        <StoredMeasures measures={activeDetail.value.measures}/>
        <p className="mt-3 text-xs text-slate-500">Văn bản dài hiển thị tối đa {activeDetail.value.metadata.stringLimit} ký tự mỗi trường. Chứng từ gốc và các dòng khác không bị sửa.</p>
      </>}
    </section>}
  </section>;
}

