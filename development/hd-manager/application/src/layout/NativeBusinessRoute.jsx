import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import PreloadedWorkspace from './PreloadedWorkspace.jsx';
import {createPreloadableModule} from '../utils/preloadableModule.js';
const orders=createPreloadableModule(()=>import('../features/orders/SQLiteProductOrders.jsx'));
const finance=createPreloadableModule(()=>import('../features/finance/OfflineFinanceWorkspace.jsx'));
const attendancePeriods=createPreloadableModule(()=>import('../features/hr/AttendancePeriodRoute.jsx'));
const salarySettlements=createPreloadableModule(()=>import('../features/payroll/SalarySettlementRoute.jsx'));
const attendanceRequests=createPreloadableModule(()=>import('../features/hr/AttendanceRequestRoute.jsx'));
const hr=createPreloadableModule(()=>import('../features/hr/OfflineHRWorkspace.jsx'));
const delivery=createPreloadableModule(()=>import('../features/delivery/OfflineDeliveryWorkspace.jsx'));
const warehouse=createPreloadableModule(()=>import('../features/warehouse/OfflineWarehouseWorkspace.jsx'));
// Fixed route registry, not per-record caches. Modules load only on explicit
// navigation; each hidden Activity retains bounded view state and stops effects.
export const nativeBusinessRoutes=Object.freeze([
 {id:'attendancePeriods',label:'Bảng công và xác nhận',required:['attendancePeriod.read'],module:attendancePeriods},
 {id:'salarySettlements',label:'Thanh toán và đối soát lương',required:['salarySettlement.read'],module:salarySettlements},
 {id:'attendanceRequests',label:'Yêu cầu công cá nhân',required:['attendanceRequest.read'],module:attendanceRequests},
 {id:'hr',label:'Nhân sự · Chấm công · Lương',required:[],any:['home.payroll.read','employees.directory.read'],readSource:'employees',module:hr},
 {id:'delivery',label:'Giao hàng · Phiếu cân',required:[],any:['home.quick-report.read','deliveryReports.read'],readSource:'deliveryReports',module:delivery},
 {id:'orders',label:'Đơn hàng',required:['orders.read','home.orders.read'],module:orders},
 {id:'finance',label:'Thu chi',required:['home.cashflow.read'],module:finance},
 {id:'warehouseImports',label:'Mua hàng · Nhập kho',required:['home.imports.read'],module:warehouse,source:'warehouseImports'},
 {id:'warehouseDispatches',label:'Xuất kho',required:['home.dispatches.read'],module:warehouse,source:'warehouseDispatches'},
 {id:'stockCounts',label:'Kiểm kê kho',required:['home.stock.read'],module:warehouse,source:'warehouseStockCounts'},
]);
const routeSource=route=>route.readSource||route.source||({orders:'orders',finance:'expenses',warehouseDispatches:'warehouseDispatches',stockCounts:'warehouseStockCounts'})[route.id];
const routeCaps=(context,route)=>route.required.every(cap=>context.capabilities.includes(cap))&&(!route.any||route.any.some(cap=>context.capabilities.includes(cap)));
export function permittedNativeBusinessRoutes(context){
 if(!context?.isCurrent()||context.appSession?.sourceProfile==='native-isolation-v1')return [];
 return nativeBusinessRoutes.filter(route=>context.appSession.allowedTabs.includes(route.id)&&routeCaps(context,route));
}
export function availableNativeBusinessRoutes(runtime){
 if(!runtime?.isCurrent()||runtime.appSession?.sourceProfile==='native-isolation-v1')return[];
 return nativeBusinessRoutes.filter(route=>runtime.appSession.allowedTabs.includes(route.id)&&(['attendanceRequests','salarySettlements','attendancePeriods'].includes(route.id)||runtime.business&&(runtime.capabilities.includes('home.read')||runtime.business.readSources?.includes(routeSource(route))))&&routeCaps(runtime,route));
}
export function prepareNativeBusinessRoute(runtime,route,{firstOpen=false}={}){
 if(firstOpen&&route.id==='orders')runtime.business.prepareOrdersIntent();
 void route.module.preload().catch(()=>{});
 if(!['attendanceRequests','salarySettlements','attendancePeriods'].includes(route.id))void (route.source?runtime.warehouse():runtime.business.directory()).catch(()=>{});
}
export default function NativeBusinessRoute({runtime,route,onNavigate,active,orderSearchIntent}){
 const [cashflow,setCashflow]=useState(null),[cashflowError,setCashflowError]=useState('');
 const [employeeSlot,setEmployeeSlot]=useState(null),[employeeError,setEmployeeError]=useState('');
 const employeeProfileRepository=employeeSlot?.owner===runtime?employeeSlot.value:null;
 useEffect(()=>{if(route.id!=='hr'||!active||employeeProfileRepository||!runtime.isCurrent()||!runtime.capabilities.some(c=>c.startsWith('employeeProfile.')))return;let current=true;void runtime.employeeProfileRepository().then(value=>{if(current&&runtime.isCurrent())setEmployeeSlot({owner:runtime,value});}).catch(e=>{if(current)setEmployeeError(e.message);});return()=>{current=false;};},[runtime,route.id,active,employeeProfileRepository]);
 const [attendanceSlot,setAttendanceSlot]=useState(null),[attendanceError,setAttendanceError]=useState('');
 const attendanceRepository=attendanceSlot?.owner===runtime?attendanceSlot.value:null;
 useEffect(()=>{
  if(route.id!=='hr'||!active||attendanceRepository||!runtime.isCurrent()||!['attendance.check_in','attendance.check_out'].some(cap=>runtime.capabilities.includes(cap)))return;
  let current=true;
  const open=typeof runtime.attendanceRepository==='function'?runtime.attendanceRepository():Promise.reject(Error('Chưa nối giao thức chấm công Native'));
  void open.then(value=>{if(current&&runtime.isCurrent()){setAttendanceSlot({owner:runtime,value});setAttendanceError('');}}).catch(error=>{if(current)setAttendanceError(error.message);});
  return()=>{current=false;};
 },[runtime,route.id,active,attendanceRepository]);
 const [financeInitialContentOwner,setFinanceInitialContentOwner]=useState(null);
 const [deliverySlot,setDeliverySlot]=useState(null),[deliveryError,setDeliveryError]=useState(''),[deliveryContentOwner,setDeliveryContentOwner]=useState(null);
 const deliveryRepository=deliverySlot?.owner===runtime?deliverySlot.value:null;
 const onDeliveryInitialContentReady=useCallback(()=>{if(route.id==='delivery'&&runtime.isCurrent())setDeliveryContentOwner(runtime);},[runtime,route.id]);
 const onFinanceInitialContentReady=useCallback(()=>{if(route.id==='finance'&&runtime.isCurrent())setFinanceInitialContentOwner(runtime);},[runtime,route.id]);
 const [stockCountRepository,setStockCountRepository]=useState(null),[stockCountError,setStockCountError]=useState('');
 const [warehouseImportRepository,setWarehouseImportRepository]=useState(null),[warehouseImportError,setWarehouseImportError]=useState(''),[warehouseImportContentOwner,setWarehouseImportContentOwner]=useState(null);
 const [warehouseDispatchRepository,setWarehouseDispatchRepository]=useState(null),[warehouseDispatchError,setWarehouseDispatchError]=useState(''),[warehouseDispatchContentOwner,setWarehouseDispatchContentOwner]=useState(null);
 const onWarehouseContentReady=useCallback(source=>{if(!runtime.isCurrent())return;if(source==='warehouseImports')setWarehouseImportContentOwner(runtime);if(source==='warehouseDispatches')setWarehouseDispatchContentOwner(runtime);},[runtime]);
 const [directory,setDirectory]=useState(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[,invalidate]=useState(0);
 const ticket=useRef(0);
 useEffect(()=>{
  if(directory||['attendanceRequests','salarySettlements','attendancePeriods'].includes(route.id))return;
  let current=true;const seq=++ticket.current;
  void (route.source?runtime.warehouse():runtime.business.directory()).then(value=>{if(current&&seq===ticket.current&&runtime.isCurrent()){setDirectory(value);setError('');}}).catch(failure=>{if(current)setError(failure.message);});
  return()=>{current=false;};
 },[runtime,route,directory,attempt]);
 useEffect(()=>runtime.subscribe(topic=>{if(active&&topic==='home')invalidate(n=>n+1);}),[runtime,active]);
 useEffect(()=>{
  if(route.id!=='delivery'||!active||deliveryContentOwner!==runtime||deliveryRepository||!runtime.isCurrent()||!availableNativeBusinessRoutes(runtime).some(item=>item.id==='delivery')||!['deliveryReports.create','deliveryReports.update','deliveryReports.archive'].some(cap=>runtime.capabilities.includes(cap)))return;
  let current=true;
  const open=typeof runtime.deliveryRepository==='function'?runtime.deliveryRepository():Promise.reject(Error('Chưa nối luồng ghi giao hàng'));
  void open.then(value=>{if(current&&runtime.isCurrent()){setDeliverySlot({owner:runtime,value});setDeliveryError('');}}).catch(failure=>{if(current)setDeliveryError(failure.message);});
  return()=>{current=false;};
 },[runtime,route.id,active,deliveryContentOwner,deliveryRepository]);
 useEffect(()=>{if(route.id!=='finance'||!active||financeInitialContentOwner!==runtime||cashflow||!runtime.isCurrent()||!availableNativeBusinessRoutes(runtime).some(item=>item.id==='finance')||!runtime.capabilities.some(cap=>/^cashflow\.(income|expense)\.(create|update)$/.test(cap)))return;let current=true;void runtime.cashflowRepository().then(value=>{if(current&&runtime.isCurrent())setCashflow(value);}).catch(failure=>{if(current)setCashflowError(failure.message);});return()=>{current=false;};},[runtime,route,cashflow,active,financeInitialContentOwner]);
 useEffect(()=>{if(route.id!=='stockCounts'||stockCountRepository||!runtime.capabilities.some(cap=>/^stockCounts\.(create|update|archive)$/.test(cap)))return;let current=true;void runtime.stockCountRepository().then(value=>{if(current&&runtime.isCurrent())setStockCountRepository(value);}).catch(failure=>{if(current)setStockCountError(failure.message);});return()=>{current=false;};},[runtime,route,stockCountRepository]);
 useEffect(()=>{if(!route.source||!active||warehouseImportContentOwner!==runtime||warehouseImportRepository||!runtime.isCurrent()||!runtime.capabilities.some(cap=>/^warehouseImports\.(create|update|archive)$/.test(cap)))return;let current=true;void runtime.warehouseImportRepository().then(value=>{if(current&&runtime.isCurrent())setWarehouseImportRepository(value);}).catch(failure=>{if(current)setWarehouseImportError(failure.message);});return()=>{current=false;};},[runtime,route,active,warehouseImportContentOwner,warehouseImportRepository]);
 useEffect(()=>{if(!route.source||!active||warehouseDispatchContentOwner!==runtime||warehouseDispatchRepository||!runtime.isCurrent()||!availableNativeBusinessRoutes(runtime).some(item=>item.id==='warehouseDispatches')||!runtime.capabilities.some(cap=>/^warehouseDispatches\.(create|update|archive)$/.test(cap)))return;let current=true;
  const open=typeof runtime.warehouseDispatchRepository==='function'?runtime.warehouseDispatchRepository():Promise.reject(Error('Chưa nối Runtime.warehouseDispatchRepository; không ghi phiếu xuất'));
  void open.then(value=>{if(current&&runtime.isCurrent())setWarehouseDispatchRepository(value);}).catch(failure=>{if(current)setWarehouseDispatchError(failure.message);});return()=>{current=false;};
 },[runtime,route,active,warehouseDispatchContentOwner,warehouseDispatchRepository]);
 const revision=runtime.business?.revision?.()||0;
 const viewDirectory=useMemo(()=>['attendanceRequests','salarySettlements','attendancePeriods'].includes(route.id)?Object.freeze({}):directory?Object.freeze({...directory}):null,[directory,revision,route.id]);
 if(!runtime.isCurrent()||!availableNativeBusinessRoutes(runtime).some(item=>item.id===route.id))return <p role="alert">Phiên không còn quyền truy cập chức năng này.</p>;
 if(error)return <section role="alert"><p>{error}</p><button onClick={()=>{setError('');setAttempt(n=>n+1);}}>Thử lại</button></section>;
 if(!viewDirectory)return <section role="status" aria-busy="true">Đang mở dữ liệu đã lưu cho {route.label}…</section>;
 return <div data-native-business-module={route.id}>{(employeeError||cashflowError||stockCountError||warehouseImportError||warehouseDispatchError||deliveryError||attendanceError)&&<p role="alert">Không mở được luồng ghi cục bộ: {employeeError||cashflowError||stockCountError||warehouseImportError||warehouseDispatchError||deliveryError||attendanceError}. Danh sách đã lưu vẫn sử dụng được.</p>}<PreloadedWorkspace module={route.module} label={route.label} viewProps={{runtime,orderSearchIntent,cashflow,stockCountRepository,warehouseImportRepository,warehouseDispatchRepository,deliveryRepository,attendanceRepository,employeeProfileRepository,directory:viewDirectory,onNavigate,initialSource:route.source,onInitialContentReady:route.id==='finance'?onFinanceInitialContentReady:route.id==='delivery'?onDeliveryInitialContentReady:route.source?onWarehouseContentReady:undefined}}/></div>;
}
