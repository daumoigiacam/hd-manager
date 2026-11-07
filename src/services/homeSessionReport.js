// A single, read-only backing entry for the existing dashboard projection cache.
// Tab-session storage is not a business database or a sync source. Only complete
// reports enter it; restored values remain visibly pending until live validation.
const key='hd-home-completed-report-v1',maxChars=750000,maxAgeMs=30*60*1000;
const storage=()=>{try{return globalThis.sessionStorage}catch{return null}};
const identity=inputs=>({privacyScope:inputs?.privacyScope,companyId:inputs?.company?.id,
 employeeId:inputs?.employee?.id,day:inputs?.dashboardDayKey,clock:inputs?.dashboardClockScope??null});
const valid=value=>Boolean(value&&typeof value.privacyScope==='string'&&value.privacyScope
 &&typeof value.companyId==='string'&&value.companyId&&typeof value.employeeId==='string'&&value.employeeId
 &&/^\d{4}-\d{2}-\d{2}$/.test(value.day));
const validFinance=(finance,scope)=>Boolean(finance&&finance.todayKey===scope.day
 &&Array.isArray(finance.cashExpenseRows)&&Array.isArray(finance.payrollAccrualRows)
 &&['series7Days','series30Days','series12Months'].every(field=>Array.isArray(finance[field])));
export function clearHomeSessionReport(store=storage()){try{store?.removeItem(key)}catch{/* Storage is optional. */}}
export function restoreHomeSessionReport(inputs,{store=storage(),now=Date.now()}={}){
 try{
  const scope=identity(inputs);if(!valid(scope))return null;
  const raw=store?.getItem(key);if(!raw||raw.length>maxChars)return null;
  const saved=JSON.parse(raw);
  if(saved.version!==1||!Number.isFinite(saved.savedAt)||saved.savedAt>now||now-saved.savedAt>maxAgeMs
    ||JSON.stringify(saved.scope)!==JSON.stringify(scope)||saved.snapshot?.kind!=='home-primary-v1'
    ||!validFinance(saved.snapshot.finance,scope)||!Number.isFinite(Date.parse(saved.snapshot.generatedAt)))return null;
  return {inputs:{privacyScope:scope.privacyScope,company:{id:scope.companyId},employee:{id:scope.employeeId},
   dashboardDayKey:scope.day,dashboardClockScope:inputs.dashboardClockScope},snapshot:saved.snapshot,restored:true,mode:'primary'};
 }catch{return null}
}
export function saveHomeSessionReport(projection,{store=storage(),now=Date.now()}={}){
 try{
  const scope=identity(projection?.inputs),report=projection?.snapshot;
  if(!valid(scope)||!validFinance(report?.finance,scope)||!Number.isFinite(Date.parse(report.generatedAt)))return false;
  // Keep only the existing financial-card DTO. No customer directory, forms,
  // credentials, raw transactions or command/outbox values are persisted here.
  const snapshot={kind:'home-primary-v1',generatedAt:report.generatedAt,finance:report.finance};
  const raw=JSON.stringify({version:1,scope,savedAt:now,snapshot});if(raw.length>maxChars)return false;
  store?.setItem(key,raw);return Boolean(store);
 }catch{return false}
}
