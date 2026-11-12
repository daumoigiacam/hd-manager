import StartupWorkspaceShell from './StartupWorkspaceShell.jsx';
import React,{useCallback,useEffect,useState}from'react';
import{useNativeOfflineWorkspace}from'../services/useNativeOfflineWorkspace.js';
import{AppShell}from'./AppShell.jsx';
import WorkingHome from'./WorkingHome.jsx';
import RestoredLocalWorkspace from'./RestoredLocalWorkspace.jsx';
import PreloadedWorkspace from'./PreloadedWorkspace.jsx';
import{createPreloadableModule}from'../utils/preloadableModule.js';

const loadAuth=()=>import('../services/firebaseClientRuntime.js').then(value=>value.auth);
const productCRM=createPreloadableModule(()=>import('../features/customers/productCRMShared.jsx').then(value=>({default:value.CustomerCRMView})));
const FullApplication=React.lazy(()=>import('../App.jsx'));
function ProductCRM(props){return <PreloadedWorkspace module={productCRM} viewProps={props} label="khách hàng"/>;}

// Same owner, same signed session, same real product views. The heavy online
// application is requested only for login/reauthentication or explicit logout.
export default function CoreWorkspaceEntry(){
 const offlineWorkspace=useNativeOfflineWorkspace(loadAuth);
 const [fullRequested,setFullRequested]=useState(false),[loggingOut,setLoggingOut]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(offlineWorkspace.settled&&(!offlineWorkspace.enabled||(!offlineWorkspace.runtime&&offlineWorkspace.online)))setFullRequested(true);},[offlineWorkspace.settled,offlineWorkspace.enabled,offlineWorkspace.runtime,offlineWorkspace.online]);
 const logout=useCallback(async()=>{
  setLoggingOut(true);setError('');
  try{
   await offlineWorkspace.controller.logout();
   const app=await import('../App.jsx');
   await app.logoutRestoredWorkspace();
   setFullRequested(true);
  }catch(failure){setError(failure.message);}finally{setLoggingOut(false);}
 },[offlineWorkspace.controller]);
 if(loggingOut)return <AppShell><main className="p-4" role="status">Đang đăng xuất an toàn…</main></AppShell>;
 if(fullRequested)return <React.Suspense fallback={<AppShell><WorkingHome ready={false}/></AppShell>}><FullApplication offlineWorkspace={offlineWorkspace}/></React.Suspense>;
 const verifiedContext=offlineWorkspace.runtime?.isCurrent()?offlineWorkspace.runtime:offlineWorkspace.verifiedLaunch?.isCurrent()?offlineWorkspace.verifiedLaunch:null;
 if(verifiedContext)return <RestoredLocalWorkspace key={JSON.stringify(verifiedContext.scope)} runtime={offlineWorkspace.runtime} verifiedLaunch={offlineWorkspace.verifiedLaunch} CustomerView={ProductCRM} onCustomerIntent={()=>void productCRM.preload().catch(()=>{})} onLogout={logout}/>;
 return <AppShell><StartupWorkspaceShell onLogout={offlineWorkspace.controller?logout:undefined} error={error||offlineWorkspace.error}/></AppShell>;
}
