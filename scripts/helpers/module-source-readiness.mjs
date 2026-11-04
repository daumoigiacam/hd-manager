// Read-only diagnostic metadata. Never changes React state, source flags,
// permissions or the view's own loading indicators. No document values leave.
export function readModuleSourceReadiness(main,target,plans){
 let props=null;
 const key=main&&Object.keys(main).find(function(name){return name.indexOf('__reactFiber$')===0});
 let root=key&&main[key];
 for(let depth=0;root&&root.return&&depth<100;depth++)root=root.return;
 // React's DOM expando can keep the first-mounted fiber after an alternating
 // commit. Follow the CURRENT root's child links, not that stale return chain.
 // DOM containment prunes headers/sidebars without style or geometry reads.
 const current=root&&root.stateNode&&root.stateNode.current;
 const stack=current?[{fiber:current,props:null}]:[];
 for(let visited=0;stack.length&&visited<5000;visited++){
  const frame=stack.pop(),fiber=frame.fiber;if(!fiber)continue;
  if(fiber.sibling)stack.push({fiber:fiber.sibling,props:frame.props});
  const candidate=fiber.memoizedProps;
  const inherited=candidate&&candidate.currentUser&&candidate.serverConfirmedCollectionState&&Array.isArray(candidate.homeReadinessCollections)?candidate:frame.props;
  if(fiber.stateNode===main){props=inherited;break}
  const node=fiber.stateNode;
  const outside=node&&node.nodeType===1&&typeof node.contains==='function'&&!node.contains(main);
  if(fiber.child&&!outside)stack.push({fiber:fiber.child,props:inherited});
 }
 // Explicit local read-model pilot has a DIFFERENT capability/read contract.
 // Do not pretend its four-card projection loaded thirteen operational lists.
 const model=target==='home'&&typeof window!=='undefined'&&window.__hdLocalHomeReadModelPilot===true
   &&main&&typeof main.querySelector==='function'?main.querySelector('[data-hd-home-read-model-ready]'):null;
 if(model){
  const state=props&&props.serverConfirmedCollectionState;
  const matches=Boolean(props&&props.currentUser&&props.currentUser.uid&&state
   &&state.tenantId===props.currentUser.companyId
   &&model.getAttribute('data-hd-home-read-model-principal')===props.currentUser.uid
   &&model.getAttribute('data-hd-home-read-model-tenant')===props.currentUser.companyId
   &&model.getAttribute('data-hd-home-read-model-capabilities')==='four-cards-line-only');
  const required=['companies','employees','home-read-model-current'];
  const missing=required.filter(function(name){return name==='home-read-model-current'
   ?!matches||model.getAttribute('data-hd-home-read-model-ready')!=='true'
   :!matches||!state.collections||state.collections[name]!==true});
  return{hasContract:true,scopeMatches:matches,required:required,missing:missing,sourcesReady:matches&&missing.length===0,
   capabilities:'four-cards-line-only',qualification:'Local pilot projection readiness; operational source collections are NOT claimed loaded.'};
 }
 let requested=target==='home'?(props&&props.homeReadinessCollections):plans[target];
 if(!requested&&['more','profile','billing','role_permissions'].includes(target))requested=[];
 const contract=Boolean(props&&Array.isArray(requested)&&(target!=='home'||requested.length>0));
 const required=contract?Array.from(new Set(['companies','employees'].concat(requested))):[];
 const state=props&&props.serverConfirmedCollectionState;
 const matches=Boolean(contract&&props.currentUser.companyId&&state.tenantId===props.currentUser.companyId);
 const missing=contract?required.filter(function(name){return !matches||!state.collections||state.collections[name]!==true}):['unobserved-module-contract'];
 return {hasContract:contract,scopeMatches:matches,required:required,missing:missing,sourcesReady:contract&&matches&&missing.length===0};
}

// Hidden retained routes are not the active module. Ignore ONLY explicit DOM
// hiding, never an active busy marker. No computed styles/geometry/text layout.
export function isExplicitlyVisible(node,root){
 for(let current=node;current;current=current.parentElement){
  if(current.hidden||current.getAttribute('aria-hidden')==='true'||current.style.display==='none'||current.style.visibility==='hidden')return false;
  if(current===root)return true;
 }
 return false;
}

export function hasActiveModulePending(main){
 return Array.from(main.querySelectorAll('[data-hd-module-loading],[data-hd-report-refreshing],[data-hd-ledger-loading],[aria-busy="true"]'))
  .some(function(node){return isExplicitlyVisible(node,main)});
}
