// Read-only historical evidence. Never infer a unit from catalog defaults,
// prices, quantities, names or approximate matching; never rewrite a voucher.
const text=value=>`${value??''}`.trim();
const items=record=>record?.items?.length?record.items:record?.lines?.length?record.lines:record?.products?.length?record.products:record?.primaryItem?[record.primaryItem]:[];
const distinct=values=>[...new Set(values.map(text).filter(Boolean))];
const savedOrdered=record=>distinct([record?.orderedUnit,record?.orderUnit,record?.inputUnit]);
const savedPricing=record=>distinct([record?.pricingUnit,record?.billingUnit]);
export function createTransactionUnitEvidence({orderRequests=[],warehouseDispatches=[]}={}){
 const requests=new Map(orderRequests.map(row=>[row.id,row]));
 const dispatches=new Map(warehouseDispatches.map(row=>[row.id,row]));
 return ({order,item,itemIndex=0})=>{
  const evidence=[],conflicts=[];
  const ownOrder=savedOrdered(item),ownPricing=savedPricing(item);
  if(ownOrder.length>1||ownPricing.length>1)conflicts.push('CONTRADICTORY_SAVED_UNITS');
  const candidates=[];
  const ids=distinct(item.sourceDispatchIds||[]);
  if(!ids.length&&items(order).length===1)ids.push(...distinct(order.sourceDispatchIds||[]));
  let unresolved=0;
  for(const id of ids){
   const dispatch=dispatches.get(id);
   if(!dispatch){unresolved++;continue;}
   const sameScope=dispatch.companyId===order.companyId&&dispatch.productId===item.productId&&Boolean(item.productId)
    &&(!order.customerId||dispatch.customerId===order.customerId)
    &&(!(order.branchId||order.customerBranchId)||text(dispatch.branchId||dispatch.customerBranchId)===text(order.branchId||order.customerBranchId));
   if(!sameScope){conflicts.push('DISPATCH_SCOPE_MISMATCH');continue;}
   const request=requests.get(dispatch.sourceOrderRequestId),key=text(dispatch.sourceOrderRequestRowKey);
   if(!request||!key){unresolved++;continue;}
   if(request.companyId!==order.companyId||(order.customerId&&request.customerId!==order.customerId)){
    conflicts.push('REQUEST_SCOPE_MISMATCH');continue;
   }
   const branch=text(order.branchId||order.customerBranchId);
   if(branch&&text(request.branchId||request.customerBranchId)!==branch){conflicts.push('REQUEST_BRANCH_MISMATCH');continue;}
   const orderTime=Date.parse(order.createdAt||''),requestTime=Date.parse(request.updatedAt||request.modifiedAt||'');
   if(Number.isFinite(orderTime)&&Number.isFinite(requestTime)&&requestTime>orderTime){conflicts.push('REQUEST_CHANGED_AFTER_ORDER');continue;}
   const rows=items(request),matches=rows.map((row,index)=>({row,index})).filter(({row,index})=>{
    const rowToken=text(row.rowKey||row.id||row.lineId||row.itemId||index);
    return row.productId===item.productId&&(key===`${request.id}_${rowToken}`||key===text(row.rowKey||row.id||row.lineId||row.itemId)
     ||(key===`${request.id}_${item.productId}`&&rows.filter(r=>r.productId===item.productId).length===1));
   });
   if(matches.length!==1){unresolved++;if(matches.length>1)conflicts.push('AMBIGUOUS_REQUEST_LINE');continue;}
   const {row,index}=matches[0];
   const ordered=distinct([...savedOrdered(row),row.quantityUnit]),pricing=savedPricing(row);
   if(ordered.length>1||pricing.length>1){conflicts.push('REQUEST_UNIT_CONFLICT');continue;}
   if(!ordered.length){unresolved++;continue;}
   const ref={source:'orderRequests',documentId:request.id,itemIndex:index,viaDispatchId:id,orderedUnit:ordered[0],pricingUnit:pricing[0]||'',scopeVerified:true};
   candidates.push(ref);evidence.push(ref);
  }
  const linkedOrder=distinct(candidates.map(row=>row.orderedUnit)),linkedPricing=distinct(candidates.map(row=>row.pricingUnit));
  if(linkedOrder.length>1||linkedPricing.length>1)conflicts.push('LINKED_UNITS_DISAGREE');
  if(ownOrder.length&&linkedOrder.length&&!linkedOrder.includes(ownOrder[0]))conflicts.push('SAVED_LINKED_ORDER_UNIT_CONFLICT');
  if(ownPricing.length&&linkedPricing.length&&!linkedPricing.includes(ownPricing[0]))conflicts.push('SAVED_LINKED_PRICING_UNIT_CONFLICT');
  const complete=ids.length>0&&candidates.length===ids.length&&unresolved===0&&conflicts.length===0;
  const orderedUnit=ownOrder.length===1?ownOrder[0]:complete?linkedOrder[0]||'':'';
  const pricingUnit=ownPricing.length===1?ownPricing[0]:complete&&candidates.every(row=>row.pricingUnit)?linkedPricing[0]||'':'';
  return {lineId:`${order.id}:${itemIndex}`,orderedUnit,pricingUnit,
   status:conflicts.length?'CONFLICT':ownOrder.length===1?'ORIGINAL_DOCUMENT':orderedUnit?'EXACT_LINKED_DOCUMENT':'INSUFFICIENT_EVIDENCE',
   evidence,conflicts:distinct(conflicts),unresolvedLinks:unresolved,originalValuesPreserved:true};
 };
}
