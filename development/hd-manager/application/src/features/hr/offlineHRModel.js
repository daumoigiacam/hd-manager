import {businessDayKey} from '../../utils/businessDate.js';
import {HR_PAGE_SIZE,hrMonthRange,pendingHRSource,sameHRCheckpoint,validHRMonth} from './offlineHRReadRepository.js';

export const HR_SOURCES=Object.freeze({employees:'Nhân sự',attendance:'Chấm công',financials:'Ứng / thưởng / phạt',
  payrollSnapshots:'Lương đã chốt',payrollPeriods:'Kỳ lương'});
export const HR_FINANCIAL_TYPES=Object.freeze({advance:'Tạm ứng',bonus:'Thưởng',penalty:'Phạt',allowance:'Phụ cấp',employee_purchase:'Mua hàng cấn lương'});
export const HR_WRITE_UNAVAILABLE='Chỉ đọc nguồn đã lưu. Chưa có quyền ghi Offline có chữ ký và giao thức Outbox/biên nhận máy chủ cho chấm công, thưởng phạt, ứng hoặc chốt lương. Không ghi tạm vào bản nguồn.';
const scopeKeys=['tenantId','principalId','permissionRevision','sessionId'];
const fail=message=>{throw Error(message);};
export const hrScopeKey=runtime=>JSON.stringify(scopeKeys.map(key=>runtime?.scope?.[key]));
export const initialHRSource=source=>Object.hasOwn(HR_SOURCES,source)?source:source==='payroll'?'payrollSnapshots':source==='company_attendance'?'attendance':'employees';
export const createHRFilters=(now=Date.now())=>({monthKey:businessDayKey(now).slice(0,7),text:'',employeeId:'',type:'',status:''});

export function hrReadAccess(runtime,directory){
  const user=runtime?.appSession?.currentUser,scope=runtime?.scope;
  if(!runtime?.isCurrent?.()||!scope||scopeKeys.some(key=>typeof scope[key]!=='string'||!scope[key])
    ||user?.firebaseUid!==scope.principalId||user.companyId!==scope.tenantId||runtime.appSession.currentCompany?.id!==scope.tenantId
    ||!Number.isFinite(runtime.expiresAtMs)||Date.now()>=runtime.expiresAtMs)return 'Phiên nhân sự đã hết hạn hoặc không khớp tài khoản/công ty.';
  if(runtime.appSession.sourceProfile!==undefined)return 'Hồ sơ nguồn native chưa có ánh xạ dữ liệu nhân sự/lương của sản phẩm.';
  if(!['home.read','home.payroll.read'].every(cap=>runtime.capabilities?.includes(cap)))return 'Thiếu quyền home.read và home.payroll.read có chữ ký.';
  if(typeof directory?.page!=='function'||typeof directory?.lookup!=='function')return 'Nguồn danh mục nhân sự SQLite chưa được kết nối.';
  return '';
}
function current(runtime,directory,key){const denied=hrReadAccess(runtime,directory);if(denied)fail(denied);if(hrScopeKey(runtime)!==key)fail('Tài khoản hoặc quyền nhân sự đã thay đổi.');}
function checkpoint(runtime,cp){
  if(!cp||scopeKeys.some(key=>cp[key]!==runtime.scope[key])||cp.sourceProfile!=='legacy-v1'||typeof cp.generation!=='string'
    ||!cp.generation||!Number.isSafeInteger(cp.seq)||cp.seq<0||!Number.isSafeInteger(cp.capturedAt)
    ||!/^\d{4}-\d{2}-\d{2}$/.test(cp.dayKey||''))fail('Nguồn nhân sự không có checkpoint hoàn tất đúng tài khoản.');
}
function unpack(runtime,source,page,pinned){
  const meta=page?.metadata;
  if(meta?.source!==source||meta.serverConfirmedOnly!==true||meta.financialCalculationAllowed!==false
    ||meta.timeZone!=='Asia/Ho_Chi_Minh'||meta.projection!=='bounded-directory-scalars-v1')fail('Bản danh mục nhân sự không đúng hợp đồng nguồn.');
  checkpoint(runtime,meta.checkpoint);
  if(pinned&&!sameHRCheckpoint(pinned,meta.checkpoint))fail('Nguồn nhân sự đã đổi. Tải lại danh sách trước khi xem tiếp.');
  if(!Array.isArray(page.items)||page.items.length>HR_PAGE_SIZE||typeof page.hasMore!=='boolean'
    ||(page.hasMore?typeof page.nextCursor!=='string'||!page.nextCursor:page.nextCursor!==null))fail('Trang nhân sự không hợp lệ.');
  const ids=new Set();
  for(const row of page.items){
    if(typeof row.id!=='string'||!row.id||ids.has(row.id)||!row.document||row.document.companyId!==runtime.scope.tenantId
      ||(row.document.id&&row.document.id!==row.id)||typeof row.state!=='string')fail('Phiếu nhân sự không khớp nguồn/công ty hoặc bị trùng.');
    ids.add(row.id);
  }
  return page;
}
async function readerFor(runtime){
  if(typeof runtime.business?.hrReader!=='function')fail('Bộ đọc chi tiết nhân sự chưa được chủ Runtime kết nối.');
  const reader=await runtime.business.hrReader();
  if(typeof reader?.pageFinancials!=='function'||typeof reader?.financialDetail!=='function'||typeof reader?.payrollDetail!=='function')fail('Bộ đọc chi tiết nhân sự không đúng hợp đồng.');
  return reader;
}

