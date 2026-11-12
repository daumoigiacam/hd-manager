import React,{useCallback,useEffect,useRef,useState}from'react';
import{createPreloadableModule}from'../../utils/preloadableModule.js';
import PreloadedWorkspace from'../../layout/PreloadedWorkspace.jsx';
import{createCustomerDirectory}from'./CustomerDirectory.jsx';

// Product view boundary only. The adapter above this component remains the
// single owner of customer queries/writes, permissions and the SQLite Runtime.
export function createCustomerCRMView(bindings){
 const Directory=createCustomerDirectory(bindings);
 const controller=createPreloadableModule(()=>import('./CustomerCRMController.jsx').then(m=>({default:m.createCustomerCRMView(bindings)})));
 return function CustomerCRMWorkspace(props){
  const local=Boolean(props.localCustomerSource?.queryManaged&&!props.financialDataReady);
  const [request,setRequest]=useState(null),[visited,setVisited]=useState(false),[loaded,setLoaded]=useState(()=>Boolean(controller.getResolved())),[error,setError]=useState('');
  const sequence=useRef(0),alive=useRef(true),handledIntent=useRef(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;sequence.current++;};},[]);
  const returnToDirectory=useCallback(()=>{sequence.current++;setRequest(null);setError('');},[]);
  const open=useCallback(async(kind,id=null,intent=null)=>{
   const ticket=++sequence.current;
   try{
    if(id){const record=await props.localCustomerSource.readDetail(id);if(!record)throw Error('Không tìm thấy hồ sơ cục bộ.');}
    if(!alive.current||ticket!==sequence.current)return false;
    setError('');setVisited(true);setRequest({key:ticket,kind,customerId:id,intent});
    void controller.preload().then(()=>{if(alive.current)setLoaded(true);}).catch(()=>{});
    return true;
   }catch(failure){if(alive.current&&ticket===sequence.current)setError(failure.message);return false;}
  },[props.localCustomerSource]);
  const openCustomer=useCallback(id=>open('detail',id),[open]);
  const openAction=useCallback(kind=>{void open(kind);},[open]);
  useEffect(()=>{
   if(!local||!props.quickActionIntent)return;
   const intent=props.quickActionIntent,key=JSON.stringify([intent.id,intent.requestedAt,intent.type]);
   if(handledIntent.current===key)return;
   if(intent.type==='create_customer'||intent.type==='import_customers'||intent.type==='edit_customer_zalo_link'){
    handledIntent.current=key;void open(intent.type==='create_customer'?'create':intent.type==='import_customers'?'import':'detail',intent.customerId||null,intent);
   }
  },[local,props.quickActionIntent,open]);
  // Until the controller actually mounts it cannot own Back. Once loaded its
  // existing priority dispatcher is the only active workflow listener.
  useEffect(()=>{
   if(!local||!request||loaded)return;
   const back=event=>{bindings.markAppBackHandled(event);returnToDirectory();};
   window.addEventListener(bindings.APP_SCREEN_BACK_EVENT,back);
   return()=>window.removeEventListener(bindings.APP_SCREEN_BACK_EVENT,back);
  },[local,request,loaded,returnToDirectory]);
  if(!local)return <PreloadedWorkspace module={controller} viewProps={props} label="khách hàng"/>;
  return <>
   {error&&<p role="alert">{error}</p>}
   <React.Activity mode={request?'hidden':'visible'}><Directory {...props} onOpenCustomer={openCustomer} onRequestAction={openAction}/></React.Activity>
   {visited&&<React.Activity mode={request?'visible':'hidden'}><PreloadedWorkspace module={controller} label="thao tác khách hàng" viewProps={{...props,navigationRequest:request,initialCustomerId:request?.customerId||null,initialAction:request?.kind||null,onReturnToDirectory:returnToDirectory,quickActionIntent:request?.intent||null}}/></React.Activity>}
  </>;
 };
}
