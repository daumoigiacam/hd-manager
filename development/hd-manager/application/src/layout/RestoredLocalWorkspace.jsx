import React,{useEffect,useState,useRef,useLayoutEffect} from 'react';
import {Capacitor} from '@capacitor/core';
import {App as CapacitorApp} from '@capacitor/app';
import {subscribeScopedNativeEvent} from '../services/scopedNativeListener.js';
import NativeBusinessRoute,{availableNativeBusinessRoutes,permittedNativeBusinessRoutes,prepareNativeBusinessRoute} from './NativeBusinessRoute.jsx';
import {startupMark} from '../services/offlineStartupTrace.js';
import {AppShell} from './AppShell.jsx';
import WorkingHome from './WorkingHome.jsx';
import {InstantHomeNavigation} from './InstantHome.jsx';
import {homeSummary} from './instantHomeModel.js';
import {localWorkspaceTab,localWorkspaceInitialSource} from '../services/workspacePresentation.js';
import PreloadedWorkspace from './PreloadedWorkspace.jsx';
import {createPreloadableModule} from '../utils/preloadableModule.js';
const homeModule=createPreloadableModule(()=>import('../features/customers/OfflineHome.jsx'));
const adapter=createPreloadableModule(()=>import('../features/customers/OfflineCustomerRuntimeContext.jsx').then(value=>({default:value.OfflineCustomerAppRoute})));
function OfflineCustomerAppRoute(props){return <PreloadedWorkspace module={adapter} viewProps={props} label="danh bạ cục bộ"/>;}

function OfflineHome(props){return <PreloadedWorkspace module={homeModule} viewProps={props} label="báo cáo đã lưu trên máy"/>;}

