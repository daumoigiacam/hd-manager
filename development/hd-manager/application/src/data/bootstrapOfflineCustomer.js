import {createVerifiedDataSession} from './verifiedDataSession.js';
import {createOfflineCustomerAuthorizer} from './offlineCustomerGrant.js';
import {restoreOfflineAppSession} from './offlineAppSession.js';
import {startupMark} from '../services/offlineStartupTrace.js';
import {createOfflineReadLease} from './offlineReadLease.js';
import {CUSTOMER_DIRECTORY_PAGE_SIZE} from './offlineCustomerQuery.js';
import {createBusinessSearchForegroundGate} from '../services/businessSearchForegroundGate.js';
import {assertOfflineProject} from '../config/offlineRuntimeEnvironment.js';
// secureStore is a platform-encrypted store. readIdentity returns the identity
// last saved after online token verification, never a UI/localStorage profile.
export async function bootstrapOfflineCustomer({projectId,publicKey,secureStore,openDatabase,transport,digest,uuid,environment,online=()=>navigator.onLine,events=globalThis,onPhase=()=>{},beforeReceiptCommit,deferNetwork=false,backgroundHomeSync=true,loadHomeSync=null,loadAttendanceProviders=null,launchCache=null,onVerifiedLaunch=()=>{}}){
 onPhase('INITIALIZING');
 assertOfflineProject(projectId,environment);
 const maxLifetimeMs=environment?.maxOfflineMs||86400000;
 // Derive identity and verify its signed permission from ONE secure read while
 // the existing store queue excludes replacement/revocation. The record is
 // never cached or reused after this exclusive verification operation.
 let expected,verifiedGrant,session,readLease=null,fullAuthorize,verifiedDatabaseBinding;
 if(secureStore.withRecord){
  ({expected,verifiedGrant,databaseBinding:verifiedDatabaseBinding}=await secureStore.withRecord(async(record,advance)=>{
   const identity=record&&!record.revoked?record.identity:null;
   onPhase('SESSION_LOADED_UNVERIFIED');
   if(!identity||identity.projectId!==projectId)throw new Error('Online customer setup required');
   const expected=Object.freeze({...identity});
   let verifiedGrant;
   if(import.meta.env.VITE_NATIVE_DURABLE_GRANT_STORE==='true'){
    session=createVerifiedDataSession(expected);
    readLease=await createOfflineReadLease({publicKey,secureStore,expected,maxLifetimeMs,isCurrent:()=>session.isCurrent(),onInvalid:()=>session.close(),fullAuthorize:request=>fullAuthorize(request),initialRecord:{record,advance,reservedUntil:secureStore.reservedUntil?.(record)}});
    verifiedGrant=readLease.initialGrant;
   }else{
    const verify=await createOfflineCustomerAuthorizer({publicKey,expected,maxLifetimeMs,clockSkewMs:5000,secureStore:{withRecord:check=>check(record,advance)}});
    verifiedGrant=await verify({scope:expected,kind:'app.session'});
   }
   return{expected,verifiedGrant,databaseBinding:record.databaseBinding};
  },{bootstrap:true}));
 }else{
  const identity=await secureStore.readIdentity();onPhase('SESSION_LOADED_UNVERIFIED');
  if(!identity||identity.projectId!==projectId)throw new Error('Online customer setup required');
  expected=Object.freeze({...identity});
  const verify=await createOfflineCustomerAuthorizer({publicKey,secureStore,expected,maxLifetimeMs,clockSkewMs:5000});
  verifiedGrant=await verify({scope:expected,kind:'app.session'});
 }
 session ||=createVerifiedDataSession(expected);
 fullAuthorize=await createOfflineCustomerAuthorizer({publicKey,secureStore,expected,maxLifetimeMs,clockSkewMs:5000});
 onPhase('PERMISSION_VERIFIED');
 const appSession=restoreOfflineAppSession(verifiedGrant,expected);
 onPhase('AUTH_READY');
 const launchContext={scope:session.scope,capabilities:verifiedGrant.capabilities,appSession,expiresAtMs:verifiedGrant.expiresAtMs,isCurrent:()=>session.isCurrent()&&Date.now()<verifiedGrant.expiresAtMs};
 const launchCacheAccess={...launchContext,scope:expected};
 if(launchCache&&appSession&&verifiedGrant.capabilities.includes('home.read'))void launchCache.read(launchCacheAccess).then(value=>{if(value&&launchContext.isCurrent())onVerifiedLaunch({...launchContext,cache:value});}).catch(()=>{});
 // Home is the requested landing screen. Import its pure repository code
 // while the SAME authenticated database opens; do not read data early or
 // construct another repository/connection. Failed imports remain retryable.
 let homeRepositoryModule;
 const loadHomeRepository=()=>homeRepositoryModule||=(import('./offlineHomeRepository.js').catch(error=>{homeRepositoryModule=null;throw error;}));
 if(import.meta.env.VITE_NATIVE_HOME_BOOTSTRAP_PARALLEL==='true'&&verifiedGrant.capabilities.includes('home.read'))void loadHomeRepository().catch(()=>{});
 const database=await openDatabase(expected,()=>session.isCurrent(),verifiedDatabaseBinding);
 onPhase('LOCAL_READY');
 let releaseForegroundRead=()=>{};
 const authorize=request=>readLease?readLease.authorize(request):fullAuthorize(request);
 let disposeWriter=()=>{},sync,delta,closed=false,closePromise=null,authorityTimer=null,authorityAbort=null;
 let businessSearchOwner=null,businessSearchOwnerPromise=null,businessSearchLoadError=null,importsReadPromise,scopedReadPromise;
 const businessForeground=createBusinessSearchForegroundGate({isCurrent:()=>!closed&&session.isCurrent()&&Date.now()<verifiedGrant.expiresAtMs,
  activity:()=>{const element=globalThis.document?.activeElement,counts=globalThis.performance?.eventCounts;
   // Browser-maintained scalars only: no listeners, input values or draft cache.
   const interactionCount=typeof counts?.get==='function'?['keydown','pointerdown','input','compositionstart','compositionend'].reduce((sum,name)=>sum+(counts.get(name)||0),0):globalThis.performance?.interactionCount;
   return {
   hidden:globalThis.document?.visibilityState==='hidden',
   editorFocused:['INPUT','TEXTAREA','SELECT'].includes(element?.tagName)||element?.isContentEditable===true,
   inputPending:globalThis.navigator?.scheduling?.isInputPending?.()===true,
   interactionCount,
  };},
 });
 const requireBackgroundIdle=()=>{if(businessForeground.shouldYield())throw Object.assign(Error('Business search background yielded'),{code:'busy'});};
 const listeners=new Set();
 const releaseSession=session.subscribe(()=>{if(!session.isCurrent()){clearTimeout(authorityTimer);authorityAbort?.abort();businessForeground.close();businessSearchOwner?.close();if(importsReadPromise)void importsReadPromise.then(owner=>owner.close()).catch(()=>{});if(scopedReadPromise)void scopedReadPromise.then(owner=>owner.close()).catch(()=>{});releaseForegroundRead();readLease?.close();onPhase('ERROR');for(const listener of listeners)listener();}});
 const expiryTimer=setTimeout(()=>session.close(),Math.max(0,verifiedGrant.expiresAtMs-Date.now()));
 let customerRevision=0,homeRevision=0,preparedCustomerPage=null,preparingCustomerPage=null;
 const changed=(topic='customers')=>{if(topic==='home'){homeRevision++;businessSearchOwner?.invalidate();}if(topic==='customers'){customerRevision++;preparedCustomerPage=null;}if(!closed&&session.isCurrent())for(const listener of listeners){try{listener(topic);}catch{/* UI observers cannot turn a durable receipt into a failed commit. */}}};
 try{
  // Existing factories initialize only after the authenticated database opens.
  // Signed session/cache access never imports customer mutation/sync machinery.
  const {createOfflineCoreQueueFacade,createCustomerDeltaCoordinator,createOfflineCustomerRepository,createOfflineSyncEngine,registerOfflineCustomerWriter,createCustomerPageCoordinator,createOfflineCustomerHistoryRepository,createSQLiteDirectoryReadMemo}=await import('./offlineCustomerRuntimeFactories.js');
  if(!readLease&&import.meta.env.VITE_NATIVE_DURABLE_GRANT_STORE==='true')readLease=await createOfflineReadLease({publicKey,secureStore,expected,maxLifetimeMs,isCurrent:()=>session.isCurrent(),onInvalid:()=>session.close(),fullAuthorize});
  let history=null;
  let homeRepository,homeSync,homeSyncPromise;
  const home = verifiedGrant.capabilities.includes('home.read') ? Object.freeze({
   repository(){
    if(!session.isCurrent())return Promise.reject(Error('Home session closed'));
    if(!homeRepository)homeRepository=loadHomeRepository().then(({createOfflineHomeRepository})=>createOfflineHomeRepository({database,session,authorize,uuid,sourceProfile:verifiedGrant.appSession?.sourceProfile})).catch(error=>{homeRepository=null;throw error;});
    return homeRepository;
   },
   async read(options){const value=await (await this.repository()).read(options);if(launchCache&&!options?.details&&value)void launchCache.save(launchCacheAccess,value).catch(()=>startupMark('home.launch-cache-write-failed'));return value;},
   async capture(value){const result=await (await this.repository()).capture(value);changed('home');return result;},
   status(){return homeSync?.status()||{state:'LOCAL_READY'};},
    sourceChanged(){if(closed||!session.isCurrent()||!online())return;if(homeSync?.notifySourceChanged)homeSync.notifySourceChanged();else void this.sync().catch(()=>{});},
   async sync(){if(!session.isCurrent())return;if(!homeSyncPromise)homeSyncPromise=(loadHomeSync?loadHomeSync():Promise.reject(Error('Home source synchronization not installed in this runtime'))).then(async({createOfflineHomeSync})=>{const repo=await this.repository();if(!session.isCurrent())throw Error('Home session closed');homeSync=createOfflineHomeSync({repository:repo,transport,scope:session.scope,isCurrent:()=>session.isCurrent(),online,onChange:topic=>changed(topic),onFatal:async()=>{await secureStore.revoke(expected);session.close();}});return homeSync;}).catch(error=>{homeSyncPromise=null;throw error;});return (await homeSyncPromise).sync();},
  }) : null;
  const hasCustomerRead=verifiedGrant.capabilities.includes('customers.read');
  startupMark('repository.initialize.start');
  const storedRepository=hasCustomerRead?await createOfflineCustomerRepository({database,session,deviceId:expected.deviceId,authorize,digest,uuid,beforeReceiptCommit,historyProvider:()=>history}):createOfflineCoreQueueFacade({database,session,deviceId:expected.deviceId,authorize,digest,uuid});
  const repository=hasCustomerRead?createSQLiteDirectoryReadMemo({repository:storedRepository,session,authorize}):storedRepository;
  let orderRepository;
  const getOrders=()=>{if(!verifiedGrant.capabilities.includes('orders.read')||!session.isCurrent())return Promise.reject(Error('Không có quyền đơn hàng Offline'));if(!orderRepository)orderRepository=Promise.all([import('./offlineOrderRepository.js'),import('@hd/company-home-domain')]).then(([{createOfflineOrderRepository},domain])=>createOfflineOrderRepository({database,session,deviceId:expected.deviceId,authorize,digest,uuid,duplicateSignature:domain.buildOrderDuplicateSignature,mutationProtocol:{version:1,serverCAS:true,receiptDispatch:true}})).catch(error=>{orderRepository=null;throw error;});return orderRepository;};
  const orders=verifiedGrant.capabilities.includes('orders.read')?Object.freeze({repository:getOrders,page:async()=>(await getOrders()).page(),detail:async id=>(await getOrders()).detail(id),async create(document){const result=await(await getOrders()).create(document);changed('orders');sync.notifyConnectivity();return result;}}):null;
  // One lazy facade per verified runtime; shared existing owner and checkpoint.
  // Nothing is imported/queried for an unopened business screen.
  let cashflowPromise,stockCountPromise,warehouseImportPromise;
  const getWarehouseImport=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.some(cap=>/^warehouseImports\.(create|update|archive)$/.test(cap)))return Promise.reject(Error('Thiếu quyền ghi nhập kho có chữ ký'));
   if(!warehouseImportPromise)warehouseImportPromise=import('./offlineWarehouseImportRepository.js').then(({createOfflineWarehouseImportRepository})=>createOfflineWarehouseImportRepository({database,session,deviceId:expected.deviceId,digest,uuid,employeeId:appSession.currentUser.id,projectId,development:true,authorize,authorizeWrite:fullAuthorize,protocol:{version:1,serverCAS:true,receiptDispatch:true,atomicOutbox:true,atomicImportExpense:true},onQueued:()=>{changed('warehouseImports');sync.notifyConnectivity();}})).catch(error=>{warehouseImportPromise=null;throw error;});
   return warehouseImportPromise;
  };
  const getStockCount=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.includes('home.stock.read'))return Promise.reject(Error('Thiếu quyền kiểm tồn có chữ ký'));
   if(!stockCountPromise)stockCountPromise=import('./offlineStockCountRepository.js').then(({createOfflineStockCountRepository})=>createOfflineStockCountRepository({database,session,deviceId:expected.deviceId,digest,uuid,employeeId:appSession.currentUser.id,authorize:request=>request.kind==='stockCount.read'?authorize({...request,kind:'home.read'}):fullAuthorize(request),protocol:{version:1,serverCAS:true,receiptDispatch:true,atomicOutbox:true},onQueued:()=>{changed('stockCounts');sync.notifyConnectivity();}})).catch(error=>{stockCountPromise=null;throw error;});
   return stockCountPromise;
  };
  const getCashflow=()=>{if(!session.isCurrent()||!verifiedGrant.capabilities.some(cap=>/^cashflow\.(income|expense)\.(create|update)$/.test(cap)))return Promise.reject(Error("Thiếu quyền ghi thu chi có chữ ký"));if(!cashflowPromise)cashflowPromise=import("./offlineCashflowRepository.js").then(({createOfflineCashflowRepository})=>createOfflineCashflowRepository({database,session,deviceId:expected.deviceId,digest,uuid,authorize,authorizeWrite:fullAuthorize,projectId,development:true,employeeId:appSession.currentUser.id})).catch(error=>{cashflowPromise=null;throw error;});return cashflowPromise;};
  let businessDirectoryPromise,businessDirectoryValue,businessDirectoryRaw,warehouseDirectoryPromise,orderProductPromise,hrReaderPromise,businessSourcesRequested=false;
  const scopedModules=!home&&appSession?.sourceProfile===undefined;
  const getScopedRead=()=>scopedReadPromise||=(import('./scopedBusinessReadSource.js').then(({createScopedBusinessReadSource})=>createScopedBusinessReadSource({database,session,authorize,digest,transport,online,foreground:businessForeground,onChange:changed,onFatal:async()=>{await secureStore.revoke(expected);session.close();}})).catch(error=>{scopedReadPromise=null;throw error;}));
  const getImportsRead=()=>importsReadPromise||=(import('./warehouseImportsReadSource.js').then(({createWarehouseImportsReadSource})=>createWarehouseImportsReadSource({database,session,authorize,digest,transport,online,foreground:businessForeground,changed,onFatal:async()=>{await secureStore.revoke(expected);session.close();}})).catch(error=>{importsReadPromise=null;throw error;}));
  let preservedImportsDirectory;
  const getPreservedImportsDirectory=()=>preservedImportsDirectory||=(Promise.all([getImportsRead(),import('../features/warehouse/offlineWarehouseRepository.js')]).then(async([owner,{createOfflineWarehouseRepository}])=>{const directory=await owner.directory();return Object.freeze({...directory,...createOfflineWarehouseRepository({database,session,authorize,directory})});}).catch(error=>{preservedImportsDirectory=null;throw error;}));
  const requestBusinessSearch=source=>{
   if(closed||!session.isCurrent()||Date.now()>=verifiedGrant.expiresAtMs||!home||appSession?.sourceProfile==='native-isolation-v1')return;
   if(!businessSearchOwnerPromise)businessSearchOwnerPromise=import('../services/businessSearchBackfillOwner.js').then(({createBusinessSearchBackfillOwner})=>{
    if(closed||!session.isCurrent())return null;
    const owner=createBusinessSearchBackfillOwner({
     isCurrent:()=>!closed&&session.isCurrent()&&Date.now()<verifiedGrant.expiresAtMs,
     verifySource:name=>businessDirectoryRaw.verifyAccess(name,{}),
     async readHead(){requireBackgroundIdle();const saved=await home.read();if(!saved)throw Object.assign(Error('Local Home checkpoint unavailable'),{code:'stale-checkpoint'});return {ready:true,tenantId:session.scope.tenantId,principalId:session.scope.principalId,permissionRevision:session.scope.permissionRevision,generation:saved.generation,seq:saved.feedSeq,asOfDay:saved.dayKey,sources:saved.availableSources,counts:saved.sourceCounts,sourceProfile:saved.sourceProfile||'legacy-v1'};},
     getFeed:async()=>{requireBackgroundIdle();const repo=await home.repository();requireBackgroundIdle();return repo.feed();},
     shouldYield:()=>businessForeground.shouldYield(),
     acquireQuantum:()=>businessForeground.beginBackgroundQuantum(),
    });
    if(closed||!session.isCurrent()){owner.close();return null;}businessSearchOwner=owner;return owner;
   }).catch(error=>{businessSearchLoadError=error?.code||'unavailable';return null;});
   // The foreground query has already succeeded; derived work never owns its
   // promise, result or permission. Only this existing Runtime owns scheduling.
   void businessSearchOwnerPromise.then(owner=>{if(!closed&&session.isCurrent())owner?.request(source);}).catch(()=>{});
  };
  const getHRReader=()=>{if(!session.isCurrent())return Promise.reject(Error("Phiên nhân sự đã đóng"));if(!hrReaderPromise)hrReaderPromise=import("../features/hr/offlineHRReadRepository.js").then(({createOfflineHRReadRepository})=>createOfflineHRReadRepository({database,session,authorize})).catch(error=>{hrReaderPromise=null;throw error;});return hrReaderPromise;};
  const getBusinessDirectory=()=>{
   if(scopedModules)return getScopedRead().then(owner=>{if(businessDirectoryValue)return businessDirectoryValue;const raw=owner.directory();businessDirectoryValue=Object.freeze({...raw,
    page:async(source,...args)=>source==='warehouseImports'?(await getPreservedImportsDirectory()).page(source,...args):raw.page(source,...args),
    lookup:async(source,...args)=>source==='warehouseImports'?(await getPreservedImportsDirectory()).lookup(source,...args):raw.lookup(source,...args),
    verifyAccess:async(source,...args)=>source==='warehouseImports'?(await getPreservedImportsDirectory()).verifyAccess(source,...args):raw.verifyAccess(source,...args),
    detail:async(source,...args)=>source==='warehouseImports'?(await getPreservedImportsDirectory()).detail(source,...args):raw.detail(source,...args),
   });return businessDirectoryValue;});
   if(!home||!session.isCurrent()||appSession?.sourceProfile==='native-isolation-v1')return Promise.reject(Error('Không có nguồn nghiệp vụ được cấp quyền trong phiên này'));
   // Explicit navigation may happen Offline before a Home sync owner exists.
   // Retain that demand in this Runtime so the EXISTING reconnect listener
   // starts/resumes its feed later. Unopened modules still request nothing.
   businessSourcesRequested=true;
   // A business route may be opened before Reports. Its SQL reads the SAME
   // Home feed tables, so establish that owner's schema locally first. Never
   // wait for network ingestion, create a second connection or fake a head.
   if(!businessDirectoryPromise)businessDirectoryPromise=Promise.all([import('./offlineBusinessDirectory.js'),home.repository().then(repo=>repo.feed())]).then(([{createOfflineBusinessDirectory}])=>{if(!session.isCurrent())throw Error('Phiên nghiệp vụ đã đóng');if(online())void home.sync().catch(()=>{});const raw=createOfflineBusinessDirectory({database,session,authorize,sourceProfile:appSession?.sourceProfile});businessDirectoryRaw=raw;businessDirectoryValue=Object.freeze({...raw,
    page(source,options){return businessForeground.run(async()=>{const value=await raw.page(source,options);if(source!=='advances'||options?.text)requestBusinessSearch(source);return value;});},
    pageBatch(plan){return businessForeground.run(async()=>{const value=await raw.pageBatch(plan);for(const request of plan)if(request.source!=='advances'||request.options?.text)requestBusinessSearch(request.source);return value;});},
    lookup(source,ids,options){return businessForeground.run(async()=>{const value=await raw.lookup(source,ids,options);requestBusinessSearch(source);return value;});},
   });return businessDirectoryValue;}).catch(error=>{businessDirectoryPromise=null;throw error;});return businessDirectoryPromise;
  };
  let preparedOrdersIntent=null;
  const prepareOrdersIntent=()=>{if(preparedOrdersIntent||!session.isCurrent())return;const revision=homeRevision;const promise=getBusinessDirectory().then(directory=>directory.page('orders',{limit:25})).catch(()=>null);preparedOrdersIntent={revision,promise};};
  const takeOrdersIntent=async()=>{const slot=preparedOrdersIntent;preparedOrdersIntent=null;if(!slot)return null;const result=await slot.promise;if(!result||!session.isCurrent()||slot.revision!==homeRevision)return null;await(await getBusinessDirectory()).verifyAccess('orders',{});return session.isCurrent()&&slot.revision===homeRevision?result:null;};
  const business=(home||scopedModules)&&appSession?.sourceProfile!=='native-isolation-v1'?Object.freeze({readSources:scopedModules?Object.freeze(Object.entries({orders:'home.orders.read',payments:'home.cashflow.read',expenses:'home.cashflow.read',employees:'employees.directory.read',deliveryReports:'deliveryReports.read',warehouseImports:'home.imports.read',warehouseDispatches:'home.dispatches.read',warehouseStockCounts:'home.stock.read'}).filter(([,cap])=>verifiedGrant.capabilities.includes(cap)).map(([source])=>source)):undefined,get sources(){return businessDirectoryValue?.sources;},directory:getBusinessDirectory,prepareOrdersIntent,takeOrdersIntent,hrReader:getHRReader,searchIndexStatus:()=>businessSearchOwner?.inspect()||{state:businessSearchLoadError?'UNAVAILABLE':'NOT_REQUESTED',error:businessSearchLoadError},verifyAccess:async(...args)=>(await getBusinessDirectory()).verifyAccess(...args),revision:()=>homeRevision,page:async(...args)=>(await getBusinessDirectory()).page(...args),lookup:async(...args)=>(await getBusinessDirectory()).lookup(...args)}):null;
  const getWarehouseDirectory=()=>{
   if(!business)return Promise.reject(Error('Nguồn kho chưa được cấp quyền'));
   if(scopedModules)return getBusinessDirectory();
   if(!warehouseDirectoryPromise)warehouseDirectoryPromise=Promise.all([getBusinessDirectory(),import('../features/warehouse/offlineWarehouseRepository.js')]).then(([directory,{createOfflineWarehouseRepository}])=>{if(!session.isCurrent())throw Error('Phiên kho đã đóng');return createOfflineWarehouseRepository({database,session,authorize,directory});}).catch(error=>{warehouseDirectoryPromise=null;throw error;});return warehouseDirectoryPromise;
  };
  const getOrderProduct=()=>{
   if(scopedModules)return getScopedRead().then(owner=>owner.orderProduct);
   if(!orders||!business)return Promise.reject(Error('Nguồn đơn hàng chưa được cấp quyền'));
   if(!orderProductPromise)orderProductPromise=Promise.all([getBusinessDirectory(),import('../features/orders/sqliteOrderDirectory.js')]).then(([directory,{createSQLiteOrderProduct}])=>{if(!session.isCurrent())throw Error('Phiên đơn hàng đã đóng');const raw=createSQLiteOrderProduct({database,session,authorize,orders,business:directory,actorEmployeeId:appSession?.currentUser?.id});return Object.freeze({...raw,localPage:(...args)=>businessForeground.run(()=>raw.localPage(...args))});}).catch(error=>{orderProductPromise=null;throw error;});return orderProductPromise;
  };
  let warehouseDispatchPromise;
  const getWarehouseDispatch=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.some(cap=>/^warehouseDispatches\.(create|update|archive)$/.test(cap)))return Promise.reject(Error('Thiếu quyền ghi xuất kho có chữ ký'));
   if(!warehouseDispatchPromise)warehouseDispatchPromise=import('./warehouseDispatchRuntime.js').then(({createWarehouseDispatchRuntime})=>createWarehouseDispatchRuntime({database,session,deviceId:expected.deviceId,digest,uuid,employeeId:appSession.currentUser.id,projectId,authorize,authorizeWrite:fullAuthorize,grant:verifiedGrant,getBusinessDirectory,foreground:businessForeground,changed,notifyConnectivity:()=>sync.notifyConnectivity()})()).catch(error=>{warehouseDispatchPromise=null;throw error;});
   return warehouseDispatchPromise;
  };
  let deliveryPromise;
  const getDelivery=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.some(cap=>['deliveryReports.create','deliveryReports.update','deliveryReports.archive'].includes(cap)))return Promise.reject(Error('Thiếu quyền ghi giao hàng có chữ ký'));
   if(!deliveryPromise)deliveryPromise=import('./deliveryRuntime.js').then(({createDeliveryRuntime})=>createDeliveryRuntime({database,session,deviceId:expected.deviceId,digest,uuid,employee:{id:appSession.currentUser.id,name:appSession.currentUser.name||''},projectId:verifiedGrant.projectId,authorize,authorizeWrite:fullAuthorize,grant:verifiedGrant,foreground:businessForeground,changed,notifyConnectivity:()=>sync.notifyConnectivity(),retryFailedCommand:request=>sync.retryFailedCommand(request)})()).catch(error=>{deliveryPromise=null;throw error;});
   return deliveryPromise;
  };
  let payrollPromise;
  const getPayroll=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.includes('payroll.company.read'))return Promise.reject(Error('Thiếu quyền lương toàn công ty có chữ ký'));
   if(!payrollPromise)payrollPromise=Promise.all([getBusinessDirectory(),import('./payrollRuntime.js')]).then(([, {createPayrollRuntime}])=>createPayrollRuntime({database,session,deviceId:expected.deviceId,digest,uuid,employeeId:appSession.currentUser.id,projectId,authorize,authorizeWrite:fullAuthorize,grant:verifiedGrant,foreground:businessForeground,changed,notifyConnectivity:()=>sync.notifyConnectivity()})()).catch(error=>{payrollPromise=null;throw error;});
   return payrollPromise;
  };
  let salaryAdvancePromise;
  const getSalaryAdvances=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.some(c=>c.startsWith('salaryAdvance.')))return Promise.reject(Error('Thiếu quyền ứng lương có chữ ký'));
   if(!salaryAdvancePromise)salaryAdvancePromise=Promise.all([getBusinessDirectory(),import('./offlineSalaryAdvanceRepository.js')]).then(async([directory,{createOfflineSalaryAdvanceRepository}])=>{
    const raw=await createOfflineSalaryAdvanceRepository({database,session,projectId,development:true,employeeId:appSession.currentUser.id,deviceId:expected.deviceId,digest,uuid,authorize:fullAuthorize,authorizeRead:authorize,directory});
    return Object.freeze({...raw,async enqueue(value){const result=await raw.enqueue(value);changed('salaryAdvances');sync.notifyConnectivity();return result;}});
   }).catch(error=>{salaryAdvancePromise=null;throw error;});return salaryAdvancePromise;
  };
  let employeeProfilePromise;
  const getEmployeeProfiles=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.some(c=>c.startsWith('employeeProfile.')))return Promise.reject(Error('Thiếu quyền hồ sơ nhân sự có chữ ký'));
   if(!employeeProfilePromise)employeeProfilePromise=Promise.all([getBusinessDirectory(),import('./offlineEmployeeProfileRepository.js')]).then(async([,{createOfflineEmployeeProfileRepository}])=>{
    const raw=await createOfflineEmployeeProfileRepository({database,session,projectId,development:true,employeeId:appSession.currentUser.id,deviceId:expected.deviceId,digest,uuid,authorize:request=>request.kind==='home.read'?authorize(request):fullAuthorize(request)});
    const queued=async(fn,args)=>{const value=await raw[fn](...args);changed('employeeProfiles');sync.notifyConnectivity();return value;};return Object.freeze({...raw,create:(...args)=>queued('create',args),update:(...args)=>queued('update',args),archive:(...args)=>queued('archive',args)});
   }).catch(error=>{employeeProfilePromise=null;throw error;});return employeeProfilePromise;
  };
  let periodPromise;
  const getAttendancePeriods=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.includes('attendancePeriod.read'))return Promise.reject(Error('Thiếu quyền bảng công'));
   return periodPromise||=(import('./offlineAttendancePeriodRepository.js').then(async({createOfflineAttendancePeriodRepository})=>{
    const raw=await createOfflineAttendancePeriodRepository({database,session,deviceId:expected.deviceId,digest,uuid,authorize:fullAuthorize,transport});
    return Object.freeze({...raw,async enqueue(...args){const result=await raw.enqueue(...args);changed('attendancePeriods');sync.notifyConnectivity();return result;},async refresh(...args){const result=await raw.refresh(...args);changed('attendancePeriods');return result;}});
   }).catch(e=>{periodPromise=null;throw e;}));
  };
  let settlementPromise;
  const getSalarySettlements=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.includes('salarySettlement.read'))return Promise.reject(Error('Thiếu quyền thanh toán lương'));
   return settlementPromise||=(import('./offlinePayrollSettlementRepository.js').then(async({createOfflinePayrollSettlementRepository})=>{
    const raw=await createOfflinePayrollSettlementRepository({database,session,deviceId:expected.deviceId,digest,uuid,authorize:fullAuthorize,transport});
    return Object.freeze({...raw,async enqueue(...args){const result=await raw.enqueue(...args);changed('salarySettlements');sync.notifyConnectivity();return result;},async refresh(...args){const result=await raw.refresh(...args);changed('salarySettlements');return result;}});
   }).catch(e=>{settlementPromise=null;throw e;}));
  };
  let adjustmentPromise;
  const getAttendanceRequests=()=>{
   if(!session.isCurrent()||!verifiedGrant.capabilities.includes('attendanceRequest.read'))return Promise.reject(Error('Thiếu quyền yêu cầu công'));
   return adjustmentPromise||=(import('./offlineAttendanceRequestRepository.js').then(async({createOfflineAttendanceRequestRepository})=>{
    const raw=await createOfflineAttendanceRequestRepository({database,session,deviceId:expected.deviceId,digest,uuid,authorize:fullAuthorize,transport});
    return Object.freeze({...raw,async enqueue(...args){const result=await raw.enqueue(...args);changed('attendanceRequests');sync.notifyConnectivity();return result;},async refresh(...args){const result=await raw.refresh(...args);changed('attendanceRequests');return result;}});
   }).catch(e=>{adjustmentPromise=null;throw e;}));
  };
  let attendancePromise,attendanceProviderPromise;
  const attendanceProviders=()=>attendanceProviderPromise||=(loadAttendanceProviders?loadAttendanceProviders():Promise.reject(Error('Chưa nối bộ xác thực thiết bị Native gốc'))).catch(error=>{attendanceProviderPromise=null;throw error;});
  const getAttendance=()=>{
   if(!session.isCurrent()||!appSession.currentUser.identityKey||!verifiedGrant.capabilities.some(c=>['attendance.check_in','attendance.check_out'].includes(c)))return Promise.reject(Error('Cần phiên Online với quyền tự chấm công có chữ ký'));
   if(!attendancePromise)attendancePromise=Promise.all([getBusinessDirectory(),attendanceProviders(),import('./offlineAttendanceRepository.js')]).then(async([,provider,{createOfflineAttendanceRepository}])=>{
    if(!session.isCurrent()||!provider.isNative())throw Error('Chấm công cần phiên Native hiện tại');
    const raw=await createOfflineAttendanceRepository({database,session,authorize:request=>request.kind==='home.read'?authorize(request):fullAuthorize(request),digest,uuid,employeeId:appSession.currentUser.id,deviceId:provider.getDeviceId(),projectId,development:true,captureMethod:provider.captureMethod,retryFailedCommand:request=>sync.retryFailedCommand(request)});
    return Object.freeze({...raw,async registerDevice(){await fullAuthorize({scope:session.scope,kind:verifiedGrant.capabilities.includes('attendance.check_in')?'attendance.check_in':'attendance.check_out'});const value=await provider.registerDevice();if(!session.isCurrent())throw Error('Phiên đã đổi');changed('attendance');return value;},async request(input){const value=await raw.request(input);changed('attendance');sync.notifyConnectivity();return value;}});
   }).catch(error=>{attendancePromise=null;throw error;});return attendancePromise;
  };
  if(hasCustomerRead&&verifiedGrant.capabilities.includes('customers.history.read')){
   let historyPromise=null;
   const getHistory=()=>{if(!session.isCurrent())return Promise.reject(new Error('Offline history scope closed'));if(!historyPromise){const finish=()=>startupMark('history.repository-ready');startupMark('history.repository-start');historyPromise=createOfflineCustomerHistoryRepository({database,session,authorize}).then(value=>{finish();return value;}).catch(error=>{historyPromise=null;throw error;});}return historyPromise;};
   history=Object.freeze({page:async(...args)=>(await getHistory()).page(...args),ingestPage:async(...args)=>(await getHistory()).ingestPage(...args),withHistoryFilter:async(...args)=>(await getHistory()).withHistoryFilter(...args),filterCustomerIds:async(...args)=>(await getHistory()).filterCustomerIds(...args)});
  }
  console.info('CUSTOMER_OUTBOX_READY '+JSON.stringify({pending:await repository.countPending()}));
  startupMark('repository.initialize.end');
  onPhase('OUTBOX_READY');
  const synchronizedTransport={async send(command,options){
   try{if(!hasCustomerRead){await fullAuthorize({scope:session.scope,kind:command.kind});if(!session.isCurrent())throw Error('Core command owner closed');}onPhase('SYNCING');if(['attendance.check_in','attendance.check_out'].includes(command.kind)){const provider=await attendanceProviders(),context=await provider.captureContext(command);if(!session.isCurrent())throw Error('Attendance owner closed');return await transport.send(command,{...options,attendanceContext:{device:context.device,deviceSecret:context.deviceSecret,method:context.method}});}return await transport.send(command,options);}
   catch(error){
    if(error.code==='permission-denied'||error.code==='unauthenticated'){await secureStore.revoke(expected);session.close();}
    throw error;
   }finally{onPhase(session.isCurrent()?'READY':'ERROR');}
  }};
  const syncRepository={...repository,
   async authorizeExplicitRetry(...args){return(await (args[1]?.kind?.startsWith('attendance.')?getAttendance():getDelivery())).authorizeExplicitRetry(...args);},
   async claimFailed(...args){const attendance=args[1]?.kind?.startsWith('attendance.'),command=await(await(attendance?getAttendance():getDelivery())).claimFailed(...args);changed(attendance?'attendance':'deliveryReports');return command;},
   async claimDue(...args){const command=await repository.claimDue(...args);if(command?.kind?.startsWith('attendancePeriod.'))changed('attendancePeriods');else if(command?.kind?.startsWith('salarySettlement.'))changed('salarySettlements');else if(command?.kind?.startsWith('attendanceRequest.'))changed('attendanceRequests');else if(command?.kind?.startsWith('salaryAdvance.'))changed('salaryAdvances');else if(command?.kind?.startsWith('employeeProfile.'))changed('employeeProfiles');else if(command?.kind?.startsWith('order.'))changed('orders');else if(command?.kind?.startsWith('cashflow.'))changed('cashflow');else if(command?.kind?.startsWith('stockCount.'))changed('stockCounts');else if(command?.kind?.startsWith('warehouseImport.'))changed('warehouseImports');else if(command?.kind?.startsWith('warehouseDispatch.'))changed('warehouseDispatches');else if(['deliveryReport.create','deliveryReport.update','deliveryReport.archive'].includes(command?.kind))changed('deliveryReports');else if(command?.kind?.startsWith('payroll.'))changed('payroll');else if(command?.kind?.startsWith('attendance.'))changed('attendance');return command;},
   async applyReceipt(...args){const command=args[1];if(command.kind.startsWith('attendancePeriod.')){await(await getAttendancePeriods()).applyReceipt(...args);changed('attendancePeriods');}else if(command.kind.startsWith('salarySettlement.')){await(await getSalarySettlements()).applyReceipt(...args);changed('salarySettlements');}else if(command.kind.startsWith('attendanceRequest.')){await(await getAttendanceRequests()).applyReceipt(...args);changed('attendanceRequests');}else if(command.kind.startsWith('salaryAdvance.')){await(await getSalaryAdvances()).applyReceipt(...args);changed('salaryAdvances');}else if(command.kind.startsWith('employeeProfile.')){await(await getEmployeeProfiles()).applyReceipt(...args);changed('employeeProfiles');}else if(['order.create','order.update','order.archive'].includes(command.kind)){await(await getOrders()).applyReceipt(...args);changed('orders');}else if(/^cashflow\.(income|expense)\.(create|update)$/.test(command.kind)){await(await getCashflow()).applyReceipt(...args);changed('cashflow');}else if(['stockCount.create','stockCount.update','stockCount.archive'].includes(command.kind)){await(await getStockCount()).applyReceipt(...args);changed('stockCounts');}else if(['warehouseImport.create','warehouseImport.update','warehouseImport.archive'].includes(command.kind)){await(await getWarehouseImport()).applyReceipt(...args);changed('warehouseImports');}else if(['warehouseDispatch.create','warehouseDispatch.update','warehouseDispatch.archive'].includes(command.kind)){await(await getWarehouseDispatch()).applyReceipt(...args);changed('warehouseDispatches');}else if(['deliveryReport.create','deliveryReport.update','deliveryReport.archive'].includes(command.kind)){await(await getDelivery()).applyReceipt(...args);changed('deliveryReports');}else if(['attendance.check_in','attendance.check_out'].includes(command.kind)){await(await getAttendance()).applyReceipt(...args);changed('attendance');}else if(command.kind.startsWith('payroll.')){await(await getPayroll()).applyReceipt(...args);changed('payroll');}else{await repository.applyReceipt(...args);changed();}if((!command.kind.startsWith('attendancePeriod.')||command.kind==='attendancePeriod.assignWorkRole')&&!command.kind.startsWith('salarySettlement.')&&(!command.kind.startsWith('attendanceRequest.')||args[2]?.document?.applied===true)&&args[2]?.outcome==='accepted'&&home&&(homeSyncPromise||businessSourcesRequested))home.sourceChanged();},
   async failLease(...args){await repository.failLease(...args);changed(args[1]?.kind?.startsWith('attendancePeriod.')?'attendancePeriods':args[1]?.kind?.startsWith('salarySettlement.')?'salarySettlements':args[1]?.kind?.startsWith('attendanceRequest.')?'attendanceRequests':args[1]?.kind?.startsWith('salaryAdvance.')?'salaryAdvances':args[1]?.kind?.startsWith('employeeProfile.')?'employeeProfiles':args[1]?.kind?.startsWith('order.')?'orders':args[1]?.kind?.startsWith('cashflow.')?'cashflow':args[1]?.kind?.startsWith('stockCount.')?'stockCounts':args[1]?.kind?.startsWith('warehouseImport.')?'warehouseImports':args[1]?.kind?.startsWith('warehouseDispatch.')?'warehouseDispatches':['deliveryReport.create','deliveryReport.update','deliveryReport.archive'].includes(args[1]?.kind)?'deliveryReports':args[1]?.kind?.startsWith('payroll.')?'payroll':args[1]?.kind?.startsWith('attendance.')?'attendance':'customers');},
  };
  sync=createOfflineSyncEngine({repository:syncRepository,transport:synchronizedTransport,session,online});
  const pages=hasCustomerRead?createCustomerPageCoordinator({repository,fetchPage:page=>transport.page(page,undefined,session.scope),isCurrent:()=>session.isCurrent()}):null;
  if(hasCustomerRead&&import.meta.env.VITE_CUSTOMER_DELTA_SYNC==='true')delta=createCustomerDeltaCoordinator({repository,transport,scope:session.scope,isCurrent:()=>session.isCurrent(),online,onChange:()=>changed(),uuid,onFatal:async()=>{await secureStore.revoke(expected);session.close();}});
  const refresh=async(more=false)=>{
   if(!hasCustomerRead||!online()||!session.isCurrent())return;
   // One bounded page, not an eager tenant-wide history read.
   try{const cursor=await(more?pages.loadMore():delta?delta.sync():pages.refresh());if(!delta||more)changed();return cursor;}
   catch(error){if(error.code==='permission-denied'||error.code==='unauthenticated'){await secureStore.revoke(expected);session.close();}else if(!['network-error','unavailable'].includes(error.code))throw error;}
  };
  // Unvisited reports still do not load. Once explicitly requested, reconnect
  // resumes that SAME feed/worker even when the report screen is hidden.
  // Every signed session must revalidate on reconnect, including an employee
  // with no CRM/Home feed and no pending commands. Business subscriptions are
  // not an authority monitor. Keep the original grant/DB owner on unchanged
  // rights; a changed/revoked authority fails closed without deleting Outbox.
  let authorityPromise=null;
  const revalidateAuthority=()=>{
   if(closed||!session.isCurrent()||!online())return Promise.resolve(false);
   if(authorityPromise)return authorityPromise;
   authorityPromise=(async()=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);authorityAbort=controller;
    try{
     const fresh=await transport.grant(expected.deviceId,controller.signal,session.scope);
     if(closed||!session.isCurrent())return false;
     if(!fresh?.scope||['projectId','tenantId','principalId','deviceId'].some(key=>fresh.scope[key]!==expected[key]))throw Object.assign(Error('Online permission owner mismatch'),{code:'permission-denied'});
     const candidate={identity:fresh.scope,signedGrant:fresh.signedGrant,highWaterMs:fresh.issuedAtMs,revoked:false};
     const verify=await createOfflineCustomerAuthorizer({publicKey,expected:fresh.scope,maxLifetimeMs,clockSkewMs:5000,secureStore:{load:async()=>candidate,advanceHighWater:async()=>{}}});
     let checked;try{checked=await verify({scope:fresh.scope,kind:'app.session'});}catch{throw Object.assign(Error('Online permission signature rejected'),{code:'permission-denied'});}
     if(closed||!session.isCurrent())return false;
     const capabilities=value=>JSON.stringify([...value].sort());
     if(checked.permissionRevision!==expected.permissionRevision||capabilities(checked.capabilities)!==capabilities(verifiedGrant.capabilities))throw Object.assign(Error('Online permission changed; reauthentication required'),{code:'permission-denied'});
     return true;
    }catch(error){if(error.code==='permission-denied'||error.code==='unauthenticated'){session.close();await secureStore.revoke(expected);}return false;}
    finally{clearTimeout(timeout);if(authorityAbort===controller)authorityAbort=null;}
   })().finally(()=>{authorityPromise=null;});return authorityPromise;
  };
  const scheduleAuthority=()=>{clearTimeout(authorityTimer);if(closed||!session.isCurrent())return;authorityTimer=setTimeout(()=>{if(globalThis.document?.visibilityState==='hidden'){scheduleAuthority();return;}void revalidateAuthority().then(valid=>{if(valid&&!closed&&session.isCurrent())sync.notifyConnectivity();}).finally(scheduleAuthority).catch(()=>{});},30000);};
  const connectivity=()=>{void revalidateAuthority().then(valid=>{if(!valid||closed||!session.isCurrent())return;if(adjustmentPromise)void adjustmentPromise.then(repo=>repo.refresh()).catch(()=>{});if(importsReadPromise)void importsReadPromise.then(owner=>owner.sync()).catch(()=>{});if(scopedReadPromise)void scopedReadPromise.then(owner=>owner.sync()).catch(()=>{});startupMark('background.refresh-start');startupMark('background.sync-start');sync.notifyConnectivity();if(home&&(backgroundHomeSync||homeSyncPromise||businessSourcesRequested))void home.sync().catch(()=>{});void refresh().catch(()=>{}).finally(()=>startupMark('background.refresh-complete',{online:online()}));});};
  let networkStarted=false,timer=null;
  const startNetwork=()=>{if(closed||networkStarted||!session.isCurrent())return;networkStarted=true;events.addEventListener('online',connectivity);timer=setTimeout(connectivity,0);scheduleAuthority();};
  if(hasCustomerRead)disposeWriter=registerOfflineCustomerWriter({projectId,session,repository,sync,environment});
  // Return local access before starting any network operation.
  if(Date.now()>=verifiedGrant.expiresAtMs)throw new Error('Offline grant expired during local bootstrap');
  if(!deferNetwork)startNetwork();
  if(readLease){
   await readLease.authorize({scope:session.scope,kind:'app.session'});
   // Keep the already-verified local read capability current while the app is
   // visible. No network/data prefetch; stop renewal when backgrounded/closed.
   let release=()=>{};
   const visibility=()=>{release();release=globalThis.document?.visibilityState==='hidden'?()=>{}:readLease.activate();};
   visibility();globalThis.document?.addEventListener('visibilitychange',visibility);
   releaseForegroundRead=()=>{release();globalThis.document?.removeEventListener('visibilitychange',visibility);};
  }
  onPhase('READY');
  return Object.freeze({scope:session.scope,appSession,expiresAtMs:verifiedGrant.expiresAtMs,startNetwork,activateReads:()=>{const a=readLease?.activate(),b=delta?.activate(),c=repository.activateDirectory();return()=>{a?.();b?.();c();};},noteCustomerDirectoryVisible:()=>repository.noteDirectoryVisible(),capabilities:Object.freeze([...verifiedGrant.capabilities]),repository,history,home,orders,business,cashflowRepository:getCashflow,stockCountRepository:getStockCount,warehouseImportRepository:getWarehouseImport,warehouseDispatchRepository:getWarehouseDispatch,deliveryRepository:getDelivery,payrollRepository:getPayroll,attendancePeriodRepository:getAttendancePeriods,salarySettlementRepository:getSalarySettlements,attendanceRequestRepository:getAttendanceRequests,attendanceRepository:getAttendance,employeeProfileRepository:getEmployeeProfiles,salaryAdvanceRepository:getSalaryAdvances,warehouse:getWarehouseDirectory,orderProduct:getOrderProduct,
   prepareCustomerNavigation(){
    if(preparingCustomerPage)return preparingCustomerPage;
    const version=customerRevision;startupMark('crm.intent-read-start');
    preparingCustomerPage=repository.page({limit:CUSTOMER_DIRECTORY_PAGE_SIZE,directory:true}).then(rows=>{if(!closed&&session.isCurrent()&&Date.now()<verifiedGrant.expiresAtMs&&version===customerRevision){preparedCustomerPage={rows,version};repository.noteDirectoryRequested();}startupMark('crm.intent-read-end');}).finally(()=>{preparingCustomerPage=null;});return preparingCustomerPage;
   },
   takePreparedCustomerNavigation({search='' }={}){const page=preparedCustomerPage;preparedCustomerPage=null;return !search&&page&&page.version===customerRevision&&!closed&&session.isCurrent()&&Date.now()<verifiedGrant.expiresAtMs?page.rows:null;},
   async awaitPreparedCustomerNavigation(options){const work=preparingCustomerPage;if(!work)return null;await work;return this.takePreparedCustomerNavigation(options);},
   async ensureCustomer(id){const local=await repository.detail(id);if(local||!online())return local;const remote=await transport.detail(id,undefined,session.scope);if(!session.isCurrent())throw new Error('Customer account changed');await repository.ingestPage([remote]);changed();return repository.detail(id);},
   async refreshHistory(options,signal){if(!history)throw new Error('Chưa có quyền Offline xem lịch sử');if(!online())return false;try{const page=await transport.history(options,signal,session.scope);if(signal?.aborted)return false;if(!session.isCurrent())throw new Error('History account changed');await history.ingestPage(page);changed('history');return true;}catch(error){if(error.code==='permission-denied'||error.code==='unauthenticated'){await secureStore.revoke(expected);session.close();}throw error;}},
   // Counts belong to this owner; no credentials, rows or mutable references.
   inspectLifecycle(){return Object.freeze({closed,current:session.isCurrent(),subscribers:listeners.size,networkStarted,preparedPage:preparedCustomerPage!==null,preparingPage:preparingCustomerPage!==null,directory:repository.directoryReadState()});},
   refresh,notifySync:()=>sync.notifyConnectivity(),loadMoreServer:()=>refresh(true),isCurrent:()=>session.isCurrent(),subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
   async logout(){await secureStore.revoke(expected);session.close();await this.close();},
   close(){if(closePromise)return closePromise;closed=true;authorityAbort?.abort();if(importsReadPromise)void importsReadPromise.then(owner=>owner.close()).catch(()=>{});if(scopedReadPromise)void scopedReadPromise.then(owner=>owner.close()).catch(()=>{});businessForeground.close();businessSearchOwner?.close();preparedOrdersIntent=null;repository.closeDirectoryMemo();releaseForegroundRead();sync?.stop();delta?.stop();readLease?.close();homeSync?.stop();closePromise=Promise.resolve(scopedReadPromise).then(owner=>owner?.close()).catch(()=>{}).then(()=>database.close());clearTimeout(timer);clearTimeout(authorityTimer);clearTimeout(expiryTimer);events.removeEventListener('online',connectivity);disposeWriter();session.close();releaseSession();listeners.clear();return closePromise;},
  });
 }catch(error){clearTimeout(authorityTimer);authorityAbort?.abort();businessForeground.close();businessSearchOwner?.close();if(importsReadPromise)void importsReadPromise.then(owner=>owner.close()).catch(()=>{});if(scopedReadPromise)void scopedReadPromise.then(owner=>owner.close()).catch(()=>{});releaseForegroundRead();readLease?.close();clearTimeout(expiryTimer);releaseSession();disposeWriter();sync?.stop();session.close();await database.close();throw error;}
}

