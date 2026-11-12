import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import PayrollWorkspace from './PayrollWorkspace.jsx';
import PayrollCloseDialog from './PayrollCloseDialog.jsx';
import {useAppScreenBack} from '../../hooks/useAppScreenBack.js';
import {useCooperativeProjection} from '../../hooks/useCooperativeProjection.js';
import {getReadOnlyModuleProjectionEntry,getLocalProjectionClockScope} from '../../services/moduleProjectionCaches.js';
import {applyPayrollAdjustmentsToSnapshots} from '../../utils/payrollAdjustment.js';
import {inspectPayrollSnapshot} from '../../utils/payrollSnapshotIntegrity.js';
import {payrollCalculationInput,payrollProjectionSteps,getLockedPayrollPeriod,mapPayrollSnapshotsToRows,canLockPayrollPeriodAtDate,getVietnamPayrollDateKey,payrollManager} from './offlinePayrollProtocol.js';

const status={PENDING_SYNC:'Đã lưu trên thiết bị · Chưa chốt chính thức',SYNCING:'Đang chờ máy chủ đối chiếu',SYNCED:'Máy chủ đã xác nhận compound lương',SYNC_FAILED:'Gửi chưa thành công · Ý định vẫn được giữ',CONFLICT_REQUIRES_REVIEW:'Cần đối chiếu · Không ghi đè kỳ lương'};
export default function OfflinePayrollWorkspace({runtime,onClose,onOpenAdvance}){
 const scopeKey=JSON.stringify(runtime.scope),[repository,setRepository]=useState(null),[error,setError]=useState(''),[month,setMonth]=useState(()=>getVietnamPayrollDateKey().slice(0,7)),[epoch,setEpoch]=useState(0),[screen,setScreen]=useState('overview'),[employeeId,setEmployeeId]=useState(''),[form,setForm]=useState(null),[queue,setQueue]=useState(null),[input,setInput]=useState(null),[authority,setAuthority]=useState(false),[loading,setLoading]=useState(true);
 const [reviewedConflict,setReviewedConflict]=useState(null);
 const [denied,setDenied]=useState(false);
 const completed=useRef(null),owner=useRef(scopeKey),sequence=useRef(0),inFlight=useRef(null),formRef=useRef(form);formRef.current=form;
 useEffect(()=>{let active=true;if(repository)return;const open=typeof runtime.payrollRepository==='function'?runtime.payrollRepository():Promise.reject(Error('Chưa nối runtime.payrollRepository; không ghi lương.'));void open.then(value=>{if(active&&runtime.isCurrent())setRepository(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[runtime,repository]);
 useEffect(()=>runtime.subscribe?.(topic=>{if(['payroll','home'].includes(topic)&&runtime.isCurrent())setEpoch(n=>n+1);}),[runtime]);
 const identity=useMemo(()=>({repository,month,epoch,scopeKey,reviewedConflict}),[repository,month,epoch,scopeKey,reviewedConflict]);
 useLayoutEffect(()=>{
  if(!repository)return;let active=true;const ticket=++sequence.current;setAuthority(false);
  const controller=new AbortController();
  void repository.verifyReadAccess().then(async()=>{
   if(!active||!runtime.isCurrent())return;setAuthority(true);setDenied(false);if(completed.current===identity){setLoading(false);return;}
   setLoading(true);const value=await repository.load(month,{signal:controller.signal,resolvesConflictId:identity.reviewedConflict});if(active&&ticket===sequence.current&&runtime.isCurrent()){completed.current=identity;setInput({identity,value});setError('');setLoading(false);}
  }).catch(e=>{if(active){completed.current=null;setError(e.message);setLoading(false);if(e.code==='permission-denied'){setAuthority(false);setDenied(true);}}});
  return()=>{active=false;controller.abort();};
 },[runtime,repository,identity,month]);
 const ownsInput=runtime.isCurrent()&&!denied&&Date.now()<runtime.expiresAtMs&&runtime.capabilities.includes('payroll.company.read')&&owner.current===scopeKey&&input?.identity.repository===repository&&input?.identity.month===month&&input?.identity.scopeKey===scopeKey;
 const current=ownsInput&&input.identity===identity,value=ownsInput?input.value:null;
 const calculation=useMemo(()=>value?payrollCalculationInput(value.sources,runtime.scope.tenantId,month):null,[value,runtime,month]);
 const period=value&&getLockedPayrollPeriod(value.sources.payrollPeriods,runtime.scope.tenantId,month),actor=calculation?.data.employees.find(e=>e.id===repository?.employeeId),company=calculation?.currentCompany;
 const cached=useMemo(()=>{
  if(!calculation||!actor||period)return undefined;const x=calculation;
  return getReadOnlyModuleProjectionEntry('payroll',[company,actor,x.employees,x.employeeReviews,x.attendance,x.financials,x.performance,x.customers,x.orders,x.payments,x.holidays,x.deliveryReports,x.customerComplaints,x.payrollDebtCarryovers,x.data.payrollPeriods],{companyId:runtime.scope.tenantId,employeeId:actor.id,permissionKey:JSON.stringify([runtime.scope,runtime.capabilities,true,true]),periodKey:month,clockKey:getLocalProjectionClockScope(getVietnamPayrollDateKey())});
 },[calculation,actor,company,period,runtime,month]);
 const factory=useMemo(()=>()=>payrollProjectionSteps(calculation),[calculation]),projection=useCooperativeProjection(factory,cached,{enabled:!!calculation&&!period});
 const lockedRows=useMemo(()=>{
  if(!period||!value)return null;const snapshots=value.sources.payrollSnapshots.filter(s=>s.periodId===period.id&&!s.isArchived);
  if(!Array.isArray(period.snapshotIds)||snapshots.length!==period.employeeCount||period.snapshotIds.length!==snapshots.length||period.snapshotIds.some(id=>!snapshots.some(s=>s.id===id))||snapshots.some(s=>!inspectPayrollSnapshot(s).isComplete))return null;
  return mapPayrollSnapshotsToRows(applyPayrollAdjustmentsToSnapshots(snapshots,value.sources.payrollAdjustments.filter(a=>a.periodId===period.id&&!a.isArchived)));
 },[period,value]);
 const rows=period?lockedRows:projection.value?.rows,canManage=!!actor&&payrollManager(actor,actor),safe=!!current&&authority&&!loading&&!error&&repository?.ready&&!!rows&&(!period?!projection.pending&&!projection.error:true);
 const canLock=safe&&canManage&&!period&&runtime.capabilities.includes('payroll.lock')&&canLockPayrollPeriodAtDate(month,getVietnamPayrollDateKey())&&rows.length>0;
 function closeForm(){const draft=formRef.current;if(!draft)return false;if(draft.busy)return true;if(!draft.submitted&&!window.confirm('Đóng bản nháp lương? Ý định đã vào hàng chờ vẫn được giữ.'))return true;setForm(null);return true;}
 useAppScreenBack(()=>{if(closeForm())return true;if(screen!=='overview'){setScreen('overview');return true;}onClose();return true;});
 const changeMonth=next=>{if(formRef.current){setError('Đóng hoặc giữ bản nháp hiện tại trước khi đổi tháng.');return;}setMonth(next);setScreen('overview');setEmployeeId('');setReviewedConflict(null);};
 async function loadQueue(){if(!repository)return;try{const q=await repository.page({limit:20});if(runtime.isCurrent())setQueue(q);}catch(e){if(runtime.isCurrent())setError(e.message);}}
 function newForm(kind,row=null,resolvesConflictId=reviewedConflict){
  if(formRef.current||!safe||!canManage)return;
  if(!runtime.capabilities.includes(kind))return setError('Thiếu quyền có chữ ký '+kind);
  const values=kind==='payroll.lock'?{monthKey:month}:{monthKey:month,snapshotId:row.snapshotId,nextNetSalary:row.details.netSalary,nextEndingDebt:row.details.endingDebt||0,reason:''};
  setForm({kind,values,mutationId:crypto.randomUUID(),editedAt:new Date().toISOString(),inputFingerprint:value.inputFingerprint,resolvesConflictId,prepared:null,busy:false,submitted:false,message:'',error:''});
 }
 function updateValue(key,next){setForm(old=>old&&!old.submitted&&!old.busy&&!old.attempted?{...old,values:{...old.values,[key]:next},prepared:null,error:''}:old);}
 const canRetry=!!form?.attempted&&!!form.prepared&&authority&&!denied&&runtime.isCurrent()&&Date.now()<runtime.expiresAtMs;
 async function save(){
  const draft=formRef.current;if(!draft||draft.busy||draft.submitted||inFlight.current||!safe&&!canRetry)return;
  inFlight.current=draft;setForm(old=>({...old,busy:true,error:''}));
  try{
   if(!draft.attempted&&draft.inputFingerprint!==value.inputFingerprint)throw Error('Nguồn đã đổi sau khi mở bản nháp. Nạp và kiểm tra lại toàn kỳ trước khi lưu.');
   const prepared=draft.prepared||await repository.prepare(draft.kind,draft.values,{mutationId:draft.mutationId,editedAt:draft.editedAt,resolvesConflictId:draft.resolvesConflictId});
   // Retain the exact prepared bytes for an uncertain local-commit retry.
   draft.prepared=prepared;draft.attempted=true;
   const result=await repository.enqueue(prepared);
   if(runtime.isCurrent())setForm({...draft,prepared,busy:false,submitted:true,result,message:status[result.state]||result.state});
   await loadQueue();
  }catch(e){if(runtime.isCurrent())setForm({...draft,busy:false,error:e.message});}finally{inFlight.current=null;}
 }
 if(!runtime.isCurrent()||owner.current!==scopeKey)return null;
 if(denied||Date.now()>=runtime.expiresAtMs||!runtime.capabilities.includes('payroll.company.read'))return <section role="alert"><p>Quyền lương toàn công ty đã hết hiệu lực; không hiển thị bản lương đã giữ.</p><button type="button" onClick={onClose}>Nhân sự</button></section>;
 const selected=rows?.find(r=>r.emp.id===employeeId),closeDate=month+'-'+new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 return <section className="space-y-3" aria-label="Chốt và điều chỉnh lương SQLite">
  <header className="flex flex-wrap items-center gap-2"><button type="button" onClick={()=>{if(!closeForm())onClose();}}>Nhân sự</button><strong>Bảng lương · Development</strong><button type="button" disabled={!repository||!!form} onClick={()=>setEpoch(n=>n+1)}>Nạp lại nguồn hoàn tất</button><button type="button" disabled={!repository} onClick={loadQueue}>Hàng chờ lương</button></header>
  <p className="text-sm">Giữ công thức và toàn bộ nguồn gốc. Ý định lưu trên thiết bị chưa phải kỳ lương đã chốt. Chốt kỳ không tạo phiếu chi hoặc thanh toán lương.</p>
  {ownsInput&&<p className="text-xs">Nguồn hoàn tất {value.checkpoint.generation} · seq {value.checkpoint.seq}. {!current?'Đang giữ bản hoàn tất trước; thao tác mới chờ đối chiếu nguồn.':''}</p>}
  {(!repository||loading)&&<p role="status">Đang đọc đủ nguồn lương từ SQLite…</p>}{error&&<p role="alert">{error}</p>}{projection.error&&<p role="alert">{projection.error.message}</p>}
  {period&&!lockedRows&&<p role="alert">Kỳ lương thiếu snapshot/chính sách toàn vẹn. Không suy kết quả lịch sử hoặc cho phép điều chỉnh.</p>}
  {rows&&ownsInput&&<PayrollWorkspace screen={screen} onScreenChange={setScreen} rows={rows} monthKey={month} onMonthChange={changeMonth} isLocked={!!period} lockedPeriod={period} periods={value.sources.payrollPeriods} carryovers={value.sources.payrollDebtCarryovers} employees={value.sources.employees} companyId={runtime.scope.tenantId} canManage={safe&&canManage} canViewCompany onCloseRequest={()=>newForm('payroll.lock')} canClose={canLock} closeDateLabel={closeDate} onEmployeeOpen={id=>{setEmployeeId(id);setScreen('detail');}} selectedEmployeeId={employeeId} onOpenAdvance={onOpenAdvance}/>}
  {selected&&period&&<button type="button" disabled={!safe||!canManage||!!form||!runtime.capabilities.includes('payroll.adjust')} onClick={()=>newForm('payroll.adjust',selected)}>Điều chỉnh bản chốt đã chọn</button>}
  {form?.kind==='payroll.lock'&&<PayrollCloseDialog monthKey={form.values.monthKey} closeDateLabel={closeDate} rows={rows||[]} eligible={(canLock||canRetry)&&!form.submitted} busy={form.busy} status={form.error||form.message} onCancel={closeForm} onConfirm={save}/>}
  {form?.kind==='payroll.adjust'&&<form className="space-y-2 rounded-xl border p-3" aria-label="Điều chỉnh kỳ lương đã chốt" onSubmit={e=>{e.preventDefault();void save();}}>
   <p>Snapshot gốc giữ nguyên. Máy chủ đối chiếu cả phiếu điều chỉnh, kỳ, dư nợ và nhật ký; kỳ kế tiếp đã khóa sẽ từ chối.</p>
   <label>Thực nhận sau điều chỉnh<input type="number" min="0" value={form.values.nextNetSalary} disabled={form.busy||form.submitted||form.attempted} onChange={e=>updateValue('nextNetSalary',Number(e.target.value))}/></label>
   <label>Dư nợ sau điều chỉnh<input type="number" min="0" value={form.values.nextEndingDebt} disabled={form.busy||form.submitted||form.attempted} onChange={e=>updateValue('nextEndingDebt',Number(e.target.value))}/></label>
   <label>Lý do điều chỉnh<input required maxLength={4000} value={form.values.reason} disabled={form.busy||form.submitted||form.attempted} onChange={e=>updateValue('reason',e.target.value)}/></label>
   {(form.error||form.message)&&<p role={form.error?'alert':'status'}>{form.error||form.message}</p>}
   <button type="submit" disabled={!safe&&!canRetry||form.busy||form.submitted}>{form.attempted?'Kiểm tra / thử lại cùng ý định':'Lưu ý định điều chỉnh trên thiết bị'}</button><button type="button" disabled={form.busy} onClick={closeForm}>Đóng điều chỉnh</button>
  </form>}
  {queue&&<section aria-label="Hàng chờ compound lương"><p>Mỗi trang tối đa 20 lệnh; không cộng lương từ hàng chờ.</p>{queue.items.map(row=><div key={row.commandId}><p>{row.monthKey} · {row.kind} · {status[row.state]||row.state} · {row.commandId}</p>{row.receipt?.reason&&<p>{row.receipt.reason}</p>}{row.state==='CONFLICT_REQUIRES_REVIEW'&&<><p>Giữ nguyên receipt và ý định. Nạp nguồn mới, kiểm tra cả kỳ/snapshot/dư nợ/nhật ký trước khi tạo ý định đối chiếu mới.</p><button type="button" disabled={!!form} onClick={()=>{setMonth(row.monthKey);setReviewedConflict(row.commandId);setEpoch(n=>n+1);}}>Nạp đúng bản máy chủ để đối chiếu</button></>}</div>)}</section>}
 </section>;
}
