// Presentation adapter over the shared source directory. No SQL, connection,
// lifecycle or financial calculation is implemented here.
const unavailable=()=>Promise.reject(Object.assign(new Error('Chưa nối runtime.orderProduct: cần trình đọc chi tiết/lịch sử đầy đủ và giao thức order.create → POST /sync'),{code:'orders-product-unavailable'}));
const plain=value=>String(value??'');
const amount=body=>[body.amount,body.totalAmount,body.grandTotal,body.total].find(value=>typeof value==='number'&&Number.isFinite(value))??null;
const nextDay=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new TypeError('Ngày không hợp lệ');const date=new Date(value+'T00:00:00Z');if(!Number.isFinite(date.getTime()))throw new TypeError('Ngày không hợp lệ');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);};
export function createOrderProductAdapter({business,product,capabilities}){
 if(typeof business?.page!=='function')throw Error('Chưa nối runtime.business.page');
 const permitted=(source,search='')=>{
  if(!capabilities)return; // Shared directory remains the authoritative verifier.
  const spec=business.sources?.[source];
  if(!spec)throw Object.assign(Error('Thiếu metadata nguồn runtime.business.sources.'+source),{code:'business-source-contract-missing'});
  const required=spec.requiredCapabilities||['home.read',spec.capability];
  if(!required.length||required.some(cap=>typeof cap!=='string'||!cap))throw Object.assign(Error('Metadata quyền không hợp lệ: runtime.business.sources.'+source+'.requiredCapabilities'),{code:'business-source-contract-missing'});
  const missing=[...required,...(source==='orders'&&search.trim()?['customers.read']:[])].filter(cap=>!capabilities.includes(cap));
  if(missing.length)throw Object.assign(Error('Thiếu quyền đã ký: '+missing.join(', ')),{code:'permission-denied'});
 };
 const summary=item=>{const body=item.document||{};return {id:item.id,customerId:plain(body.customerId),customerName:plain(body.customerName),date:plain(item.businessDate||body.date),code:plain(body.code||body.orderCode||item.id),amount:amount(body),archived:body.isArchived===true,localSyncState:'SERVER_CONFIRMED'};};
 return Object.freeze({
  async verifyReadAccess(search=''){permitted('orders',search);if(typeof business.verifyAccess!=='function')throw Error('Thiếu xác minh quyền đọc nguồn');await business.verifyAccess('orders',{text:search});return true;},
  creationCapabilities:[...new Set(['orders.create','home.read',...['customers','products','employees'].flatMap(source=>business.sources?.[source]?.requiredCapabilities||[business.sources?.[source]?.capability||'missing-source-capability:'+source])])],
  async page({search='',from='',to='',state='',after=null,limit=25}={}){
   if(state&&state!=='SERVER_CONFIRMED')return product?.localPage?product.localPage({search,from,to,state,after,limit}):unavailable();
   permitted('orders',search);
   const read=async()=>{
    const prepared=!search&&!from&&!to&&!after&&limit===25?await business.takeOrdersIntent?.():null;
    return prepared||await business.page('orders',{text:search,from:from||null,to:to?nextDay(to):null,cursor:after,limit});
   };
   let result;
   try{result=await read();}catch(error){
    // A completed background feed may publish between the first page's head
    // and row reads. Retry the unpinned first page once, reauthorizing in the
    // same directory. Never reuse a stale cursor or hide a permission/error.
    if(after||error.code!=='stale-checkpoint')throw error;
    result=await read();
   }
   return {rows:result.items.map(summary),nextCursor:result.nextCursor??result.cursor??null,metadata:result.metadata};
  },
  async lookup(source,{search='',after='',limit=25}={}){
   if(!['customers','products','employees'].includes(source))throw new TypeError('Danh mục đơn không hợp lệ');
   permitted(source,search);
   const result=await business.page(source,{text:search,cursor:after||null,limit});
   return {rows:result.items.map(item=>({id:item.id,name:plain(item.document?.name||item.document?.displayName),unit:source==='products'?plain(item.document?.unit):undefined,archived:item.document?.isArchived===true})),nextCursor:result.nextCursor??result.cursor??null};
  },
  detail:identity=>product?.detail?product.detail(identity):unavailable(),
  ledger:(customerId,checkpoint,options)=>product?.ledger?product.ledger(customerId,checkpoint,options):unavailable(),
  createManual:draft=>product?.createManual?product.createManual(draft):unavailable(),
  change:request=>product?.change?product.change(request):unavailable(),
 });
}
