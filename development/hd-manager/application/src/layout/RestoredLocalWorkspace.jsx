import React,{useEffect,useState,useRef,useLayoutEffect} from 'react';
import {Capacitor} from '@capacitor/core';
import {App as CapacitorApp} from '@capacitor/app';
import {subscribeScopedNativeEvent} from '../services/scopedNativeListener.js';
import NativeBusinessRoute,{availableNativeBusinessRoutes,permittedNativeBusinessRoutes,prepareNativeBusinessRoute} from './NativeBusinessRoute.jsx';
import {startupMark} from '../services/offlineStartupTrace.js';
import {AppShell} from './AppShell.jsx';
import WorkingHome from './WorkingHome.jsx';
import PreloadedWorkspace from './PreloadedWorkspace.jsx';
import {createPreloadableModule} from '../utils/preloadableModule.js';
const homeModule=createPreloadableModule(()=>import('../features/customers/OfflineHome.jsx'));
const adapter=createPreloadableModule(()=>import('../features/customers/OfflineCustomerRuntimeContext.jsx').then(value=>({default:value.OfflineCustomerAppRoute})));
function OfflineCustomerAppRoute(props){return <PreloadedWorkspace module={adapter} viewProps={props} label="danh bạ cục bộ"/>;}

function OfflineHome(props){return <PreloadedWorkspace module={homeModule} viewProps={props} label="báo cáo đã lưu trên máy"/>;}

