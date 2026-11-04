export function currentDebtAnswer() {
 var main=document.querySelector('main[data-hd-module="debt"]');if(!main)return null;
 var key=Object.keys(main).find(function(k){return k.indexOf('__reactFiber$')===0}),f=key&&main[key];
 for(var depth=0;f&&f.return&&depth<100;depth++)f=f.return;
 var current=f&&f.stateNode&&f.stateNode.current,stack=current?[current]:[];
 for(var count=0;stack.length&&count<10000;count++){
  var fiber=stack.pop(),props=fiber.memoizedProps;
  if(props&&typeof props.canViewAssignedDebt==='boolean'&&Array.isArray(props.customers)){
   for(var h=fiber.memoizedState,n=0;h&&n<250;h=h.next,n++){
    var state=h.memoizedState,d=state&&state[1];
    if(Array.isArray(state)&&state.length===2&&Array.isArray(state[0])&&Array.isArray(d)&&d.length===6&&Array.isArray(d[0])&&['all','debt','credit'].indexOf(d[4])!==-1&&typeof d[5]==='string')
     return{query:d[5],rows:state[0].map(function(row){return{id:row.id,name:row.name,debt:row.ledger.currentDebt}}),base:d[0],filter:d[4]};
    if(Array.isArray(state)&&state.length===2&&Array.isArray(state[0])&&Array.isArray(d)&&d.length===5&&Array.isArray(d[0])&&typeof d[1]==='string'&&Array.isArray(d[2])&&['all','debt','credit'].indexOf(d[4])!==-1)
     return{query:d[1],rows:state[0].map(function(row){return{id:row.id,name:row.name,debt:row.ledger.currentDebt}}),base:d[0],filter:d[4]};
   }
  }
  if(fiber.sibling)stack.push(fiber.sibling);if(fiber.child)stack.push(fiber.child);
 }
 return null;
}

// Diagnostic transport only: never copy ledger transaction/history trees over
// the old WebView debugger socket. Preserve every field used by search oracle.
export function debtDiagnosticBasePage(start, size) {
 var answer=window.__upgradeDebtAnswer();if(!answer)return null;
 var keys=['id','name','plainName','displayName','customerHonorific','shopName','storeName','businessName','companyName','contactName','contactPerson','searchAliases','phone','phoneNumber','zaloContact','zaloPhone','code','customerCode','address','locationInput','area','region','route','routeName','branches','customerBranches','deliveryBranches','customerGroup','group','groupName','managerName','note','notes','searchText'];
 return answer.base.slice(start,start+size).map(function(row){var result={ledger:{currentDebt:row.ledger.currentDebt,creditBalance:row.ledger.creditBalance}};keys.forEach(function(key){if(Object.prototype.hasOwnProperty.call(row,key))result[key]=row[key]});return result});
}

export function armDebtSearch(config) {
 if(window.__upgradeDebtAbort)window.__upgradeDebtAbort();
 var started=null,finishing=false,timer,deadline=performance.now()+30000;
 var expected=JSON.stringify(config.expectedIds),initial=window.__upgradeDebtAnswer();
 if(!initial||initial.query===config.query)throw Error('Debt observer requires a different committed query');
 window.__upgradeDebtPromise=new Promise(function(resolve,reject){
  function stop(){clearTimeout(timer);observer.disconnect();document.removeEventListener('input',intent,true)}
  function valid(){
   var input=document.querySelector('input[data-hd-search-input]'),main=document.querySelector('main[data-hd-module="debt"]');
   if(started===null||!input||input.value!==config.query||!main||window.__hdModulePending(main))return false;
   var value=window.__upgradeDebtAnswer();
   return value&&value.query===config.query&&JSON.stringify(value.rows.map(function(r){return r.id}))===expected&&window.__hdSourceContract(main,'debt',window.__hdPlans).sourcesReady;
  }
  function check(){
   if(finishing)return;if(performance.now()>deadline){stop();reject(Error('Debt current-query answer timeout'));return;}
   if(valid()){finishing=true;var firstValid=performance.now();requestAnimationFrame(function(){requestAnimationFrame(function(){if(!valid()){finishing=false;check();return}var end=performance.now();stop();resolve({ms:end-started,intentAt:started,firstValidAt:firstValid,paintAt:end,exact:true,clock:'prearmed-current-root-debt-v1'})})})}
   else{clearTimeout(timer);timer=setTimeout(check,33)}
  }
  function intent(e){if(started!==null||!e.isTrusted||!e.target.matches('input[data-hd-search-input]')||e.target.value!==config.query)return;started=performance.now();deadline=started+30000;Promise.resolve().then(check)}
  var observer=new MutationObserver(check);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-busy']});
  document.addEventListener('input',intent,true);window.__upgradeDebtAbort=stop;timer=setTimeout(check,100);
 });window.__upgradeDebtPromise.catch(function(){});
}
