import {normalizeSearchText} from '../services/searchEngine.js';
export const IMPORT_SOURCE='warehouseImports';
export const IMPORT_HEAD_KIND='warehouse-imports-pages-v2';
const bad=()=>{throw Object.assign(Error('Invalid warehouse read query'),{code:'invalid-argument'});};
const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const id=v=>typeof v==='string'&&v.length>0&&v.length<=256&&!/[\u0000-\u001f\u007f/]/.test(v);
export function importQuery(input={}){
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['from','to','text','customerId','employeeId','status','limit','cursor','checkpoint','includeCount'].includes(k)))bad();
 const {from=null,to=null,text='',customerId=null,employeeId=null,status=null,limit=25,cursor=null,checkpoint=null,includeCount=false}=input;
 if(from!==null&&!day(from)||to!==null&&!day(to)||from&&to&&from>=to||typeof text!=='string'||text.length>128||[customerId,employeeId,status].some(x=>x!==null&&!id(x))||limit!==25||typeof includeCount!=='boolean'||cursor!==null&&(typeof cursor!=='string'||cursor.length>8192))bad();
 const tokens=[...new Set(normalizeSearchText(text).split(' ').filter(Boolean))];if(tokens.length>12)bad();
 return {from,to,text,tokens,customerId,employeeId,status,limit,cursor,checkpoint,includeCount};
}
export const importQueryKey=q=>JSON.stringify([q.from,q.to,q.tokens,q.customerId,q.employeeId,q.status]);
export const importHasFilter=q=>Boolean(q.from||q.to||q.tokens.length||q.customerId||q.employeeId||q.status);
// Same token normalization and AND substring semantics as Directory's Imports
// fields. Runs on <=100 server candidates, BEFORE the 25-match result limit.
export function importMatches(row,q){
 if(!day(row.date))return false;
 if(q.from&&row.date<q.from||q.to&&row.date>=q.to||q.customerId&&row.customerId!==q.customerId||q.employeeId&&(row.empId||row.createdByEmpId||'')!==q.employeeId||q.status&&row.status!==q.status)return false;
 const hay=normalizeSearchText(['productName','supplierName','warehouseName','note'].map(k=>row[k]??'').join(' '));return q.tokens.every(t=>hay.includes(t));
}