export function hrDirectoryOptions(source,filters,{cursor=null,checkpoint:cp=null}={}){
  if(!Object.hasOwn(HR_SOURCES,source)||!filters||!validHRMonth(filters.monthKey)||typeof filters.text!=='string'
    ||filters.text.length>128||typeof filters.employeeId!=='string'||filters.employeeId.length>256)fail('Bộ lọc nhân sự không hợp lệ.');
  const options={limit:HR_PAGE_SIZE,cursor,checkpoint:cp};
  if(filters.text)options.text=filters.text;
  if(source==='attendance')Object.assign(options,hrMonthRange(filters.monthKey));
  if(['payrollSnapshots','payrollPeriods','financials'].includes(source))options.monthKey=filters.monthKey;
  if(filters.employeeId&&source!=='payrollPeriods')options.employeeId=filters.employeeId;
  if(source==='attendance'&&filters.status)options.status=filters.status;
  if(source==='financials'&&filters.type){if(!Object.hasOwn(HR_FINANCIAL_TYPES,filters.type))fail('Loại khoản nhân sự không hợp lệ.');options.type=filters.type;}
  return options;
}
export async function readHRPage({runtime,directory,source,filters,cursor=null,checkpoint:cp=null}){
  const key=hrScopeKey(runtime);current(runtime,directory,key);
  if(cp)checkpoint(runtime,cp);
  const options=hrDirectoryOptions(source,filters,{cursor,checkpoint:cp});
  const page=source==='financials'?await(await readerFor(runtime)).pageFinancials(options):await directory.page(source,options);
  current(runtime,directory,key);unpack(runtime,source,page,cp);
  if(cursor&&page.nextCursor===cursor)fail('Con trỏ nhân sự không tiến lên. Hãy tải lại.');
  return page;
}
export async function readHRDetail({runtime,directory,source,id,checkpoint:cp}){
  const key=hrScopeKey(runtime);current(runtime,directory,key);checkpoint(runtime,cp);
  if(!Object.hasOwn(HR_SOURCES,source)||typeof id!=='string'||!id||id.length>256)fail('Mã chi tiết nhân sự không hợp lệ.');
  const reader=source==='financials'?await readerFor(runtime):null;
  const page=unpack(runtime,source,source==='financials'?await reader.financialDetail(id,{checkpoint:cp}):await directory.lookup(source,[id],{checkpoint:cp}),cp);
  current(runtime,directory,key);
  if(page.items.length!==1||page.items[0].id!==id)fail('Bản nguồn đã chọn không còn trong checkpoint này.');
  const row=page.items[0];
  if(source==='attendance'){
    const reader=await readerFor(runtime);
    if(typeof reader.attendanceDetail!=='function')fail('Bộ đọc công việc chấm công chưa được kết nối.');
    const attendance=await reader.attendanceDetail(id,{checkpoint:cp});current(runtime,directory,key);
    if(attendance.recordId!==id||!sameHRCheckpoint(cp,attendance.metadata?.checkpoint)||attendance.metadata?.source!=='attendance')fail('Chi tiết công không khớp bản nguồn.');
    return {row,attendance,metadata:page.metadata};
  }
  if(source!=='payrollSnapshots')return {row,metadata:page.metadata};
  const payroll=await(await readerFor(runtime)).payrollDetail({employeeId:row.document.employeeId,monthKey:row.document.monthKey,snapshotId:id,checkpoint:cp});
  current(runtime,directory,key);
  if(!sameHRCheckpoint(cp,payroll?.metadata?.checkpoint)||payroll.metadata.source!=='payrollSnapshots'
    ||payroll.metadata.projection!=='original-frozen-payroll-v1'||payroll.employeeId!==row.document.employeeId
    ||payroll.monthKey!==row.document.monthKey)fail('Chi tiết lương không khớp nhân viên/tháng/checkpoint.');
  return {row,payroll,metadata:page.metadata};
}

export function hrSourceState(row){
  if(pendingHRSource(row?.document)||!['SERVER_CONFIRMED','SERVER_SOURCE_COPY'].includes(row?.state))return {pending:true,label:'Đang chờ đồng bộ / cần đối chiếu'};
  return {pending:false,label:'Bản nguồn máy chủ đã lưu'};
}
export const hrRecordTitle=(source,row)=>{
  const d=row.document;
  if(source==='employees')return d.name||d.displayName||row.id;
  if(source==='financials')return `${HR_FINANCIAL_TYPES[d.type]||d.type||'Khoản nhân sự'} · ${d.reason||d.empId||row.id}`;
  if(source==='attendance')return `${row.businessDate||'Chưa có ngày công'} · ${d.employeeId||d.empId||row.id}`;
  return `${d.monthKey||'Chưa có tháng'} · ${d.employeeName||d.employeeId||row.id}`;
};