// Same application entry and product CRM view; the existing signed owner is
// supplied by App. No Firebase user, role, financial total or grant is invented.
export default function RestoredLocalWorkspace({runtime,verifiedLaunch,CustomerView,onLogout,onCustomerIntent}){
 const context=runtime||verifiedLaunch;
 const [tab,setTab]=useState('home'),[search,setSearch]=useState(''),[showSearch,setShowSearch]=useState(false),[showFilter,setShowFilter]=useState(false),[reportRequested,setReportRequested]=useState(Boolean(verifiedLaunch?.cache));
 const [homeRestore,setHomeRestore]=useState(null);
 const currentHome=context.isCurrent()&&context.capabilities.includes('home.read')&&runtime?.home;
 const restoredHome=currentHome&&homeRestore?.owner===runtime?homeRestore:verifiedLaunch?.cache?{owner:verifiedLaunch,value:verifiedLaunch.cache,error:false}:null;
 const [opened,setOpened]=useState([]);
 const [menuOpen,setMenuOpen]=useState(false),scrollPositions=useRef(new Map());
 useLayoutEffect(()=>{window.scrollTo(0,scrollPositions.current.get(tab)||0);},[tab]);
 const routes=runtime?availableNativeBusinessRoutes(runtime):permittedNativeBusinessRoutes(context);
 const navigate=value=>{
  if(value==='modules'){setMenuOpen(old=>!old);return;}
  scrollPositions.current.set(tab,window.scrollY);setMenuOpen(false);
  if(value==='home'){setTab('home');return;}
  if(value==='customers'){if(!context.appSession.allowedTabs.includes('customers')||!context.capabilities.includes('customers.read'))return;onCustomerIntent?.();void adapter.preload().catch(()=>{});void runtime?.prepareCustomerNavigation().catch(()=>{});setTab(value);return;}
  const route=routes.find(item=>item.id===value);if(!route)return;if(runtime)prepareNativeBusinessRoute(runtime,route,{firstOpen:!opened.includes(value)});setOpened(old=>old.includes(value)?old:[...old,value]);setTab(value);
 };
 const back=useRef(null);back.current=()=>{const request=new CustomEvent('hd-manager-screen-back',{cancelable:true,detail:{handled:false}});window.dispatchEvent(request);if(request.defaultPrevented||request.detail.handled)return;if(menuOpen)setMenuOpen(false);else if(tab!=='home')navigate('home');else void CapacitorApp.minimizeApp().catch(()=>{});};
 useEffect(()=>{if(!Capacitor.isNativePlatform())return;return subscribeScopedNativeEvent(CapacitorApp,'backButton',()=>back.current?.());},[runtime]);
 useEffect(()=>{
  if(!runtime?.home||!context.isCurrent()||!context.capabilities.includes('home.read'))return;
  let active=true;startupMark('home.local-restore-start');
  // The usable workspace has already committed. Only the completed, signed
  // owner's SQLite projection is read; no source history or network is needed.
  // Home is already demanded here. Fetch its view alongside the local read,
  // without extending the read mark or importing any unvisited business view.
  const view=homeModule.preload();
  const read=async()=>{
   try{const value=await runtime.home.read();startupMark('home.local-restore-end',{available:Boolean(value)});return value;}
   catch(error){startupMark('home.local-restore-end',{available:false,failed:true});throw error;}
  };
  void Promise.all([view,read()]).then(([,value])=>{
   if(active&&context.isCurrent()&&context.capabilities.includes('home.read')){setHomeRestore({owner:runtime,value,error:false});if(value)setReportRequested(true);}
  }).catch(()=>{
   if(active&&context.isCurrent())setHomeRestore({owner:runtime,value:null,error:true});
  });
  return()=>{active=false;};
 },[runtime]);
 const user=context.appSession.currentUser,company=context.appSession.currentCompany;
 const scope=JSON.stringify(context.scope),read=context.capabilities.includes('customers.read')&&context.appSession.allowedTabs.includes('customers');
 return <AppShell data-hd-verified-tenant={context.scope.tenantId} data-hd-verified-principal={context.scope.principalId}><header className="bg-emerald-900 text-white p-4 flex justify-between items-center"><strong>{company.name||'HD Manager'}</strong><button onClick={onLogout}>Đăng xuất</button></header>
  <p role="status" className="p-2 text-sm bg-emerald-50">Phiên Offline đã xác minh · Dữ liệu đã lưu trên thiết bị · Quyền có hiệu lực đến {new Date(context.expiresAtMs).toLocaleString('vi-VN')}</p>
  <main className="p-3">
   <React.Activity mode={tab==='home'?'visible':'hidden'}>
    <WorkingHome ready storageReady={Boolean(runtime)} active={tab==='home'} scope={scope} modules={[...(read?[{id:'customers',label:'Khách hàng'}]:[]),...(routes.length?[{id:'modules',label:'Chức năng'}]:[])]} onRequestReport={runtime?.home||verifiedLaunch?.cache?()=>setReportRequested(true):undefined} reportRequested={reportRequested} onNavigate={navigate}/>
    {menuOpen&&<section className="p-4 grid grid-cols-2 gap-3" aria-label="Chức năng nghiệp vụ">{routes.map(route=><button key={route.id} type="button" className="rounded-xl border p-3 text-left font-semibold" onClick={()=>navigate(route.id)}>{route.label}</button>)}</section>}
    {restoredHome?.error&&<p role="alert">Không thể mở báo cáo đã lưu trên máy. Hãy mở lại phiên để thử lại.</p>}
    {reportRequested&&restoredHome&&!restoredHome.error&&<OfflineHome runtime={runtime} initialResult={restoredHome.value} verifiedLaunch={verifiedLaunch} onNavigate={navigate}/>}
   </React.Activity>
   {tab!=='home'&&<button className="mb-3 px-4 py-2 rounded-xl bg-slate-100" onClick={()=>navigate('home')}>Trang chủ</button>}
   {tab!=='home'&&tab!=='customers'&&!routes.some(route=>route.id===tab)&&<p role="status">Chức năng này chưa được tích hợp vào phiên Offline. Dữ liệu đang có trên thiết bị được giữ nguyên.</p>}
   {!runtime&&tab!=='home'&&<p role="status">Đang mở dữ liệu trên thiết bị. Thao tác đã được giữ lại.</p>}
   {runtime&&opened.map(id=>{const route=routes.find(value=>value.id===id);return route?<React.Activity key={id} mode={tab===id?'visible':'hidden'}><NativeBusinessRoute runtime={runtime} route={route} active={tab===id} onNavigate={navigate}/></React.Activity>:null;})}
   {runtime&&tab==='customers'&&read&&<>
    <div className="flex gap-3 mb-2"><button onClick={()=>setShowSearch(value=>!value)}>Tìm kiếm</button><button onClick={()=>setShowFilter(value=>!value)}>Bộ lọc</button></div>
    <OfflineCustomerAppRoute runtime={runtime} principalId={context.scope.principalId} View={CustomerView}
     currentCompany={company} employee={user} employees={context.appSession.employees?.length?context.appSession.employees:[user]} privacyScope={scope}
     financialDataReady={false} lookupDataReady directoryDataReady
     canAddCustomerPermission={context.capabilities.includes('customers.create')} canEditCustomer={context.capabilities.includes('customers.update')} canEditCustomerPhoneAddress={context.capabilities.includes('customers.update')} canEditCustomerLocation={context.capabilities.includes('customers.update')} canDeleteCustomerPermission={context.capabilities.includes('customers.archive')}
     canViewAllCustomers={read} canViewCustomerPhone={read} canViewCustomerLocation={read}
     canViewCustomerOrderHistory={context.capabilities.includes('customers.history.orders.read')}
     canViewCustomerPaymentHistory={context.capabilities.includes('customers.history.payments.read')}
     searchKeyword={search} setSearchKeyword={setSearch} showSearchBox={showSearch} setShowSearchBox={setShowSearch}
     showFilterPanel={showFilter} setShowFilterPanel={setShowFilter}/>
   </>}
   {tab==='home'&&!reportRequested&&<p className="mt-4 text-sm text-slate-600">Chỉ hiển thị chức năng nằm trong quyền Offline đã ký. Báo cáo tài chính chưa có bản local đầy đủ sẽ không hiển thị số liệu.</p>}
  </main>
 </AppShell>;
}
