import {offlineCustomerQuery,normalizeCustomerLookup} from './offlineCustomerQuery.js';
import {startupMark} from '../services/offlineStartupTrace.js';
import {searchMark} from './crmSearchTrace.js';

// View-requested, bounded projection of this owner's SQLite directory. Never
// another database/authority; history and financial data are not indexed.
export function createSQLiteDirectoryReadMemo({repository,session,authorize,maxRows=1000,maxBytes=2*1024*1024,schedule=setTimeout,cancel=clearTimeout}){
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>1000||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>2*1024*1024)throw RangeError('Invalid directory projection budget');
 const scope=session.scope;let generation=0,buildTicket=0,cache=null,seed=null,building=null,timer=null,readers=0,visible=false,closed=false,blockedReason='',readFailures=0;
 const current=()=>!closed&&session.isCurrent();
 const copy=value=>JSON.parse(JSON.stringify(value));
 const stopTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
 const arm=(delay=0)=>{stopTimer();if(current()&&readers&&visible&&!cache&&!blockedReason)timer=schedule(()=>{timer=null;void prepare().catch(()=>{});},delay);};
 const invalidate=()=>{generation++;buildTicket++;cache=null;seed=null;blockedReason='';readFailures=0;arm();};
 async function prepare(){
  if(building)return building;
  if(!current()||!readers||!visible||cache||blockedReason)return;
  const version=generation,ticket=++buildTicket;
  const usable=()=>current()&&readers>0&&version===generation&&ticket===buildTicket;
  let retryDelay=0;
  building=(async()=>{
   startupMark('crm.directory-index.start');
   const entries=[],ids=new Set();let bytes=0,after='',page,limit;
   const first=seed?.generation===version?seed:null;
   if(first){page=JSON.parse(first.json);limit=first.limit;}else{limit=100;page=await repository.page({directory:true,limit});}
   while(usable()){
    for(const row of page){
     if(row.companyId!==scope.tenantId){session.close();throw Error('SQLite directory projection scope mismatch');}
     if(typeof row.id!=='string'||!/^[\x20-\x7e]+$/.test(row.id)||ids.has(row.id)){blockedReason='id-collation';return;}
     const document=copy(row),text=normalizeCustomerLookup([row.name,row.phone,row.address].join(' '));
     bytes+=JSON.stringify(document).length*2+text.length*2+512;
     if(entries.length>=maxRows||bytes>maxBytes){blockedReason='budget';startupMark('crm.directory-index.budget-fallback',{rows:entries.length});return;}
     ids.add(row.id);entries.push({id:row.id,document,text});
    }
    if(page.length<limit){if(usable()){cache={generation:version,entries,bytes};seed=null;readFailures=0;startupMark('crm.directory-index.ready',{rows:entries.length,estimatedBytes:bytes});}return;}
    after=page[page.length-1].id;
    await new Promise(resolve=>schedule(resolve,0));if(!usable())return;
    limit=Math.min(100,maxRows-entries.length+1);page=await repository.page({directory:true,after,limit});
   }
  })().catch(error=>{if(!usable())return;readFailures++;retryDelay=500*2**(readFailures-1);if(readFailures>=3)blockedReason='read-failed';startupMark('crm.directory-index.read-fallback',{attempt:readFailures,code:error.code||'local-read-failed'});}).finally(()=>{building=null;if(!cache&&!blockedReason)arm(retryDelay);});return building;
 }
 async function page(options={}){
  if(!current())throw Object.assign(Error('Directory owner closed'),{code:'permission-denied'});
  const eligible=options.directory===true&&options.cachePolicy!=='sqlite-only'&&!options.historyFrom&&!options.historyTo&&/^[\x20-\x7e]*$/.test(options.after||'');
  const snapshot=cache,version=generation;
  async function fromCache(snapshot){
   const traceId=options.traceId||0;searchMark(traceId,'normalize-start');
   const query=offlineCustomerQuery([scope.tenantId,scope.principalId],options);
   searchMark(traceId,'normalize-end');searchMark(traceId,'authorize-start');
   await authorize({scope,kind:'customer.read'});
   searchMark(traceId,'authorize-end');
   if(!current())throw Object.assign(Error('Directory owner closed'),{code:'permission-denied'});
   if(snapshot===cache&&version===generation){
    const manager=options.managerId===undefined?'all':options.managerId,after=options.after||'',limit=options.limit===undefined?20:options.limit;
    const terms=query.params.slice(3+(manager==='all'?0:1),-1),result=[];
    searchMark(traceId,'ram-match-start');
    for(const entry of snapshot.entries){if(entry.id<=after||manager!=='all'&&entry.document.empId!==manager||!terms.every(term=>entry.text.includes(term)))continue;result.push(copy(entry.document));if(result.length===limit)break;}
    searchMark(traceId,'ram-match-end',{rows:result.length});
    startupMark('crm.directory-index.hit',{rows:result.length});return result;
   }
  }
  if(eligible&&snapshot){const result=await fromCache(snapshot);if(result!==undefined)return result;}
  // Do not wait for the bridge result if the SAME already-running, bounded
  // directory projection has become complete and verified in the meantime.
  // SQL starts immediately; no input debounce, second cache or extra query.
  const pendingBuild=eligible?building:null;
  const sqlRead=repository.page(options);
  const result=pendingBuild?await Promise.race([sqlRead,pendingBuild.then(async()=>{
   const completed=cache;
   if(current()&&completed?.generation===version){const reply=await fromCache(completed);if(reply!==undefined){startupMark('crm.directory-index.completed-during-read');return reply;}}
   return sqlRead;
  })]):await sqlRead;

  if(eligible&&current()&&generation===version&&!options.search&&!options.after&&(options.managerId===undefined||options.managerId==='all')){
   const json=JSON.stringify(result);if(json.length*2<=maxBytes)seed={generation:version,json,limit:options.limit===undefined?20:options.limit};
  }
  return result;
 }
 function close(){if(closed)return;closed=true;generation++;buildTicket++;cache=null;seed=null;readers=0;stopTimer();unsubscribe();}
 const unsubscribe=session.subscribe(()=>{if(!session.isCurrent())close();});
 const wrapped={...repository,page,
  activateDirectory(){if(!current())return()=>{};readers++;arm();let released=false;return()=>{if(released)return;released=true;readers=Math.max(0,readers-1);if(!readers){stopTimer();buildTicket++;}};},
  noteDirectoryRequested(){if(!current())return;visible=true;arm();},
  noteDirectoryVisible(){if(!current())return;visible=true;arm();},
  directoryReadState:()=>Object.freeze({ready:Boolean(cache),rows:cache?.entries.length||0,estimatedBytes:cache?.bytes||0,preparing:Boolean(building),readers,overBudget:blockedReason==='budget',fallbackReason:blockedReason,generation}),
  closeDirectoryMemo:close,
 };
 for(const method of ['enqueue','create','update','archive','resolveConflict','applyReceipt','failLease','claimDue'])if(repository[method])wrapped[method]=async(...args)=>{try{return await repository[method](...args);}finally{invalidate();}};
 if(repository.ingestPage)wrapped.ingestPage=async(...args)=>{try{const result=await repository.ingestPage(...args);if(result)invalidate();return result;}catch(error){invalidate();throw error;}};
 if(!session.isCurrent())close();
 return Object.freeze(wrapped);
}
