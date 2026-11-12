import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {HDButton, HDCard, HDDateInput, HDFilterBar, HDPageHeader, HDSearchBar, HDSelect} from '../../design-system/index.js';
import {recordStartupEvent} from '../../services/startupTelemetry.js';
import {businessDayKey} from '../../utils/businessDate.js';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import {CASHFLOW_COMMANDS} from '../../data/offlineCashflowRepository.js';
import OfflineCashflowEditor from './OfflineCashflowEditor.jsx';
import OfflineCashflowQueue from './OfflineCashflowQueue.jsx';
import {createVisibleFinanceReadPlan} from './visibleFinanceReadPlan.js';
import {
  CASHFLOW_APPROVAL_STATUS, getDateKeyFromAnyValue, getEntityTimestamp, getPaymentDateSource,
  getPaymentMethodLabel, getPaymentSourceLabel, parseInputCurrency, isCashflowOfficial,
  isPayosPaymentRecord, requiresCashflowApproval,
} from '../customers/productCRMShared.jsx';
import {
  createFinancePresentation, createFinanceFilters, financeSearchInputTime, financeReadAccess, FINANCE_WRITE_UNAVAILABLE,
  readFinanceDetail, readFinancePage, supportsFinanceApprovalFilter, financeDirectoryOptions, FINANCE_PAGE_SIZE,
} from './offlineFinanceModel.js';

const presentation = createFinancePresentation({CASHFLOW_APPROVAL_STATUS, getDateKeyFromAnyValue,
  getEntityTimestamp, getPaymentDateSource, isCashflowOfficial, isPayosPaymentRecord, requiresCashflowApproval});
const money = new Intl.NumberFormat('vi-VN', {maximumFractionDigits: 20});
const formatMoney = value => value === null ? 'Chưa có số tiền' : `${money.format(value)} đ`;
const signedMoney = value => value === null ? 'Chưa có số tiền' : `${value < 0 || Object.is(value, -0) ? '−' : '+'}${money.format(Math.abs(value))} đ`;
const dateLabel = value => value ? value.split('-').reverse().join('/') : 'Chưa có ngày tài chính';
const initialFilters = () => createFinanceFilters();

