// Readiness only; source data, financial formulas and listener ownership stay
// with their existing publishers. Empty confirmed collections are valid data.
export const CUSTOMER_FINANCIAL_SOURCES=Object.freeze(['orders','payments','customer_points']);
export function resetCustomerFinancialReadiness(scope='') {
 return {scope,status:'loading',confirmed:{},confirmedAt:null};
}
export function markCustomerFinancialSourcePending(state,scope,collection) {
 if(!scope||state.scope!==scope||!CUSTOMER_FINANCIAL_SOURCES.includes(collection)||state.confirmed[collection]!==true)return state;
 return {...state,status:'loading',confirmed:{...state.confirmed,[collection]:false}};
}
export function confirmCustomerFinancialSource(state,scope,collection,at) {
 if(!scope||state.scope!==scope||!CUSTOMER_FINANCIAL_SOURCES.includes(collection)||state.confirmed[collection])return state;
 const confirmed={...state.confirmed,[collection]:true};
 const ready=CUSTOMER_FINANCIAL_SOURCES.every(name=>confirmed[name]===true);
 return {scope,status:ready?'ready':'loading',confirmed,confirmedAt:ready?at:state.confirmedAt};
}
