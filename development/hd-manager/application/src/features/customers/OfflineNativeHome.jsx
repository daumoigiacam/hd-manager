import React,{useEffect,useState} from 'react';
const labels={nativeOrders:'Đơn hàng',nativeOrderLines:'Dòng hàng',nativeCustomers:'Khách hàng',nativeProducts:'Sản phẩm',nativeCashTransactions:'Phiếu thu/chi nguồn',nativeStockLedger:'Bút toán kho',nativeStockBalances:'Số dư kho',nativeOrderRequests:'Đơn đặt nguồn'};
export default function OfflineNativeHome({runtime,result}){
 const [source,setSource]=useState('nativeOrders'),[rows,setRows]=useState([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;setRows([]);setError('');void runtime.home.repository().then(repo=>repo.page(source,{limit:100})).then(page=>{if(active)setRows(page.map(row=>row.document));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[runtime,source,result.generation,result.feedSeq]);
 return <section data-home-local-generation={result.generation} data-native-home data-native-tenant={runtime.scope.tenantId}>
  <h1>Trang chủ · Nguồn native trên thiết bị</h1><p>Tenant {runtime.scope.tenantId}</p>
  <p role="status">{runtime.home.status().state==='SYNCED'?'Đã đối chiếu nguồn server':'Bản đã lưu trên thiết bị'} · Checkpoint {result.feedSeq} · Backup {result.snapshot.provenance?.archiveDate}</p>
  <p>Đây là chứng từ PostgreSQL được sao chép có nguồn gốc. KPI tài chính chưa có mapping đầy đủ sẽ không hiển thị thành số 0.</p>
  <dl>{Object.entries(labels).map(([key,label])=><React.Fragment key={key}><dt>{label}</dt><dd data-native-count={key}>{result.sourceCounts[key]||0}</dd></React.Fragment>)}</dl>
  <h2>Trạng thái KPI</h2><ul>{Object.entries(result.snapshot.coverage||{}).map(([key,value])=><li key={key}>{key}: {value}</li>)}</ul>
  <label>Nguồn SQLite <select aria-label="Nguồn SQLite native" value={source} onChange={event=>setSource(event.target.value)}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  {error&&<p role="alert">{error}</p>}<div data-native-source={source} data-native-loaded={rows.length}>
   {rows.map(row=><article key={row.id} data-native-record-id={row.id}><strong>{row.name||row.orderNumber||row.transactionNumber||row.id}</strong><p>{row.nativeModel} · {row.id}</p><p>{row.grandTotal!==undefined?`Giá trị chứng từ: ${row.grandTotal}`:row.amount!==undefined?`Số tiền nguồn: ${row.amount}`:row.quantity!==undefined?`Số lượng nguồn: ${row.quantity}`:''} {row.currency||row.currencyCode||''}</p></article>)}
  </div>
 </section>;
}
