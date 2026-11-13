import React,{useEffect,useRef,useState} from 'react';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import {HDButton,HDCard,HDFilterBar,HDInput,HDPageHeader,HDSearchBar,HDSelect} from '../../design-system/index.js';
import {businessDayKey} from '../../utils/businessDate.js';
import OfflineAttendanceEditor from './OfflineAttendanceEditor.jsx';
const AttendanceRequestsWorkspace=React.lazy(()=>import('./AttendanceRequestsWorkspace.jsx'));
const OfflineSalaryAdvanceWorkspace=React.lazy(()=>import('../payroll/OfflineSalaryAdvanceWorkspace.jsx'));
const EmployeeProfilePanel=React.lazy(()=>import('./EmployeeProfilePanel.jsx'));
const OfflinePayrollWorkspace=React.lazy(()=>import('../payroll/OfflinePayrollWorkspace.jsx'));
import {attendanceWriteAccess,newAttendanceDraft,submitAttendanceDraft,attendanceConflictReview} from './offlineAttendanceEditorModel.js';
import {createHRFilters,HR_FINANCIAL_TYPES,HR_SOURCES,HR_WRITE_UNAVAILABLE,hrReadAccess,hrRecordTitle,hrScopeKey,
  hrSourceState,initialHRSource,readHRDetail,readHRPage} from './offlineHRModel.js';

const money=value=>typeof value==='number'&&Number.isFinite(value)?`${new Intl.NumberFormat('vi-VN').format(value)} đ`:'Chưa có số tiền nguồn';
const time=value=>{
  if(value===null||value===undefined||value==='')return 'Chưa ghi nhận';
  if(typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value))return value;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Chưa có giờ hợp lệ':date.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
};
const labels={name:'Họ tên',displayName:'Tên hiển thị',employeeCode:'Mã nhân viên',code:'Mã',phone:'Điện thoại',position:'Vị trí',
  role:'Vai trò nguồn',department:'Bộ phận',employeeId:'Nhân viên',empId:'Nhân viên',targetEmployeeId:'Nhân viên được chấm',
  status:'Trạng thái nguồn',workRole:'Vai trò chấm công',date:'Ngày nguồn',dateKey:'Ngày công',monthKey:'Tháng lương',
  periodId:'Mã kỳ',employeeName:'Tên nhân viên',reason:'Lý do',lockedByName:'Người chốt',lockedByEmployeeId:'Mã người chốt',employeeCount:'Nhân sự trong kỳ'};
const detailFields={employees:['name','displayName','employeeCode','code','phone','position','department','status'],
  attendance:['employeeId','empId','targetEmployeeId','date','dateKey','status','workRole'],
  financials:['empId','date','reason','status'],payrollSnapshots:['employeeId','employeeName','monthKey','periodId','status'],
  payrollPeriods:['monthKey','status','lockedByName','lockedByEmployeeId','employeeCount']};

