// In-memory presentation readiness, never authority, durable Offline permission
// or a server acknowledgement. Logout, denial and read-owner changes drop it.
export function rememberCommittedReadSources(previous,{tenantId,ownerKey,names}) {
 const same=previous?.tenantId===tenantId&&previous.ownerKey===ownerKey;
 const collections={...(same?previous.collections:{})};
 const availableCollections={...(same?previous.availableCollections:{})};
 for(const name of names){collections[name]=true;availableCollections[name]=true;}
 return {tenantId,ownerKey,collections,availableCollections};
}
export function hasRetainedModuleSources({tenantId,ownerKey,state,collections}) {
 return Boolean(tenantId&&ownerKey&&state?.tenantId===tenantId&&state.ownerKey===ownerKey
  &&Array.isArray(collections)&&['companies','employees',...collections].every(name=>state.availableCollections?.[name]===true));
}
export function requestReadiness({baseFresh,dispatchFresh,baseRetained=false,dispatchRetained=false,rowsComplete,statusesComplete}) {
 const rowsReady=Boolean((baseFresh||baseRetained)&&rowsComplete);
 const projectionReady=Boolean(rowsReady&&(dispatchFresh||dispatchRetained)&&statusesComplete);
 return {rowsReady,projectionReady,writesReady:Boolean(projectionReady&&baseFresh&&dispatchFresh),retained:!baseFresh||!dispatchFresh};
}
