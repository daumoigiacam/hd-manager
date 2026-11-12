import React,{useState,useRef,useMemo,useLayoutEffect,useEffect,useCallback} from 'react';
import {startupMark} from '../../services/offlineStartupTrace.js';
import BusinessReportWorkspace from '../business-report/BusinessReportWorkspace.jsx';
import {getReportPeriod,getCashExpenseFinance,formatVnd} from '../business-report/reportViewModel.js';
function OfflineHomeReport({result,runtime,verifiedLaunch,onNavigate}){
 const context=runtime||verifiedLaunch;
 const [period,setPeriod]=useState('today'),[customRange,setCustomRange]=useState(null);
 const [full,setFull]=useState(null),[detailsPending,setDetailsPending]=useState(false),[detailsError,setDetailsError]=useState('');
 const version=JSON.stringify([result.generation,result.feedSeq,result.dayKey,result.capturedAt]),currentVersion=useRef(version),fullRequest=useRef(null),mounted=useRef(true);currentVersion.current=version;
 useEffect(()=>{mounted.current=true;setDetailsPending(Boolean(fullRequest.current));return()=>{mounted.current=false;};},[]);
 const detailVersion=useRef(version);
 // React Activity reattaches effects on return. Keep the same scoped completed
 // detail result; invalidate only when the actual source projection changes.
 useEffect(()=>{if(detailVersion.current!==version){detailVersion.current=version;setFull(null);setDetailsError('');fullRequest.current=null;}},[version]);
 const displayed=full?.version===version?full.value:result,report=displayed.reports?.[period];
 const requestDetails=useCallback(()=>{
  if(!runtime)return Promise.reject(Error('Bộ lưu trữ đang mở. Hãy thử lại khi sẵn sàng.'));
  if(!result.overviewVersion)return Promise.resolve(result);
  if(full?.version===version)return Promise.resolve(full.value);
  if(fullRequest.current?.version===version)return fullRequest.current.promise;
  setDetailsPending(true);setDetailsError('');
  const promise=runtime.home.read({details:true}).then(value=>{
   if(!mounted.current||!context.isCurrent()||currentVersion.current!==version||value?.generation!==result.generation||value?.feedSeq!==result.feedSeq||value?.dayKey!==result.dayKey||value?.capturedAt!==result.capturedAt)throw Error('Nguồn dữ liệu đã đổi. Hãy mở lại chi tiết.');
   if(value.snapshot?.kind==='home-primary-v1')throw Error('Chưa có bản phân tích chi tiết đầy đủ trên thiết bị. Hãy thử lại sau khi đồng bộ.');
   setFull({version,value});return value;
  }).catch(error=>{if(mounted.current&&currentVersion.current===version)setDetailsError(error.message);throw error;}).finally(()=>{if(fullRequest.current?.version===version)fullRequest.current=null;if(mounted.current&&currentVersion.current===version)setDetailsPending(false);});
  fullRequest.current={version,promise};return promise;
 },[runtime,result,version,full]);
 const changePeriod=useCallback(next=>{if(next==='custom'&&displayed.overviewVersion){void requestDetails().then(()=>{if(mounted.current&&context.isCurrent())setPeriod(next);}).catch(()=>{});}else setPeriod(next);},[displayed.overviewVersion,requestDetails,runtime]);
 const customNeedsFull=period==='custom'&&Boolean(displayed.overviewVersion);
 useEffect(()=>{if(customNeedsFull)void requestDetails().catch(()=>{});},[customNeedsFull,requestDetails]);
 const finance=useMemo(()=>getCashExpenseFinance(displayed.snapshot.finance),[displayed.snapshot.finance]);
 const selectedReport=useMemo(()=>displayed.periodReports?.[period]||(customNeedsFull?null:getReportPeriod(finance,period,customRange)),[displayed.periodReports,finance,period,customRange,customNeedsFull]);
 useLayoutEffect(()=>{startupMark('home.report-commit',{period});},[result,period,customRange]);
 const [detail,setDetail]=useState(null),detailRequest=useRef(0);
 const openProduct=async product=>{if(!runtime){setDetail({lines:[],error:'Bộ lưu trữ đang mở. Hãy thử lại khi sẵn sàng.'});return;}const ticket=++detailRequest.current;setDetail({pending:true,lines:[]});try{const value=await(await runtime.home.repository()).productDetail(product);if(ticket===detailRequest.current&&context.isCurrent()&&currentVersion.current===version)setDetail({...value,pending:false,projectionVersion:version});}catch(error){if(ticket===detailRequest.current)setDetail({lines:[],error:error.message});}};
 if(customNeedsFull)return <div data-local-report-period={period} aria-busy={detailsPending}><p role={detailsError?'alert':'status'}>{detailsError||'Đang mở dữ liệu đầy đủ cho khoảng ngày đã chọn. Chức năng làm việc vẫn sử dụng được.'}</p>{detailsError&&<button type="button" onClick={()=>{void requestDetails().catch(()=>{});}}>Thử lại</button>}</div>;
 return <div data-local-report-period={period}>
  <BusinessReportWorkspace snapshot={displayed.snapshot} detailsPending={detailsPending} detailsError={detailsError} onRequestDetails={()=>{void requestDetails().catch(()=>{});}} productDetailSource={detail?.seq&&(detail.seq!==result.feedSeq||detail.projectionVersion!==version)?{lines:[],error:'Nguồn dữ liệu đã cập nhật. Hãy mở lại chi tiết sản phẩm.'}:detail} onRequestProductDetail={openProduct} employee={context.appSession.currentUser} companyName={context.appSession.currentCompany.name} setActiveTab={onNavigate} dateSource={{period,onPeriodChange:changePeriod,customRange,onCustomRangeChange:setCustomRange,calendar:finance,report:selectedReport,freshnessLabel:`Nguồn dữ liệu đến ngày ${result.dayKey} · Bản đã lưu trên thiết bị`}}/>
  {detailsError&&<p role="alert">{detailsError}</p>}
  {report&&<section className="grid grid-cols-2 gap-3 p-4" aria-label="Chi tiết số liệu Offline">
   {[['Giá vốn',report.costOfGoods],['Lương phát sinh',report.salary],['Thu tiền',report.income],['Công nợ phải trả theo báo cáo hiện hành',report.payables],['Giá trị tồn tại ngày dữ liệu',report.inventoryValue]].map(([label,value])=><div key={label}><small>{label}</small><strong className="block">{formatVnd(value)}</strong></div>)}
   <div className="col-span-2">Sản lượng xuất kho theo nhóm và đơn vị{report.production?.map(row=><p key={row.groupName}>{row.groupName}: {Object.entries(row.quantities).map(([unit,quantity])=>`${quantity.toLocaleString('vi-VN')} ${unit}`).join(' · ')||'Không phát sinh'}</p>)}</div>
  </section>}
 </div>;
}
// Progress notifications update the status text, not the unchanged report tree.
// A new completed snapshot still re-renders, retaining the selected period/form.
export default React.memo(OfflineHomeReport);