function SourceBadge({row}){
  const state=hrSourceState(row);
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${state.pending?'bg-amber-50 text-amber-900':'bg-emerald-50 text-emerald-800'}`}>{state.label}</span>;
}

function PayrollResult({result}){
  if(!result)return null;
  if(result.kind!=='frozen')return <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="status">
    <strong>{result.kind==='pending-source'?'Nguồn lương còn chờ':result.kind==='needs-review'?'Bản lương cần kiểm tra':'Chưa có kết quả lương đủ điều kiện'}</strong>
    <p>{result.reason}</p>
  </div>;
  const metrics=[['netSalary','Thực nhận đã chốt'],['grossSalary','Tổng thu nhập đã chốt'],['endingDebt','Nợ chuyển kỳ đã chốt'],
    ['baseSalaryCalc','Lương cơ bản'],['commission','Hoa hồng'],['overtimePay','Tăng ca'],['supportSalary','Hỗ trợ'],
    ['responsibilitySalary','Trách nhiệm'],['roleSalary','Kiêm nhiệm'],['experienceSalary','Thâm niên'],['totalBonus','Thưởng'],
    ['evaluationBonus','Thưởng đánh giá'],['totalPenalty','Phạt'],['totalAdvance','Đã ứng'],['totalEmployeePurchase','Mua hàng cấn lương'],
    ['openingDebtApplied','Nợ đầu kỳ áp dụng'],['deductionTotal','Khấu trừ đã chốt']];
  return <section className="space-y-3" aria-label="Kết quả lương gốc đã chốt">
    <h3 className="font-bold">{result.employeeName} · {result.monthKey}</h3>
    <p className="text-sm text-slate-600">Giữ nguyên kết quả tính gốc trong bản chốt đã lưu. Không tính lại từ danh mục đang xem và không suy ra số dư công ty.</p>
    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{metrics.map(([key,label])=><div key={key} className="rounded-xl border border-slate-100 p-3">
      <dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold tabular-nums">{money(result.details[key])}</dd>
    </div>)}</dl>
    <p className="text-sm">Ngày công gốc: {result.details.workDays??'Chưa có trong bản chốt'}</p>
    <p className="text-xs text-slate-600">Chốt lúc {time(result.lockedAt)} · Chính sách {result.policyVersion} · Công thức {result.formulaVersion}</p>
  </section>;
}

function HRDetail({runtime,directory,selected,onClose,onEmployee,onEditEmployee}){
  const owner=useRef(null),completed=useRef(null);
  if(!owner.current||owner.current.runtime!==runtime||owner.current.directory!==directory||owner.current.selected!==selected)owner.current={runtime,directory,selected};
  const identity=owner.current;
  const [state,setState]=useState({identity:null,loading:true,result:null,error:''});
  useEffect(()=>{
    if(completed.current===identity)return;
    let active=true;
    setState({identity,loading:true,result:null,error:''});
    readHRDetail({runtime,directory,...selected}).then(result=>{if(active){completed.current=identity;setState({identity,loading:false,result,error:''});}})
      .catch(error=>{if(active)setState({identity,loading:false,result:null,error:error.message});});
    return()=>{active=false;};
  },[runtime,directory,selected,identity]);
  const denied=hrReadAccess(runtime,directory),ready=state.identity===identity,result=!denied&&ready?state.result:null,row=result?.row,d=row?.document;
  const employeeId=selected.source==='employees'?selected.id:d?.employeeId||d?.empId||d?.targetEmployeeId;
  return <HDCard className="space-y-4 p-4" aria-label="Chi tiết nhân sự">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Chi tiết {HR_SOURCES[selected.source].toLowerCase()}</h2><HDButton variant="secondary" onClick={onClose}>Danh sách</HDButton></div>
    {(!ready||state.loading)&&!denied&&<p role="status">Đang đọc chi tiết từ SQLite…</p>}
    {(denied||ready&&state.error)&&<p role="alert" className="text-sm text-rose-700">{denied||state.error}</p>}
    {row&&<>
      <h3 className="break-words font-bold">{hrRecordTitle(selected.source,row)}</h3>
      <SourceBadge row={row}/>
      {d.isArchived&&<p className="text-sm text-amber-800">Bản nguồn này đã được lưu trữ.</p>}
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 text-sm [&>dd]:break-words">
        <dt>Mã nguồn</dt><dd>{row.id}</dd>
        {detailFields[selected.source].map(key=><React.Fragment key={key}><dt>{labels[key]}</dt><dd>{d[key]??'Chưa có trong bản nguồn'}</dd></React.Fragment>)}
        {selected.source==='attendance'&&<><dt>Ngày công xác định</dt><dd>{row.businessDate||'Chưa có ngày công'}</dd></>}
        {selected.source==='financials'&&<><dt>Loại khoản</dt><dd>{HR_FINANCIAL_TYPES[d.type]||d.type||'Chưa phân loại'}</dd><dt>Số tiền bản nguồn</dt><dd>{money(d.amount)}</dd></>}
        {selected.source==='payrollPeriods'&&<><dt>Thời điểm chốt</dt><dd>{time(d.lockedAt)}</dd></>}
      </dl>
      {result.attendance&&<section aria-label="Giờ công theo công việc" className="space-y-2">
        <h3 className="font-bold">Giờ công theo công việc</h3>
        {result.attendance.roles.map(role=><div key={role.workRole} className="rounded-xl border p-3" data-attendance-work-role={role.workRole}><strong>{role.workRole}</strong><p>Chấm vào: {time(role.checkIn)} · Chấm ra: {time(role.checkOut)}</p><p>Trạng thái nguồn: {role.status||'Chưa ghi nhận'}</p></div>)}
        <p className="text-xs">Giữ nguyên bản nguồn đã lưu; không cộng số công hoặc suy ra tiền lương từ chi tiết này.</p>
      </section>}
      <PayrollResult result={result.payroll}/>
      <div className="flex flex-wrap gap-2">
        {employeeId&&(!directory.readSources||directory.readSources.includes('attendance'))&&<HDButton variant="secondary" onClick={()=>onEmployee(employeeId,'attendance',d.monthKey)}>Xem công nhân viên</HDButton>}
        {employeeId&&selected.source!=='payrollSnapshots'&&(!directory.readSources||directory.readSources.includes('payrollSnapshots'))&&<HDButton variant="secondary" onClick={()=>onEmployee(employeeId,'payrollSnapshots',d.monthKey)}>Xem lương đã chốt</HDButton>}
        {selected.source==='payrollPeriods'&&<HDButton variant="secondary" onClick={()=>onEmployee('','payrollSnapshots',d.monthKey)}>Xem bản chốt trong kỳ</HDButton>}
      </div>
      <p className="text-xs text-slate-600">Chi tiết danh mục chỉ gồm trường nguồn được cho phép; chữ dài có thể giới hạn 1024 ký tự. Kết quả lương chỉ xuất hiện khi bản chốt gốc vượt kiểm tra toàn vẹn.</p>
      {selected.source==='employees'&&!d.isArchived&&onEditEmployee&&<HDButton onClick={()=>onEditEmployee(row.id)}>Sửa hồ sơ nhân sự</HDButton>}
      <HDButton disabled aria-describedby="hr-write-reason">{selected.source==='attendance'?'Chấm vào / ra':selected.source==='employees'?'Sửa nhân sự':'Ghi / điều chỉnh khoản lương'}</HDButton>
    </>}
  </HDCard>;
}

export default function OfflineHRWorkspace({runtime,directory,onNavigate,initialSource='employees',attendanceRepository=null,employeeProfileRepository=null}){
  const [requestsOpen,setRequestsOpen]=useState(false);
  const [advanceOpen,setAdvanceOpen]=useState(false);
  const [employeeSelection,setEmployeeSelection]=useState(null);
  const [payrollOpen,setPayrollOpen]=useState(false);
  const [source,setSource]=useState(()=>initialHRSource(initialSource)),[filters,setFilters]=useState(createHRFilters);
  const [selected,setSelected]=useState(null),[reload,setReload]=useState(0);
  const [attendanceDraft,setAttendanceDraft]=useState(null),[attendanceQueue,setAttendanceQueue]=useState(null);
  const [deviceSetup,setDeviceSetup]=useState({busy:false,message:''});
  const attendanceLive=useRef(null);attendanceLive.current={draft:attendanceDraft,queue:attendanceQueue};
  const queryKey=JSON.stringify(filters),scopeKey=hrScopeKey(runtime);
  const owner=useRef(null),completed=useRef(null),initialSourceRef=useRef(initialSource);
  if(!owner.current||owner.current.runtime!==runtime||owner.current.directory!==directory||owner.current.source!==source
    ||owner.current.queryKey!==queryKey||owner.current.scopeKey!==scopeKey)owner.current={runtime,directory,source,queryKey,scopeKey};
  const identity=owner.current;
  const [page,setPage]=useState({identity:null,items:[],metadata:null,nextCursor:null,number:1,loading:true,error:''});
  const ticket=useRef(0),busy=useRef(false);
  const draftOwned=attendanceDraft?.runtime===runtime&&attendanceDraft?.repository===attendanceRepository&&attendanceDraft?.scopeKey===scopeKey;
  const closeDetail=()=>{
    if(advanceOpen)return false;
    if(employeeSelection){setEmployeeSelection(null);return true;}
    if(payrollOpen)return false; // The payroll child owns its draft/back stack.
    if(draftOwned&&attendanceDraft.open){setAttendanceDraft(previous=>({...previous,open:false}));return true;}
    if(!selected)return false;setSelected(null);return true;
  };
  useAppScreenBack(closeDetail);
  useEffect(()=>{
    if(initialSourceRef.current===initialSource)return;
    initialSourceRef.current=initialSource;setSource(initialHRSource(initialSource));setSelected(null);
  },[initialSource]);
  const load=async(cursor=null,number=1,checkpoint=null)=>{
    const ownTicket=++ticket.current;busy.current=true;
    setPage({identity,items:[],metadata:null,nextCursor:null,number,loading:true,error:''});
    try{
      const result=await readHRPage({runtime,directory,source,filters:JSON.parse(queryKey),cursor,checkpoint});
      if(ticket.current===ownTicket){completed.current={identity,reload};setPage({identity,...result,number,loading:false,error:''});}
    }catch(error){if(ticket.current===ownTicket)setPage({identity,items:[],metadata:null,nextCursor:null,number,loading:false,error:error.message});}
    finally{if(ticket.current===ownTicket)busy.current=false;}
  };
  useEffect(()=>{
    // Activity preserves state/refs while detaching effects. Keep a completed
    // unchanged page (including its page number, cursor and open detail).
    if(completed.current?.identity!==identity||completed.current.reload!==reload){setSelected(null);void load();}
    return()=>{ticket.current++;busy.current=false;};
  },[identity,reload]);
  const change=(key,value)=>{setSelected(null);setFilters(previous=>({...previous,[key]:value}));};
  const denied=hrReadAccess(runtime,directory),ready=page.identity===identity&&!denied;
  const rows=ready?page.items:[],loading=!ready&&!denied||ready&&page.loading,head=ready?page.metadata?.checkpoint:null;
  const selectEmployee=(employeeId,nextSource,monthKey)=>{
    setSelected(null);setSource(nextSource);setFilters(previous=>({...previous,employeeId,text:'',status:'',type:'',monthKey:monthKey||previous.monthKey}));
  };
  const today=businessDayKey(Date.now());
  const attendanceOwner=useRef(null);attendanceOwner.current={runtime,repository:attendanceRepository,scopeKey};
  const stillOwn=draft=>attendanceOwner.current.runtime===draft.runtime&&attendanceOwner.current.repository===draft.repository&&attendanceOwner.current.scopeKey===draft.scopeKey&&runtime.isCurrent();
  const openAttendance=kind=>{
    if(attendanceWriteAccess(runtime,attendanceRepository,kind))return;
    setAttendanceDraft(previous=>previous?.runtime===runtime&&previous.repository===attendanceRepository&&previous.scopeKey===scopeKey
      &&(previous.kind===kind||previous.saving||(previous.submitted&&previous.row?.state!=='SYNCED'))?{...previous,open:true}:newAttendanceDraft(runtime,attendanceRepository,kind,scopeKey));
  };
  const submitAttendance=async()=>{
    const draft=attendanceDraft;if(!draftOwned||draft.saving||draft.submitted)return;
    setAttendanceDraft(previous=>({...previous,saving:true,error:'',message:''}));
    try{const result=await submitAttendanceDraft(runtime,attendanceRepository,draft);
      if(stillOwn(draft))setAttendanceDraft(previous=>({...previous,saving:false,submitted:true,commandId:result.commandId,row:null,reviewedConflict:null,message:'Đã lưu bền trên thiết bị, chờ máy chủ. Chưa xác nhận giờ công.'}));
    }catch(error){if(stillOwn(draft))setAttendanceDraft(previous=>({...previous,saving:false,error:error.message}));}
  };
  const refreshAttendance=async()=>{
    const draft=attendanceDraft;if(!draftOwned||!draft.commandId)return;
    try{const row=await attendanceRepository.command(draft.commandId);
      if(stillOwn(draft)&&row)setAttendanceDraft(previous=>({...previous,row,submitted:['PENDING_SYNC','SYNCING','SYNCED'].includes(row.state),reviewedConflict:null,error:'',message:''}));
    }catch(error){if(stillOwn(draft))setAttendanceDraft(previous=>({...previous,error:error.message}));}
  };
  const reviewAttendance=()=>{
    try{const reviewedConflict=attendanceConflictReview(attendanceDraft.row);setAttendanceDraft(previous=>({...previous,reviewedConflict,error:''}));}
    catch(error){setAttendanceDraft(previous=>({...previous,error:error.message}));}
  };
  const loadAttendanceQueue=async()=>{
    const owner={runtime,repository:attendanceRepository,scopeKey};
    try{const items=await attendanceRepository.page({limit:20});if(stillOwn(owner))setAttendanceQueue({...owner,items,error:''});}
    catch(error){if(stillOwn(owner))setAttendanceQueue({...owner,items:[],error:error.message});}
  };
  const queueOwned=attendanceQueue?.runtime===runtime&&attendanceQueue?.repository===attendanceRepository&&attendanceQueue?.scopeKey===scopeKey;
  useEffect(()=>{
    if(!attendanceRepository)return;let active=true,reading=false,again=false;
    const refresh=async()=>{
      if(!active||!runtime.isCurrent())return;if(reading){again=true;return;}reading=true;
      try{do{again=false;const state=attendanceLive.current,draft=state?.draft,queue=state?.queue;
        if(draft?.runtime===runtime&&draft.repository===attendanceRepository&&draft.commandId){const id=draft.commandId,row=await attendanceRepository.command(id);if(active&&runtime.isCurrent()&&row)setAttendanceDraft(previous=>previous?.runtime===runtime&&previous.repository===attendanceRepository&&previous.commandId===id?{...previous,row,submitted:['PENDING_SYNC','SYNCING','SYNCED'].includes(row.state),message:row.state==='SYNCED'?'':previous.message}:previous);}
        if(queue?.runtime===runtime&&queue.repository===attendanceRepository){const items=await attendanceRepository.page({limit:20});if(active&&runtime.isCurrent())setAttendanceQueue(previous=>previous?.runtime===runtime&&previous.repository===attendanceRepository?{...previous,items,error:''}:previous);}
      }while(again&&active&&runtime.isCurrent());}catch(error){if(active&&runtime.isCurrent())setAttendanceQueue(previous=>previous?.runtime===runtime?{...previous,error:error.message}:previous);}finally{reading=false;}
    };
    const stop=runtime.subscribe(topic=>{if(topic==='attendance')void refresh();});void refresh();
    return()=>{active=false;stop();};
  },[runtime,attendanceRepository,scopeKey]);
  const registerDevice=async()=>{
    if(deviceSetup.busy||!attendanceRepository?.registerDevice)return;const owner={runtime,repository:attendanceRepository,scopeKey};setDeviceSetup({busy:true,message:''});
    try{await attendanceRepository.registerDevice();if(stillOwn(owner))setDeviceSetup({busy:false,message:'Thiết bị đã đăng ký bằng Identity Center. Yêu cầu cũ vẫn được giữ; có thể gửi lại cùng mã.'});}
    catch(error){if(stillOwn(owner))setDeviceSetup({busy:false,message:error.message});}
  };
  const retryAttendance=async()=>{
    const draft=attendanceDraft;if(!draftOwned||!draft.commandId||draft.saving||draft.row?.receipt)return;setAttendanceDraft(previous=>({...previous,saving:true,error:''}));
    try{await attendanceRepository.retryFailed(draft.commandId);const row=await attendanceRepository.command(draft.commandId);if(stillOwn(draft))setAttendanceDraft(previous=>previous?.commandId===draft.commandId?{...previous,saving:false,row,submitted:['PENDING_SYNC','SYNCING','SYNCED'].includes(row?.state),message:''}:previous);}
    catch(error){if(stillOwn(draft))setAttendanceDraft(previous=>({...previous,saving:false,error:error.message}));}
  };
  const canIn=!denied&&!attendanceWriteAccess(runtime,attendanceRepository,'attendance.check_in');
  const canOut=!denied&&!attendanceWriteAccess(runtime,attendanceRepository,'attendance.check_out');
  const activeDraft=draftOwned&&attendanceDraft.open&&!denied&&!attendanceWriteAccess(runtime,attendanceRepository,attendanceDraft.kind)?attendanceDraft:null;
  if(requestsOpen)return <React.Suspense fallback={<p>Đang mở yêu cầu công…</p>}><AttendanceRequestsWorkspace runtime={runtime} onClose={()=>setRequestsOpen(false)}/></React.Suspense>;
  if(advanceOpen)return <React.Suspense fallback={<p role="status">Đang mở ứng lương…</p>}><OfflineSalaryAdvanceWorkspace runtime={runtime} onClose={()=>setAdvanceOpen(false)}/></React.Suspense>;
  if(payrollOpen)return <React.Suspense fallback={<p role="status">Đang mở bảng lương…</p>}><OfflinePayrollWorkspace runtime={runtime} onClose={()=>setPayrollOpen(false)} onOpenAdvance={()=>{setPayrollOpen(false);setAdvanceOpen(true);}}/></React.Suspense>;
  return <main className="space-y-4 p-3 pb-20" aria-label="Nhân sự, chấm công và lương Offline">
    <HDPageHeader title="Nhân sự & lương" description="Nguồn hoàn tất đã lưu trên thiết bị" onBack={()=>{if(!closeDetail())onNavigate('home');}}/>
    <nav className="flex flex-wrap gap-2" aria-label="Nguồn nhân sự">{Object.entries(HR_SOURCES).filter(([key])=>!directory?.readSources||directory.readSources.includes(key)).map(([key,label])=><HDButton key={key}
      variant={source===key?'primary':'secondary'} aria-pressed={source===key} onClick={()=>{setSelected(null);setSource(key);}}>{label}</HDButton>)}</nav>
    {runtime.capabilities.includes('attendancePeriod.read')&&<HDButton onClick={()=>onNavigate('attendancePeriods')}>Bảng công và xác nhận</HDButton>}
    {runtime.capabilities.includes('salarySettlement.read')&&<HDButton onClick={()=>onNavigate('salarySettlements')}>Thanh toán và đối soát lương</HDButton>}
    {runtime.capabilities.includes('attendanceRequest.read')&&<HDButton onClick={()=>setRequestsOpen(true)}>Yêu cầu điều chỉnh công</HDButton>}
    {runtime.capabilities.includes('payroll.company.read')&&<HDButton onClick={()=>setPayrollOpen(true)}>Bảng lương · Chốt và điều chỉnh</HDButton>}
    {runtime.capabilities.some(cap=>cap.startsWith('salaryAdvance.'))&&<HDButton onClick={()=>setAdvanceOpen(true)}>Ứng lương · Lập và duyệt</HDButton>}
    {source==='attendance'&&(canIn||canOut)&&<HDCard className="space-y-2 p-3">
      {attendanceRepository?.registerDevice&&<HDButton variant="secondary" disabled={deviceSetup.busy} onClick={registerDevice}>{deviceSetup.busy?'Đang đăng ký thiết bị…':'Đăng ký thiết bị chấm công'}</HDButton>}
      {deviceSetup.message&&<p role="status">{deviceSetup.message}</p>}
      <div className="flex flex-wrap gap-2"><HDButton disabled={!canIn} onClick={()=>openAttendance('attendance.check_in')}>Yêu cầu chấm vào</HDButton><HDButton disabled={!canOut} onClick={()=>openAttendance('attendance.check_out')}>Yêu cầu chấm ra</HDButton><HDButton variant="secondary" onClick={loadAttendanceQueue}>Yêu cầu trên thiết bị</HDButton></div>
      {queueOwned&&<><p role="alert">{attendanceQueue.error}</p><ul className="space-y-1">{attendanceQueue.items.map(row=><li key={row.commandId}><button type="button" className="text-left text-sm" onClick={()=>setAttendanceDraft({...newAttendanceDraft(runtime,attendanceRepository,row.kind,scopeKey),workDate:row.intent.workDate,workRole:row.intent.workRole,commandId:row.commandId,row,submitted:['PENDING_SYNC','SYNCING','SYNCED'].includes(row.state)})}>{row.intent.workDate} · {row.intent.workRole} · {row.kind==='attendance.check_in'?'Vào':'Ra'} · {row.state}</button></li>)}</ul></>}
    </HDCard>}
    {employeeProfileRepository&&<React.Suspense fallback={<p role="status">Đang mở hồ sơ nhân sự…</p>}><EmployeeProfilePanel runtime={runtime} repository={employeeProfileRepository} selection={employeeSelection} onCloseSelection={()=>setEmployeeSelection(null)} visible={source==='employees'}/></React.Suspense>}
    {activeDraft&&<OfflineAttendanceEditor draft={activeDraft} onChange={(key,value)=>setAttendanceDraft(previous=>({...previous,[key]:value,reviewedConflict:null,error:'',message:''}))} onSave={submitAttendance} onClose={closeDetail} onRefresh={refreshAttendance} onReview={reviewAttendance} onRetry={retryAttendance} onNew={()=>setAttendanceDraft(newAttendanceDraft(runtime,attendanceRepository,activeDraft.kind,scopeKey))}/>}
    <HDCard className="space-y-3 p-3">
      <HDSearchBar value={filters.text} maxLength={128} label="Tìm trong nguồn nhân sự" placeholder={source==='employees'?'Tên, mã nhân viên, điện thoại…':'Tìm trong nguồn đã chọn…'}
        onChange={event=>change('text',event.target.value)} onClear={()=>change('text','')}/>
      <HDFilterBar label="Bộ lọc nhân sự">
        {source!=='employees'&&<HDInput label="Tháng" type="month" value={filters.monthKey} onChange={event=>change('monthKey',event.target.value)}/>}
        {source!=='payrollPeriods'&&<HDInput label="Mã nhân viên" value={filters.employeeId} maxLength={256} placeholder="Tất cả trong quyền đã cấp" onChange={event=>change('employeeId',event.target.value)}/>}
        {source==='financials'&&<HDSelect label="Loại khoản" value={filters.type} onChange={event=>change('type',event.target.value)}><option value="">Tất cả loại khoản</option>{Object.entries(HR_FINANCIAL_TYPES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</HDSelect>}
        {source==='attendance'&&<HDSelect label="Trạng thái công" value={filters.status} onChange={event=>change('status',event.target.value)}><option value="">Tất cả trạng thái</option><option value="late">Đi muộn</option><option value="leave">Báo nghỉ</option></HDSelect>}
      </HDFilterBar>
      {source==='attendance'&&filters.status&&<p className="text-xs text-slate-600">Bộ lọc khớp trạng thái của ít nhất một công việc. Mở chi tiết để xem riêng từng công việc; mỗi ngày công chỉ xuất hiện một lần.</p>}
    </HDCard>
    {selected?<HRDetail key={`${scopeKey}:${selected.source}:${selected.id}`} runtime={runtime} directory={directory} selected={selected} onClose={()=>setSelected(null)} onEmployee={selectEmployee} onEditEmployee={employeeProfileRepository&&runtime.capabilities.includes('employeeProfile.update')?setEmployeeSelection:null}/>:<HDCard className="space-y-3 p-3">
      <div className="flex items-center justify-between"><h2 className="font-bold">{HR_SOURCES[source]}</h2><HDButton variant="secondary" disabled={loading} onClick={()=>setReload(value=>value+1)}>Tải lại</HDButton></div>
      {(denied||ready&&page.error)&&<p role="alert" className="text-sm text-rose-700">{denied||page.error}</p>}
      {loading&&<p role="status">Đang đọc trang nhân sự từ SQLite…</p>}
      {head&&<div className="space-y-1 text-xs text-slate-600">
        <p>Checkpoint {head.generation} · seq {head.seq} · lưu {time(head.capturedAt)}.</p>
        <p>Ngày nguồn {head.dayKey} · hôm nay {today}. {source!=='employees'&&head.dayKey.slice(0,7)!==filters.monthKey?'Tháng đang chọn có thể chưa có dữ liệu trong bản đã lưu.':''}</p>
        {source!=='employees'&&head.dayKey.slice(0,7)!==filters.monthKey&&<HDButton variant="secondary" size="sm" onClick={()=>change('monthKey',head.dayKey.slice(0,7))}>Chọn tháng dữ liệu {head.dayKey.slice(0,7)}</HDButton>}
      </div>}
      <p className="text-xs text-slate-600">Mỗi trang tối đa 40 dòng. Không cộng lương, ngày công hay số dư từ các trang xem trước. Thay đổi cục bộ chưa vào checkpoint không được gộp vào bản nguồn này.</p>
      {ready&&!loading&&!page.error&&rows.length===0&&<p className="py-5 text-sm text-slate-500">Không có bản nguồn phù hợp tháng/bộ lọc trong checkpoint đã lưu.</p>}
      <ul className="space-y-2" aria-busy={loading}>{rows.map(row=><li key={row.id}>
        <button type="button" className="w-full space-y-2 rounded-xl border border-slate-100 p-3 text-left" onClick={()=>setSelected({source,id:row.id,checkpoint:head})}>
          <span className="block break-words font-semibold">{hrRecordTitle(source,row)}</span>
          {source==='employees'&&<span className="block text-sm text-slate-600">{row.document.department||row.document.position||'Chưa có bộ phận'} · {row.document.phone||row.document.employeeCode||row.id}</span>}
          {source==='attendance'&&<span className="block text-sm text-slate-600">Vào {time(row.document.checkIn)} · Ra {time(row.document.checkOut)} · {row.document.status||'Chưa có trạng thái'}</span>}
          {source==='financials'&&<span className="block text-sm">{money(row.document.amount)} · {row.businessDate||'Chưa có ngày nguồn'} · {row.document.empId||'Chưa có nhân viên'}</span>}
          {source.startsWith('payroll')&&<span className="block text-sm text-slate-600">{row.document.status||'Chưa có trạng thái kỳ'} · Mở để kiểm tra bản chốt gốc</span>}
          <SourceBadge row={row}/>{row.document.isArchived&&<span className="ml-2 text-xs text-slate-500">Đã lưu trữ</span>}
        </button>
      </li>)}</ul>
      {ready&&!page.error&&<div className="flex items-center justify-between gap-2">
        <HDButton variant="secondary" disabled={loading||page.number===1} onClick={()=>{if(!busy.current)void load();}}>Trang đầu</HDButton>
        <span className="text-xs text-slate-500">Trang {page.number} · {rows.length} dòng</span>
        <HDButton disabled={loading||!page.hasMore} onClick={()=>{if(!busy.current)void load(page.nextCursor,page.number+1,head);}}>Trang tiếp</HDButton>
      </div>}
    </HDCard>}
    <HDCard className="space-y-2 p-3" tone="muted">
      <p id="hr-write-reason" className="text-sm text-slate-600">Yêu cầu điều chỉnh công, xác nhận bảng công, ứng lương, bảng lương và thanh toán/đối soát được mở riêng bằng các nút phía trên theo quyền truy cập. Không sửa trực tiếp kỳ đã khóa. Thưởng/phạt vẫn cần quy trình riêng.</p>
      <div className="flex flex-wrap gap-2">
        <HDButton disabled aria-describedby="hr-write-reason">Sửa công / chấm hộ</HDButton>
        {runtime.capabilities.some(cap=>cap.startsWith('salaryAdvance.'))&&<HDButton disabled={!!denied} onClick={()=>setAdvanceOpen(true)}>Mở ứng lương</HDButton>}
        {runtime.capabilities.includes('payroll.company.read')&&<HDButton disabled={!!denied} onClick={()=>setPayrollOpen(true)}>Mở bảng lương</HDButton>}
        <HDButton disabled aria-describedby="hr-write-reason">Thưởng / phạt</HDButton>
      </div>
    </HDCard>
  </main>;
}
