import './legacyRuntime.js';
import {projectCompanyHome} from './companyHomeProjection.js';
import {businessDayKey} from '../utils/businessDate.js';
import {HOME_FEED_SOURCES,PAYROLL_FEED_ADDITIONS} from '../data/homeFeedContract.js';
let sources={},sizes={},bytes=0,sorted={},payrollScope='';
const payrollMonths=new Map(),payrollDependencies=new Set(['companies','employees','attendance','financials','performance','customers','payments','holidays','payrollPeriods','payrollSnapshots','employeeReviews','deliveryReports','customerComplaints','payrollDebtCarryovers','payrollAdjustments']);
const monthOf=order=>{const value=order?.date||order?.orderDate||order?.createdAt;return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)?businessDayKey(value).slice(0,7):'';};
const invalidatePayroll=(source,old,row)=>{if(!payrollMonths.size)return;if(payrollDependencies.has(source))payrollMonths.clear();else if(source==='orders'){for(const item of [old,row].filter(Boolean)){const month=monthOf(item);if(!month){payrollMonths.clear();return;}payrollMonths.delete(month);}}};
const reset=()=>{sources={};sizes={};bytes=0;sorted={};payrollMonths.clear();payrollScope='';};
const put=(source,row)=>{const records=sources[source]||=new Map(),weights=sizes[source]||=new Map();invalidatePayroll(source,records.get(row.id),row);bytes-=weights.get(row.id)||0;const size=JSON.stringify(row).length*2;weights.set(row.id,size);bytes+=size;records.set(row.id,row);delete sorted[source];};
self.onmessage=event=>{const {id,type,source,rows,tenantId,asOfDay}=event.data;try{
 if(type==='reset'){reset();return;}
 if(type==='source'){sources[source]||=new Map();for(const row of rows)put(source,row);return;}
 if(type==='packed'){const packet=JSON.parse(event.data.packet);if(!Array.isArray(packet)||packet.length>500)throw Error('Invalid Home worker packet');for(const item of packet){if(![...HOME_FEED_SOURCES,...PAYROLL_FEED_ADDITIONS].includes(item.source)||!item.document||typeof item.document.id!=='string')throw Error('Invalid Home worker record');put(item.source,item.document);}return;}
 if(type==='delta'){for(const change of event.data.events){if(change.operation==='delete'){invalidatePayroll(change.source,sources[change.source]?.get(change.id));sources[change.source]?.delete(change.id);bytes-=sizes[change.source]?.get(change.id)||0;sizes[change.source]?.delete(change.id);delete sorted[change.source];}else put(change.source,change.document);}return;}
 if(type==='finish'){const scope=JSON.stringify([tenantId,asOfDay]);if(payrollScope!==scope){payrollMonths.clear();payrollScope=scope;}const arrays=Object.fromEntries(Object.entries(sources).map(([key,records])=>[key,sorted[key]||=( [...records.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0))]));const value=projectCompanyHome({sources:arrays,tenantId,asOfDay,payrollMonthCache:payrollMonths});const retained=bytes<=32*1024*1024;self.postMessage({id,result:{snapshot:value.snapshot,reports:value.reports,overview:value.overview,deviceTimezoneOffset:new globalThis.Date().getTimezoneOffset(),retained,counts:Object.fromEntries(Object.entries(arrays).map(([key,rows])=>[key,rows.length]))}});if(!retained)reset();}
}catch(error){self.postMessage({id,error:error.message});}};