function TransactionStatus({transaction}) {
  return <div className="flex flex-wrap gap-2 text-xs">
    <span className={`rounded-full px-2 py-1 font-bold ${transaction.approval.value === 'rejected' ? 'bg-rose-50 text-rose-700' : transaction.approval.value === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{transaction.approval.label}</span>
    <span className="rounded-full bg-slate-100 px-2 py-1">{transaction.syncLabel}</span>
    {transaction.debtRepayment && <span className="rounded-full bg-blue-50 px-2 py-1">Chi trả nợ</span>}
  </div>;
}

function employeeLabel(item, employees) {
  const id = item.empId || item.createdByEmpId;
  return employees.find(employee => employee.id === id)?.name || item.employeeName || item.createdByName || item.collectorName || (id ? `Nhân viên · ${id}` : 'Chưa có người lập');
}

function OfficialNote({transaction}) {
  if (transaction.official === true) return null;
  return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{transaction.official === null
    ? 'Bản danh mục chưa có đủ trường để xác định phiếu đã vào thu chi chính thức. Cần sổ đối chiếu đầy đủ.'
    : 'Chưa trừ công nợ và chưa tính vào chi phí chính thức.'}</p>;
}

function titleFor(transaction) {
  const item = transaction.document;
  return transaction.expense ? item.note || item.category || 'Khoản chi'
    : item.customerName || item.payerName || item.note || 'Khoản thu';
}

function TransactionDetail({runtime, directory, selected, employees, onClose, onEdit, canEdit}) {
  const [state, setState] = useState({row: null, error: '', loading: true});
  useEffect(() => {
    let active = true;
    readFinanceDetail({runtime, directory, ...selected}).then(row => {
      if (active) setState({row, error: '', loading: false});
    }).catch(error => {if (active) setState(previous => ({...previous, error: error.message, loading: false}));});
    return () => {active = false;};
  }, [runtime, directory, selected]);
  const denied = financeReadAccess(runtime, directory);
  const transaction = !denied && state.row ? presentation.present(selected.source, state.row) : null;
  const item = transaction?.document;
  return <HDCard className="space-y-4 p-4" aria-label="Chi tiết thu chi">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Chi tiết thu chi</h2><HDButton variant="secondary" onClick={onClose}>Quay lại danh sách</HDButton></div>
    {state.loading && <p role="status">Đang đọc phiếu từ SQLite…</p>}
    {(denied || state.error) && <p role="alert">{denied || state.error}</p>}
    {transaction && <>
      <h3 className="break-words font-bold">{transaction.expense ? 'Phiếu chi' : 'Phiếu thu'} · {titleFor(transaction)}</h3>
      <p className={`text-2xl font-black ${transaction.signedAmount < 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{signedMoney(transaction.signedAmount)}</p>
      <TransactionStatus transaction={transaction}/>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 text-sm [&>dd]:break-words">
        <dt>Mã phiếu</dt><dd>{item.code || item.voucherCode || item.paymentCode || transaction.id}</dd>
        <dt>Ngày tài chính</dt><dd>{dateLabel(transaction.dateKey)}</dd>
        <dt>Người lập</dt><dd>{employeeLabel(item, employees)}</dd>
        <dt>Số tiền nguồn</dt><dd>{formatMoney(transaction.amount)}</dd>
        {transaction.expense ? <><dt>Khoản chi</dt><dd>{item.category || 'Chưa có phân loại'}</dd></> : <>
          <dt>Khách hàng</dt><dd>{item.customerName || item.customerId || 'Chưa có thông tin khách hàng'}</dd>
          <dt>Hình thức</dt><dd>{getPaymentMethodLabel(item)}</dd>
          <dt>Nguồn thu</dt><dd>{getPaymentSourceLabel(item)}</dd>
          <dt>Mã đơn</dt><dd>{item.matchedOrderCode || item.paymentOrderCode || item.orderCode || item.orderId || 'Chưa gắn đơn'}</dd>
        </>}
        <dt>Ghi chú</dt><dd className="whitespace-pre-wrap">{item.note || 'Chưa có ghi chú'}</dd>
      </dl>
      <OfficialNote transaction={transaction}/>
      <p className="text-xs text-slate-600">Chi tiết từ danh mục nguồn đã lưu; nội dung dài có thể bị giới hạn. Không phải sổ đối chiếu tài chính đầy đủ.</p>
      {!transaction.expense && <p className="text-sm text-slate-600">Phân bổ công nợ và tiền dư cần sổ đối chiếu đầy đủ; màn hình này không suy ra từ các trang phiếu đã tải.</p>}
      <HDButton disabled={!canEdit || Boolean(state.error)} aria-describedby="offline-finance-write-reason" onClick={() => onEdit(selected.source,selected.id)}>Sửa phiếu thủ công</HDButton>
    </>}
  </HDCard>;
}

function FinanceSourceList({runtime, directory, fetchDirectory = directory, source, filters, employees, onSelect, inputTrace, onChooseDay, onInitialCommit}) {
  const queryKey = JSON.stringify(filters);
  const owner = useRef(null), completed = useRef(null);
  if (!owner.current || owner.current.runtime !== runtime || owner.current.directory !== directory || owner.current.queryKey !== queryKey) owner.current = {runtime,directory,queryKey};
  const identity = owner.current;
  const [page, setPage] = useState({identity: null, rows: [], head: null, nextCursor: null, loading: true, error: ''});
  const operation = useRef(0), busy = useRef(false);
  const measuredTrace = useRef(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    // Activity reattaches effects with identical deps. A completed same-query
    // page/cursor stays intact until a real identity change or explicit reload.
    if (completed.current?.identity === identity && completed.current.reload === reload) return () => {operation.current++;busy.current=false;};
    let active = true;
    let settled = false;
    const trace = measuredTrace.current === inputTrace ? null : inputTrace;
    const ticket = ++operation.current;
    busy.current = true;
    setPage(previous => previous.identity === identity ? {...previous,loading:true,error:''}
      : {identity, rows: [], head: null, nextCursor: null, loading: true, error: ''});
    readFinancePage({runtime, directory: fetchDirectory, source, filters: JSON.parse(queryKey)}).then(result => {
      settled = true;
      if (active && ticket === operation.current) {completed.current={identity,reload};setPage({identity, rows: result.rows, head: result.head, nextCursor: result.nextCursor, loading: false, error: '', inputTrace: trace});}
    }).catch(error => {
      settled = true;
      if (active && ticket === operation.current) setPage(previous => ({...previous,identity,loading:false,error:error.message,inputTrace:trace}));
    }).finally(() => {if (active && ticket === operation.current) busy.current = false;});
    return () => {
      active = false;operation.current++;busy.current = false;
      if (trace && !settled) recordStartupEvent('finance.search.superseded', {queryId: trace.id, source, elapsedMs: performance.now() - trace.startedAt});
    };
  }, [runtime, directory, fetchDirectory, source, queryKey, identity, reload, inputTrace]);

  const current = page.identity === identity;
  const loadMore = async () => {
    if (!current || busy.current || !page.nextCursor) return;
    const ticket = ++operation.current;
    busy.current = true;
    setPage(previous => ({...previous, loading: true, error: ''}));
    try {
      const result = await readFinancePage({runtime, directory, source, filters, after: page.nextCursor, head: page.head});
      if (ticket !== operation.current) return;
      const ids = new Set(page.rows.map(row => row.id));
      if (result.rows.some(row => ids.has(row.id))) throw Error('Nguồn Thu chi đã thay đổi hoặc trùng phiếu. Hãy tải lại danh sách.');
      setPage(previous => ({...previous, rows: [...previous.rows, ...result.rows], nextCursor: result.nextCursor, loading: false}));
    } catch (error) {
      if (ticket === operation.current) setPage(previous => ({...previous, loading: false, error: error.message}));
    } finally {if (ticket === operation.current) busy.current = false;}
  };
  const denied = financeReadAccess(runtime, directory);
  const rows = current && !denied ? page.rows : [];
  const loading = !current || page.loading;
  useLayoutEffect(() => {
    // Result OR error DOM for this actual query is committed. Promise resolve,
    // row count, loading-shell commits and frame callbacks are not readiness.
    if(current&&!loading&&!denied)onInitialCommit?.(source);
  }, [current, loading, denied, source, onInitialCommit]);
  useLayoutEffect(() => {
    const trace = page.inputTrace;
    if (!current || denied || loading || !trace || trace !== inputTrace || measuredTrace.current === trace) return;
    measuredTrace.current = trace;
    // DOM is committed. Include event dispatch, React scheduling, the complete
    // authorized SQL request and result rendering, not just query execution.
    recordStartupEvent('finance.search.input-to-result', {queryId: trace.id, source,
      inputToResultMs: performance.now() - trace.startedAt, outcome: page.error ? 'error' : 'result',
      rows: rows.length, endpoint: 'dom-commit'});
  }, [current, denied, loading, page, inputTrace, source, rows.length]);
  const today = businessDayKey(Date.now());
  return <HDCard className="space-y-3 p-3" aria-label={source === 'payments' ? 'Danh sách thu' : 'Danh sách chi phí'}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">{source === 'payments' ? 'Danh sách thu' : 'Danh sách chi phí'}</h2>
      <HDButton variant="secondary" size="sm" onClick={() => setReload(value => value + 1)} disabled={loading}>Tải lại</HDButton>
    </div>
    {current && page.head && <p className="text-xs text-slate-600">Bản nguồn hoàn tất lưu lúc {new Date(page.head.capturedAt).toLocaleString('vi-VN')} · {rows.length} phiếu đã tải trong bộ lọc này.</p>}
    {current && page.head && <div className="space-y-2 text-sm text-slate-600">
      <p>Ngày dữ liệu: {dateLabel(page.head.dayKey)} · Hôm nay: {dateLabel(today)}.{page.head.dayKey !== today ? ' Ngày dữ liệu khác hôm nay; kết quả hôm nay có thể trống trong bản đã lưu.' : ''}</p>
      {page.head.dayKey !== today && <HDButton variant="secondary" size="sm" onClick={() => onChooseDay(page.head.dayKey)}>Chọn ngày dữ liệu {dateLabel(page.head.dayKey)}</HDButton>}
    </div>}
    {(denied || current && page.error) && <p role="alert">{denied || page.error}</p>}
    {loading && <p role="status">Đang đọc phiếu từ SQLite…</p>}
    {rows.length > 0 && (loading || page.error) && <p role="status" className="text-sm text-amber-800">Đang giữ bản đã xem. Thao tác trên phiếu tạm khóa cho đến khi kiểm tra lại nguồn thành công.</p>}
    {current && !loading && !page.error && !denied && rows.length === 0 && <p className="p-4 text-sm text-slate-500">{page.nextCursor ? 'Trang đã đọc chưa có phiếu đang hoạt động. Có thể tải thêm.' : 'Chưa có giao dịch nào phù hợp bộ lọc trong bản dữ liệu hoàn tất đã lưu.'}</p>}
    <ul className="space-y-3" aria-busy={loading}>
      {rows.map(row => {
        const transaction = presentation.present(source, row);
        return <li key={row.id}><button type="button" disabled={loading || Boolean(page.error)} onClick={() => onSelect({source, id: row.id, head: page.head})}
          className="w-full space-y-2 rounded-2xl border border-slate-200 bg-white p-3 text-left disabled:opacity-60" aria-label={`Chi tiết ${transaction.expense ? 'phiếu chi' : 'phiếu thu'} ${row.document.code || row.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><strong className="min-w-0 break-words">{titleFor(transaction)}</strong><span className={`font-black ${transaction.signedAmount < 0 ? 'text-orange-700' : 'text-emerald-700'}`}>{signedMoney(transaction.signedAmount)}</span></div>
          <p className="text-xs text-slate-600">Ngày {dateLabel(transaction.dateKey)} · {employeeLabel(row.document, employees)}</p>
          <TransactionStatus transaction={transaction}/>
          <OfficialNote transaction={transaction}/>
        </button></li>;
      })}
    </ul>
    {current && page.nextCursor && <HDButton variant="secondary" loading={loading} onClick={loadMore}>Tải thêm {source === 'payments' ? 'phiếu thu' : 'phiếu chi'}</HDButton>}
    {current && !loading && page.head && !page.nextCursor && <p className="text-xs text-slate-500">Đã hết phiếu phù hợp trong bản nguồn đã chọn.</p>}
  </HDCard>;
}

// Navigation/lifecycle stay with the native host. This route consumes its
// existing signed runtime and directory; it owns only filters and loaded pages.
export default function OfflineFinanceWorkspace({runtime, onNavigate, directory, cashflow, onInitialContentReady}) {
  const [filters, setFilters] = useState(initialFilters);
  const [type, setType] = useState('all');
  const visibleDirectory=useMemo(()=>{
    if(type!=='all')return directory;
    try{return createVisibleFinanceReadPlan(directory,['payments','expenses'].map(source=>({source,options:{...financeDirectoryOptions(directory,source,filters),cursor:null,limit:FINANCE_PAGE_SIZE}})));}
    catch{return directory;}
  },[directory,filters,type]);
  const [selected, setSelected] = useState(null);
  const [editor,setEditor]=useState(null), [editorOpen,setEditorOpen]=useState(false), [queueRefresh,setQueueRefresh]=useState(0), [writeError,setWriteError]=useState('');
  const saving=useRef(false), editTicket=useRef(0), alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;editTicket.current++;};},[]);
  const repository=cashflow || runtime?.cashflow;
  useEffect(()=>runtime.subscribe(topic=>{if(topic==='cashflow')setQueueRefresh(value=>value+1);}),[runtime]);
  const inputTrace = useRef(null), searchSequence = useRef(0);
  const employees = runtime?.appSession?.employees || [];
  const denied = financeReadAccess(runtime, directory);
  const scopeKey = JSON.stringify(runtime?.scope);
  const draftCurrent=editor?.runtime===runtime&&editor?.repository===repository&&editor?.scopeKey===scopeKey;
  const editing=editorOpen&&draftCurrent;
  const canWrite=(source,operation)=>import.meta.env?.MODE==='emulator' && repository?.protocol==='offline-cashflow-v1'
    && /^demo-[a-z0-9-]+$/.test(repository.projectId||'') && runtime?.isCurrent?.()
    && runtime.capabilities?.includes(CASHFLOW_COMMANDS[source]?.[operation]);
  const selection = selected?.runtime === runtime && selected?.scopeKey === scopeKey ? selected.value : null;
  const invalidDates = Boolean(filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo);
  const initialContent=useRef(null),initialQuery=JSON.stringify(filters);
  if(!initialContent.current||initialContent.current.runtime!==runtime||initialContent.current.directory!==directory||initialContent.current.query!==initialQuery||initialContent.current.type!==type){
    initialContent.current={runtime,directory,query:initialQuery,type,required:type==='all'?['payments','expenses']:[type],committed:new Set(),emitted:false};
  }
  const contentPlan=initialContent.current;
  const onListInitialCommit=useCallback(source=>{
    if(initialContent.current!==contentPlan||!contentPlan.required.includes(source))return;
    contentPlan.committed.add(source);
    if(!contentPlan.emitted&&contentPlan.required.every(value=>contentPlan.committed.has(value))&&typeof onInitialContentReady==='function'){
      contentPlan.emitted=true;onInitialContentReady();
    }
  },[contentPlan,onInitialContentReady]);
  useLayoutEffect(()=>{
    // A filter validation error replaces the lists. It is real committed
    // content too; it must not permanently block an otherwise authorized form.
    if(invalidDates&&!denied&&!contentPlan.emitted&&typeof onInitialContentReady==='function'){
      contentPlan.emitted=true;onInitialContentReady();
    }
  },[invalidDates,denied,contentPlan,onInitialContentReady]);
  const approvalFilterReady = ['payments', 'expenses'].filter(source => type === 'all' || type === source)
    .every(source => supportsFinanceApprovalFilter(directory, source));
  const update = (key, value, eventTimestamp) => {
    inputTrace.current = key === 'search' ? {id: ++searchSequence.current, startedAt: financeSearchInputTime(eventTimestamp, performance.now())} : null;
    if (inputTrace.current) recordStartupEvent('finance.search.input', {queryId: inputTrace.current.id});
    setSelected(null);setFilters(previous => ({...previous, [key]: value}));
  };
  const chooseDay = day => {inputTrace.current = null;setFilters(previous => ({...previous, dateFrom: day, dateTo: day}));};
  const closeInner=()=>{
    if(editing){editTicket.current++;setEditorOpen(false);return true;}
    if(selection){editTicket.current++;setSelected(null);return true;}
    return false;
  };
  useAppScreenBack(closeInner);
  const openDraft=(source,mode,input,extra={})=>{
    editTicket.current++;
    if(draftCurrent&&!editor.submitted){setEditorOpen(true);setWriteError('Bản nhập trước được giữ. Hãy hoàn tất hoặc chủ động bỏ bản nhập trước khi mở phiếu khác.');return;}
    setWriteError('');setEditor({runtime,repository,scopeKey,source,mode,input,...extra,saving:false,submitted:false,error:'',message:''});setEditorOpen(true);
  };
  const createDraft=source=>openDraft(source,'create',{amount:'',date:businessDayKey(Date.now()),note:'',...(source==='payments'?{customerId:'',method:'Tiền mặt'}:{category:'Chi phí khác'})},{id:(source==='payments'?'p_':'exp_')+crypto.randomUUID()});
  const editDraft=async(source,id)=>{
    if(!canWrite(source,'update'))return;
    if(draftCurrent&&!editor.submitted){setEditorOpen(true);return;}
    const ticket=++editTicket.current;
    try{const proof=await repository.prepareEdit(source,id);if(alive.current&&ticket===editTicket.current)openDraft(source,'update',{...proof.input,amount:String(proof.input.amount)},{id,proof});}
    catch(error){if(alive.current&&ticket===editTicket.current)setWriteError(error.message);}
  };
  const resolveDraft=row=>{
    if(!canWrite(row.source,'update')){setWriteError('Thiếu quyền sửa Thu chi có chữ ký.');return;}
    openDraft(row.source,'resolve',{...row.input,amount:String(row.input.amount)},{id:row.id,serverInput:row.receipt.currentDocument,
      conflictProof:{commandId:row.commandId,currentFingerprint:row.receipt.currentFingerprint,currentRevision:row.receipt.currentRevision}});
  };
  const saveDraft=async()=>{
    if(!draftCurrent||saving.current||editor.submitted)return;
    if(!canWrite(editor.source,editor.mode==='create'?'create':'update')){setEditor(previous=>({...previous,error:'Quyền Thu chi đã hết hoặc giao thức chưa được nối.'}));return;}
    const owner=editor, input={...editor.input,amount:parseInputCurrency(editor.input.amount)};
    saving.current=true;setEditor(previous=>({...previous,saving:true,error:''}));
    try{
      const result=owner.mode==='create'?await repository.create(owner.source,input,owner.id):owner.mode==='resolve'?await repository.resolveConflict(owner.source,owner.id,input,owner.conflictProof):await repository.update(owner.proof,input);
      if(!result?.localDurable||!result.commandId)throw Error('Chưa có xác nhận giao dịch local bền vững.');
      setEditor(previous=>previous?.id===owner.id&&previous.repository===owner.repository?{...previous,saving:false,submitted:true,message:result.serverConfirmed?'Đã có biên nhận máy chủ.':'Đã lưu bền trên thiết bị. Chờ máy chủ xác nhận; chưa coi là khoản thu/chi chính thức.'}:previous);
      setQueueRefresh(value=>value+1);
      // Connectivity scheduling cannot turn an already-durable save into a
      // reported failure or generate another intent. The host owns the engine.
      void Promise.resolve().then(()=>runtime.notifySync?.()).catch(()=>{});
    }catch(error){setEditor(previous=>previous?.id===owner.id&&previous.repository===owner.repository?{...previous,saving:false,error:error.message}:previous);}
    finally{saving.current=false;}
  };
  return <section className="space-y-4" aria-label="Thu chi Offline">
    <HDPageHeader title="Thu chi" description="Phiếu thu và phiếu chi từ bản nguồn hoàn tất trên thiết bị." onBack={typeof onNavigate === 'function' ? () => {if(!closeInner())onNavigate('home');} : undefined}/>
    <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Danh sách phân trang không phải tổng thu, tổng chi hay số dư. Trạng thái máy chủ đã xác nhận không thay cho phê duyệt thu chi.</p>
    <p id="offline-finance-write-reason" className="text-sm text-slate-600">{repository?.protocol==='offline-cashflow-v1'?'Development · Chỉ hỗ trợ báo thu tiền mặt chờ xác nhận và chi thủ công trong quyền có chữ ký. Phiếu liên kết và xác nhận thanh toán dùng quy trình gốc.':FINANCE_WRITE_UNAVAILABLE}</p>
    <div className="flex flex-wrap gap-2"><HDButton disabled={Boolean(denied)||!canWrite('payments','create')} aria-describedby="offline-finance-write-reason" onClick={()=>createDraft('payments')}>Khoản thu</HDButton><HDButton disabled={Boolean(denied)||!canWrite('expenses','create')} aria-describedby="offline-finance-write-reason" onClick={()=>createDraft('expenses')}>Khoản chi</HDButton>{draftCurrent&&<HDButton variant="secondary" onClick={()=>setEditorOpen(true)}>Tiếp tục bản nhập</HDButton>}</div>
    {writeError&&<p role="alert">{writeError}</p>}
    {denied ? <p role="alert">{denied}</p> : <>
      <React.Activity mode={editing?'visible':'hidden'}>{draftCurrent&&<OfflineCashflowEditor draft={editor} onChange={(key,value)=>setEditor(previous=>({...previous,input:{...previous.input,[key]:value}}))} onSave={saveDraft} onClose={()=>{editTicket.current++;setEditorOpen(false);}} onDiscard={()=>{if(!saving.current){editTicket.current++;setEditor(null);setEditorOpen(false);}}}/>}</React.Activity>
      <React.Activity mode={!editing&&selection?'visible':'hidden'}>{selection&&<TransactionDetail key={JSON.stringify([scopeKey, selection.source, selection.id, selection.head])} runtime={runtime} directory={directory} selected={selection} employees={employees} onClose={() => setSelected(null)} onEdit={editDraft} canEdit={canWrite(selection.source,'update')}/>}</React.Activity>
      <React.Activity mode={!editing&&!selection?'visible':'hidden'}>
      {repository?.protocol==='offline-cashflow-v1'&&<OfflineCashflowQueue repository={repository} refresh={queueRefresh} onResolve={resolveDraft}/>}
      <HDSearchBar label="Tìm kiếm thu chi" placeholder="Tìm mã phiếu, nội dung, khách hàng…" maxLength={128} value={filters.search} onChange={event => update('search', event.target.value, event.timeStamp)} onClear={event => update('search', '', event.timeStamp)}/>
      <HDFilterBar label="Bộ lọc thu chi" className="flex flex-wrap gap-3">
        <HDDateInput label="Từ ngày" value={filters.dateFrom} onChange={event => update('dateFrom', event.target.value)}/>
        <HDDateInput label="Đến ngày" value={filters.dateTo} onChange={event => update('dateTo', event.target.value)}/>
        <HDSelect label="Loại giao dịch" value={type} onChange={event => {setType(event.target.value);update('status', 'all');}}><option value="all">Tất cả thu chi</option><option value="payments">Khoản thu</option><option value="expenses">Khoản chi</option></HDSelect>
        <HDSelect label="Nhân viên" value={filters.employeeId} onChange={event => update('employeeId', event.target.value)}><option value="">Tất cả trong quyền được cấp</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name || employee.id}</option>)}</HDSelect>
        <HDSelect label="Trạng thái xác nhận" value={filters.status} disabled={!approvalFilterReady} aria-describedby={!approvalFilterReady ? 'offline-finance-status-reason' : undefined} onChange={event => update('status', event.target.value)}><option value="all">Tất cả trạng thái</option><option value="pending">Chờ xác nhận</option><option value="approved">Đã xác nhận</option><option value="rejected">Không duyệt</option></HDSelect>
        <HDButton variant="secondary" onClick={() => {inputTrace.current = null;setFilters(initialFilters());setType('all');}}>Đặt lại hôm nay</HDButton>
      </HDFilterBar>
      {!approvalFilterReady && <p id="offline-finance-status-reason" className="text-sm text-slate-600">Nguồn SQLite chưa hỗ trợ lọc phê duyệt thu chi trước khi phân trang. Không dùng trạng thái nguồn thay cho Chờ xác nhận / Đã xác nhận / Không duyệt.</p>}
      {invalidDates ? <p role="alert">Ngày kết thúc phải từ ngày bắt đầu trở đi.</p> : <div className="grid gap-4 lg:grid-cols-2">
        {['payments', 'expenses'].filter(source => type === 'all' || type === source).map(source => <FinanceSourceList key={`${scopeKey}:${source}`} runtime={runtime} directory={directory} fetchDirectory={visibleDirectory} source={source} filters={filters} employees={employees} inputTrace={inputTrace.current} onChooseDay={chooseDay} onInitialCommit={onListInitialCommit} onSelect={value => setSelected({runtime, directory, scopeKey, value})}/>)}
      </div>}
      </React.Activity>
    </>}
  </section>;
}
