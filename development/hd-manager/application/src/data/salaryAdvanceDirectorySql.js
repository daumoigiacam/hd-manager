// Exact candidate priority and YYYY-MM normalization of salaryAdvancePeriod.js.
// Display/query only; financial plans still read the complete authoritative body.
export function salaryAdvanceMonthSql(field){
 const candidates=['salaryMonth','deductionMonth','payrollMonth','date','createdAt'].map(name=>{
  const text=`trim(COALESCE(CAST(${field(name)} AS TEXT),''))`;
  return `CASE WHEN substr(${text},1,7) GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(${text},6,2) BETWEEN '01' AND '12' THEN substr(${text},1,7) END`;
 });return `COALESCE(${candidates.join(',')},'')`;
}