// Same application entry and product CRM view; the existing signed owner is
// supplied by App. No Firebase user, role, financial total or grant is invented.
export default function RestoredLocalWorkspace({runtime,verifiedLaunch,CustomerView,onLogout,onCustomerIntent,initialTab='home',onOpenFullWorkspace}){
 const context=runtime||verifiedLaunch;
 const [initialNavigation]=useState(()=>{
  if(initialTab==='home')return {route:null,customer:false};
  const candidates=runtime?availableNativeBusinessRoutes(runtime):permittedNativeBusinessRoutes(context);
  return {route:candidates.find(route=>route.id===localWorkspaceTab(initialTab,candidates)),source:localWorkspaceInitialSource(initialTab),customer:initialTab==='customers'&&context.capabilities.includes('customers.read')&&context.appSession.allowedTabs.includes('customers')};
 });
 const initialRoute=initialNavigation.route,initialCustomer=initialNavigation.customer;
 const [tab,setTab]=useState(initialRoute?initialRoute.id:initialCustomer?'customers':'home'),[search,setSearch]=useState(''),[showSearch,setShowSearch]=useState(false),[showFilter,setShowFilter]=useState(false),[reportRequested,setReportRequested]=useState(Boolean(verifiedLaunch?.cache));
 const [homeRestore,setHomeRestore]=useState(null);
 const currentHome=context.isCurrent()&&context.capabilities.includes('home.read')&&runtime?.home;
 const restoredHome=currentHome&&homeRestore?.owner===runtime?homeRestore:verifiedLaunch?.cache?{owner:verifiedLaunch,value:verifiedLaunch.cache,error:false}:null;
 const [opened,setOpened]=useState(initialRoute?[initialRoute.id]:[]);
 const [menuOpen,setMenuOpen]=useState(initialTab==='more'),scrollPositions=useRef(new Map()),contentRef=useRef(null);
 useEffect(()=>{if(!runtime)return;if(initialRoute)prepareNativeBusinessRoute(runtime,initialRoute,{firstOpen:true});else if(initialCustomer){onCustomerIntent?.();void runtime.prepareCustomerNavigation().catch(()=>{});}},[runtime,initialRoute?.id,initialCustomer]);
 const [period,setPeriod]=useState('today');
 const [orderSearchIntent,setOrderSearchIntent]=useState(null);
 const [homeSyncState,setHomeSyncState]=useState(''),homeIntent=useRef({owner:null,at:0});
 useEffect(()=>{
  if(tab!=='home'||!runtime?.home||!context.isCurrent()||!context.capabilities.includes('home.read'))return;
  const now=performance.now();if(homeIntent.current.owner===runtime&&now-homeIntent.current.at<5000)return;
  const timer=setTimeout(()=>{if(!context.isCurrent())return;homeIntent.current={owner:runtime,at:performance.now()};void runtime.home.sync().catch(()=>{});},0);
  return()=>clearTimeout(timer);
 },[runtime,tab]);
 useLayoutEffect(()=>{if(contentRef.current)contentRef.current.scrollTop=menuOpen?0:scrollPositions.current.get(tab)||0;},[tab,menuOpen]);
 const routes=runtime?availableNativeBusinessRoutes(runtime):permittedNativeBusinessRoutes(context);
 const navigate=value=>{
  if(!context.isCurrent())return;
  if(value==='modules'){if(onOpenFullWorkspace&&navigator.onLine){onOpenFullWorkspace('more');return;}if(!menuOpen)scrollPositions.current.set(tab,contentRef.current?.scrollTop||0);setMenuOpen(old=>!old);return;}
  if(!menuOpen)scrollPositions.current.set(tab,contentRef.current?.scrollTop||0);setMenuOpen(false);
  if(value==='home'){if(onOpenFullWorkspace&&navigator.onLine){onOpenFullWorkspace('home');return;}setTab('home');return;}
  if(value==='profile'){setTab(value);return;}
  if(value==='reports'){if(context.isCurrent()&&context.capabilities.includes('home.read')){setReportRequested(true);setTab(value);}return;}
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
  const read=async()=>{
   try{const value=await runtime.home.read();startupMark('home.local-restore-end',{available:Boolean(value)});return value;}
   catch(error){startupMark('home.local-restore-end',{available:false,failed:true});throw error;}
  };
  let sequence=0;
  const load=()=>{const ticket=++sequence;return void read().then(value=>{
   if(active&&ticket===sequence&&context.isCurrent()&&context.capabilities.includes('home.read'))setHomeRestore({owner:runtime,value,error:false});
  }).catch(()=>{if(active&&context.isCurrent())setHomeRestore({owner:runtime,value:null,error:true});});
  };
  load();
  setHomeSyncState(runtime.home.status()?.state||'');
  const unsubscribe=runtime.subscribe(topic=>{if(topic==='home')load();else if(topic==='home-status')setHomeSyncState(runtime.home.status()?.state||'');});
  return()=>{active=false;unsubscribe();};
 },[runtime]);
 if(!context.isCurrent())return <AppShell><WorkingHome ready={false}/><button onClick={onLogout}>Đăng xuất</button></AppShell>;
 const user=context.appSession.currentUser,company=context.appSession.currentCompany;
 const scope=JSON.stringify(context.scope),read=context.capabilities.includes('customers.read')&&context.appSession.allowedTabs.includes('customers');
 const modules=[...(read?[{id:'customers',label:'Khách hàng'}]:[]),...routes];
 return <AppShell className="hd-instant-native flex flex-col h-full min-h-0" data-hd-verified-tenant={context.scope.tenantId} data-hd-verified-principal={context.scope.principalId}>
  <main ref={contentRef} className="flex-1 overflow-y-auto min-h-0" data-instant-route={menuOpen?'modules':tab}>
   {menuOpen&&<section className="p-4 grid grid-cols-2 gap-3" style={{paddingTop:'calc(16px + var(--hd-safe-top, 0px))'}} aria-label="Chức năng nghiệp vụ"><h1 className="col-span-2 text-xl font-bold">Chức năng</h1>{modules.map(route=><button key={route.id} type="button" className="rounded-xl border p-3 text-left font-semibold" onClick={()=>navigate(route.id)}>{route.label}</button>)}</section>}
   <React.Activity mode={menuOpen?'hidden':'visible'}>
   <React.Activity mode={tab==='home'?'visible':'hidden'}>
    <WorkingHome ready storageReady={Boolean(runtime)} active={tab==='home'&&!menuOpen} scope={scope} modules={modules} identity={{companyName:company.name||company.companyName,name:user.name,role:user.position,logo:company.logoUrl||company.logo,avatar:user.avatarUrl}} summary={context.capabilities.includes('home.read')?homeSummary(restoredHome?.value,period):[]} period={period} onPeriodChange={setPeriod} freshness={restoredHome?.value?`Bản đã lưu · ${restoredHome.value.dayKey} · ${homeSyncState==='SYNCING'?'Đang cập nhật ở nền':homeSyncState==='SYNC_FAILED'?'Chưa đồng bộ được thay đổi mới':'Chưa gồm giao dịch chờ xác nhận'}`:''} offline={!navigator.onLine} onProfile={()=>navigate('profile')} searchableModules={['customers','orders']} onSearch={modules.some(item=>['customers','orders'].includes(item.id))?(value,kind)=>{if(kind==='customers'){setSearch(value);setShowSearch(true);navigate('customers');}else if(kind==='orders'){setOrderSearchIntent({id:crypto.randomUUID(),query:value});navigate(kind);}}:undefined} onRequestReport={context.capabilities.includes('home.read')?()=>navigate('reports'):undefined} onNavigate={navigate}/>
    {restoredHome?.error&&<p role="alert">Không thể mở báo cáo đã lưu trên máy. Hãy mở lại phiên để thử lại.</p>}
   </React.Activity>
   {tab==='profile'&&<section className="p-4"><h1>Cá nhân</h1><p>{user.name}</p><p>{company.name}</p><p>Quyền Offline có hiệu lực đến {new Date(context.expiresAtMs).toLocaleString('vi-VN')}</p><button type="button" onClick={onLogout}>Đăng xuất</button></section>}
   {tab==='reports'&&reportRequested&&context.capabilities.includes('home.read')&&<OfflineHome runtime={runtime} initialResult={restoredHome?.value} verifiedLaunch={verifiedLaunch} onNavigate={navigate}/>}
   {tab!=='home'&&<button className="mb-3 px-4 py-2 rounded-xl bg-slate-100" onClick={()=>navigate('home')}>Trang chủ</button>}
   {!['home','customers','profile','reports'].includes(tab)&&!routes.some(route=>route.id===tab)&&<p role="status">Chức năng này chưa được tích hợp vào phiên Offline. Dữ liệu đang có trên thiết bị được giữ nguyên.</p>}
   {!runtime&&tab!=='home'&&<p role="status">Đang mở dữ liệu trên thiết bị. Thao tác đã được giữ lại.</p>}
   {runtime&&opened.map(id=>{const route=routes.find(value=>value.id===id);return route?<React.Activity key={id} mode={tab===id?'visible':'hidden'}><NativeBusinessRoute runtime={runtime} route={route} initialSource={id===initialRoute?.id?initialNavigation.source:undefined} orderSearchIntent={id==='orders'?orderSearchIntent:undefined} active={tab===id&&!menuOpen} onNavigate={navigate}/></React.Activity>:null;})}
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
   </React.Activity>
  </main>
  <InstantHomeNavigation active={menuOpen?'modules':tab} onNavigate={navigate} onModules={()=>navigate('modules')} onReport={context.capabilities.includes('home.read')?()=>navigate('reports'):undefined} onProfile={()=>navigate('profile')}/>
 </AppShell>;
}
