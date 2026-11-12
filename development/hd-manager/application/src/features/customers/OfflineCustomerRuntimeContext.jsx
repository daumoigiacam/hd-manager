import React, {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {offlineCRMProfile} from './offlineCRMProfile.js';
import OfflineCustomerHistoryPanel from './OfflineCustomerHistoryPanel.jsx';
import OfflineCustomerSyncStatus from './OfflineCustomerSyncStatus.jsx';
import {currentSearchTrace,searchMark} from '../../data/crmSearchTrace.js';
import {startupMark,startupSpan,startupFrame} from '../../services/offlineStartupTrace.js';
import {useCommittedCallback} from '../../utils/useCommittedCallback.js';
import {createLatestLocalRead} from '../../data/latestLocalRead.js';
import {CUSTOMER_DIRECTORY_PAGE_SIZE} from '../../data/offlineCustomerQuery.js';

// The host owns bootstrap, writer registration, account changes and disposal.
// Supplying its existing runtime is the opt-in; this module creates no runtime.
export {OfflineCustomerRuntimeContext, useOfflineCustomerRuntime} from './offlineCustomerRuntime.js';

export function RetainedOfflineCustomerRoute({active, children}) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  // Activity preserves detail/filter/form state and disconnects hidden effects,
  // including the legacy back-navigation listener.
  return active || visited ? <React.Activity mode={active ? 'visible' : 'hidden'}>{children}</React.Activity> : null;
}

const noSubscription = () => () => {};
const EMPTY = Object.freeze([]);
const unavailableFeatures = Object.fromEntries([
  'canBulkImportCustomersPermission', 'canReassignCustomerManagerPermission',
  'canManageFixedProducts', 'canManageCustomerPrices', 'canManageDriverDebtPermission',
  'canViewSupplierImports', 'canViewCustomerLoyalty', 'canViewCustomerLoans',
  'canCreateCustomerLoan', 'canReturnCustomerLoan', 'canEditCustomerLoan', 'canDeleteCustomerLoan',
  'canManageCustomerDebtLimit', 'canViewCustomerDebtLimitAlerts', 'canViewCustomerDebt',
  'canViewCustomerStats', 'canViewCustomerOrderHistory', 'canViewCustomerPaymentHistory', 'canOpenOrderDetails',
].map(name => [name, false]));

export function OfflineCustomerAppRoute({runtime, principalId, View, ...props}) {
  const subscribe = useCallback(listener => runtime.subscribe(listener), [runtime]);
  const isCurrent = useCallback(() => runtime.isCurrent(), [runtime]);
  const current = useSyncExternalStore(subscribe, isCurrent, isCurrent);
  if (!current || !principalId || runtime.scope.principalId !== principalId
    || runtime.scope.tenantId !== props.currentCompany?.id
    || (props.employee?.companyId && props.employee.companyId !== runtime.scope.tenantId)) {
    return <p role="alert">Phiên CRM cục bộ không khớp tài khoản hoặc công ty đang đăng nhập. Cần khởi tạo lại từ phiên đã xác thực.</p>;
  }
  return <SQLiteCustomerRoute key={JSON.stringify([runtime.scope, props.privacyScope])} runtime={runtime} View={View} {...props} />;
}

function SQLiteCustomerRoute({runtime, View, ...props}) {
  useEffect(()=>runtime.activateReads?.(),[runtime]);
  const readSearch = useCallback(() => props.searchStore ? props.searchStore.getSnapshot() : props.searchKeyword || '', [props.searchStore, props.searchKeyword]);
  const search = useSyncExternalStore(props.searchStore?.subscribe || noSubscription, readSearch, readSearch);
  const [managerId, setManagerId] = useState('all');
  const [historyRange,setHistoryRange]=useState({});
  const rangeKey = JSON.stringify([historyRange.historyFrom || '', historyRange.historyTo || '']);
  const [cursor, setCursor] = useState({search, managerId, after: ''});
  const after = cursor.search === search && cursor.managerId === managerId && cursor.rangeKey === rangeKey ? cursor.after : '';
  const [localManagers, setLocalManagers] = useState([]);
  const [moreManagers, setMoreManagers] = useState(false);
  const [preparedRows]=useState(()=>runtime.takePreparedCustomerNavigation?.({search})??null);
  const firstPreparedLoad=useRef(preparedRows!==null);
  const [result, setResult] = useState(()=>preparedRows===null?null:{queryKey:JSON.stringify([search,'all',{},'',true]),rows:preparedRows});
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);
  const detailId = useRef(null);
  const detailSequence = useRef(0);
  const sequence = useRef(0);
  const mounted = useRef(true);
  const [readQueue]=useState(createLatestLocalRead);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false;readQueue.clearQueued(); };
  }, [readQueue]);
  const has = capability => runtime.capabilities.includes(`customers.${capability}`);
  const canRead = has('read') && Boolean(props.canViewAllCustomers || props.canViewAssignedCustomers || props.isSuperAdmin);
  const managerRequest = useRef(0);
  const loadManagers = useCallback(async (afterId = '') => {
    const ticket = ++managerRequest.current;
    try {
      if (!canRead) return;
      const ids = await runtime.repository.managerPage({after: afterId, limit: 100});
      if (!mounted.current || !runtime.isCurrent() || ticket !== managerRequest.current) return;
      setLocalManagers(previous => afterId ? [...new Set([...previous, ...ids])] : ids);
      setMoreManagers(ids.length === 100);
    } catch (failure) {
      if (mounted.current && runtime.isCurrent() && ticket === managerRequest.current) setError(failure.message);
    }
  }, [runtime, canRead]);
  useEffect(() => {
    if(props.showFilterPanel===false)return;
    void loadManagers();
    return () => {managerRequest.current++;};
  }, [loadManagers,props.showFilterPanel]);
  const employees = useMemo(() => {
    const records = new Map((props.employees || []).map(person => [person.id, person]));
    for (const id of localManagers) if (!records.has(id)) records.set(id, {id, name: `NVKD · ${id}`});
    for (const row of result?.rows || EMPTY) if(row.empId&&!records.has(row.empId))records.set(row.empId,{id:row.empId,name:`NVKD · ${row.empId}`});
    return [...records.values()];
  }, [props.employees, localManagers,result]);
  const historyRuntime = useMemo(() => {
    const sources = new Set([
      ...(props.canViewCustomerOrderHistory ? ['orders'] : []),
      ...(props.canViewCustomerPaymentHistory ? ['payments'] : []),
    ]);
    if (!runtime.history || !runtime.capabilities.includes('customers.history.read') || !sources.size) return null;
    // The shared panel displays all sources. Limit it to the histories the
    // normal App actually grants; a history grant never implies finance access.
    return {...runtime, history: {async page(options) {
      const page = await runtime.history.page(options);
      if (!runtime.isCurrent() || !mounted.current) throw new Error('Phiên CRM đã thay đổi.');
      return {...page, records: page.records.filter(row => sources.has(row.source)), completeness: page.completeness.filter(row => sources.has(row.source))};
    }}, refreshHistory: (options,signal) => sources.has(options.source) ? runtime.refreshHistory(options,signal) : Promise.resolve(false)};
  }, [runtime, props.canViewCustomerOrderHistory, props.canViewCustomerPaymentHistory]);
  const queryKey = JSON.stringify([search, managerId, historyRange, after, canRead]);
  const load = useCallback(() => {
    const finish=startupSpan('crm.local-page');
    const ticket = ++sequence.current;
    const traceId=currentSearchTrace();searchMark(traceId,'load-start');
    return readQueue.run(async()=>{
    if(ticket!==sequence.current||!mounted.current||!runtime.isCurrent()){finish();return;}
    try {
      const prepared=canRead&&!search&&managerId==='all'&&!after&&!historyRange.historyFrom&&!historyRange.historyTo
        ? await runtime.awaitPreparedCustomerNavigation?.({search}) : null;
      const rows = canRead ? prepared??await runtime.repository.page({search, managerId, ...historyRange, after, limit: CUSTOMER_DIRECTORY_PAGE_SIZE, traceId,directory:true}) : [];
      if (ticket === sequence.current && runtime.isCurrent()) { searchMark(traceId,'state-publish');startupMark('crm.state-publish',{rows:rows.length});setResult({queryKey, rows}); setError(''); }
    } catch (failure) {
      if (ticket === sequence.current) { setResult(null); setError(failure.message); }
    }finally{finish();}
    },finish);
  }, [readQueue,runtime, search, managerId, historyRange, after, canRead, queryKey]);
  useEffect(()=>{if(result?.queryKey===queryKey){startupMark('crm.local-data-commit',{rows:result.rows.length});startupFrame('crm.local-data',{rows:result.rows.length});}},[result,queryKey]);
  const readDetail = useCallback(async id => {
    const ticket = ++detailSequence.current;
    const superseded = () => Object.assign(new Error('Phiên đọc hồ sơ đã thay đổi.'), {code:'detail-read-superseded'});
    if (!canRead || !mounted.current || !runtime.isCurrent()) throw new Error('Không có quyền đọc hồ sơ CRM.');
    let record;
    try {record = await runtime.repository.detail(id);} catch (failure) {if(ticket !== detailSequence.current)throw superseded();throw failure;}
    if (ticket !== detailSequence.current || !mounted.current || !runtime.isCurrent()) throw superseded();
    if (!record) {detailId.current=null;setDetail(null);throw new Error('Không còn hồ sơ trong phiên CRM cục bộ.');}
    detailId.current=id;setDetail(record);
    return record;
  }, [runtime, canRead]);
  const detailFailed = useCallback(failure => {
    if(failure.code==='detail-read-superseded'||!mounted.current||!runtime.isCurrent())return;
    detailId.current=null;setDetail(null);setError(failure.message);
  }, [runtime]);
  useEffect(() => {
    if(firstPreparedLoad.current)firstPreparedLoad.current=false;else void load();
    if (detailId.current) void readDetail(detailId.current).catch(detailFailed);
    const release = runtime.subscribe(topic => {
      if(topic==='home')return;
      if(topic!=='history'||historyRange.historyFrom)void load();
      if(topic!=='history' && detailId.current)void readDetail(detailId.current).catch(detailFailed);
    });
    return () => { sequence.current++; release(); };
  }, [runtime, load, readDetail, detailFailed]);
  const onFiltersChange = useCallback(({managerId: value,historyFrom,historyTo}) => {setManagerId(value);setHistoryRange(old=>old.historyFrom===historyFrom&&old.historyTo===historyTo?old:{historyFrom,historyTo});}, []);
  const pending = result?.queryKey !== queryKey && !error;
  // Do not tear down every card while an authorized SQLite query is in flight.
  // Retain the preceding DOM, explicitly identify it as old, and block all its
  // actions until the matching result commits. The query markers below remain
  // unset, so neither callers nor benchmarks mistake old rows for new results.
  const rows = result?.rows || EMPTY;
  const listPending = pending && !detail;
  const blockPending = useCommittedCallback(event => {
    // Only stale result cards are temporarily read-only. Search/filter controls
    // and an open draft must stay usable while the asynchronous query finishes.
    if (listPending && event.target?.closest?.('[data-customer-card]')) {
      event.preventDefault();event.stopPropagation();
    }
  });
  const firstPage = useCommittedCallback(() => setCursor({search, managerId, rangeKey, after: ''}));
  const nextPage = useCommittedCallback(() => setCursor({search, managerId, rangeKey, after: rows[rows.length - 1].id}));
  const moreServer = useCommittedCallback(async () => {try {await runtime.loadMoreServer();} catch (failure) {setError(failure.message);}});
  const requirePermission = (allowed, capability) => {
    if (!mounted.current || !runtime.isCurrent() || !allowed || !has(capability)) throw new Error('Không có quyền thao tác hồ sơ CRM cục bộ.');
  };
  const committed = async work => {
    await work;
    if (!mounted.current || !runtime.isCurrent()) throw new Error('Phiên CRM đã thay đổi.');
    runtime.notifySync?.();
    if (detailId.current) await readDetail(detailId.current);
    await load();
    return {queued: true, success: true, localDurable: true, serverConfirmed: false};
  };
  const source = {
    queryReady:result?.queryKey===queryKey,
    detail,
    managerOptions: localManagers.map(id => ({value: id, label: employees.find(person => person.id === id)?.name || `NVKD · ${id}`})),
    closeDetail() {detailSequence.current++;detailId.current=null;setDetail(null);},
    historyAvailable:Boolean(historyRuntime),
    queryManaged: true, onFiltersChange,
    renderHistory: canRead && historyRuntime ? record => <OfflineCustomerHistoryPanel runtime={historyRuntime} customerId={record.id} /> : undefined,
    readDetail,
    renderStatus(record) { return <OfflineCustomerSyncStatus runtime={runtime} record={record} canResolve={Boolean(props.canEditCustomer && has('update'))} onCommitted={committed} onError={setError} />; },
  };
  const directoryVisible=useCommittedCallback(()=>{runtime.noteCustomerDirectoryVisible?.();props.onDirectoryReady?.();});
  if (!canRead) return <p role="alert">Không có quyền xem khách hàng trong phiên này.</p>;
  return <section aria-label="CRM SQLite Development" data-sql-query={result?.queryKey === queryKey ? search : undefined} data-sql-manager={result?.queryKey === queryKey ? managerId : undefined} data-sql-history-from={result?.queryKey === queryKey ? historyRange.historyFrom || '' : undefined} data-sql-history-to={result?.queryKey === queryKey ? historyRange.historyTo || '' : undefined}>
    <p className="text-xs text-slate-500 py-2">Development · Hồ sơ từ SQLite. Lịch sử chỉ gồm chứng từ đã tải; không dùng để suy ra số dư công nợ.</p>
    {error && <p role="alert">{error}</p>}
    <div role="status" aria-live="polite" className="text-xs text-slate-500 min-h-4">{listPending ? 'Đang tìm trong SQLite · Kết quả trước tạm khóa' : ''}</div>
    <div aria-busy={listPending} onClickCapture={blockPending} onKeyDownCapture={blockPending}>
    <View {...props} {...unavailableFeatures} onDirectoryReady={directoryVisible} employees={employees} customers={rows} localCustomerSource={source}
      orders={EMPTY} payments={EMPTY} expenses={EMPTY} paymentReconciliations={EMPTY} customerPoints={EMPTY} customerLoans={EMPTY} products={EMPTY} warehouseImports={EMPTY} warehouseDispatches={EMPTY}
      canAddCustomerPermission={Boolean(props.canAddCustomerPermission && has('create'))}
      canEditCustomer={Boolean(props.canEditCustomer && has('update'))}
      canEditCustomerPhoneAddress={Boolean(props.canEditCustomerPhoneAddress && has('update'))}
      canEditCustomerLocation={Boolean(props.canEditCustomerLocation && has('update'))}
      canDeleteCustomerPermission={Boolean(props.canDeleteCustomerPermission && has('archive'))}
      onAddCustomer={async (manager, input) => {
        requirePermission(props.canAddCustomerPermission, 'create');
        if(manager!==props.employee?.id&&(!runtime.capabilities.includes('customers.assign')||!runtime.appSession?.employees?.some(person=>person.id===manager&&person.companyId===runtime.scope.tenantId&&!person.isArchived)))throw Error('Không có quyền phân công NVKD này khi Offline.');
        const profile = offlineCRMProfile(input, {}, manager);
        const mutationId = input.clientMutationId;
        if (typeof mutationId !== 'string' || !/^[a-f0-9-]{32,36}$/i.test(mutationId)) throw new Error('Thiếu mã thao tác CRM.');
        return committed(runtime.repository.create({...profile, id: 'c_' + mutationId.replace(/-/g, ''), companyId: runtime.scope.tenantId, empId: manager}));
      }}
      onEditCustomer={async (id, input) => {
        requirePermission(props.canEditCustomer || props.canEditCustomerPhoneAddress || props.canEditCustomerLocation, 'update');
        const previous = await source.readDetail(id);
        const profile = offlineCRMProfile(input, previous, props.employee?.id);
        if (!props.canEditCustomer) {
          const allowed = new Set([
            ...(props.canEditCustomerPhoneAddress ? ['phone', 'address'] : []),
            ...(props.canEditCustomerLocation ? ['location', 'locationUrl', 'locationInput', 'locationLat', 'locationLng', 'mapLocation', 'locationUpdatedAt', 'locationSource'] : []),
          ]);
          for (const [field, value] of Object.entries(profile)) {
            if (!allowed.has(field) && JSON.stringify(value) !== JSON.stringify(previous[field])) throw new Error(`Không có quyền sửa trường ${field}.`);
          }
        }
        return committed(runtime.repository.update(id, profile));
      }}
      onDeleteCustomer={async id => {
        requirePermission(props.canDeleteCustomerPermission, 'archive');
        await committed(runtime.repository.archive(id, new Date().toISOString()));
        return {success: true, mode: 'archived'};
      }} />
    </div>
    <div className="flex gap-3 py-2">
      <button type="button" disabled={pending || !after} onClick={firstPage}>Trang SQLite đầu</button>
      <button type="button" disabled={pending || rows.length < CUSTOMER_DIRECTORY_PAGE_SIZE} onClick={nextPage}>Trang SQLite tiếp</button>
    </div>
    {moreManagers && <button type="button" onClick={() => void loadManagers(localManagers[localManagers.length - 1] || '')}>Tải thêm mã NVKD từ hồ sơ trên máy</button>}
    <button type="button" onClick={moreServer}>Tải thêm hồ sơ từ máy chủ</button>
  </section>;
}
