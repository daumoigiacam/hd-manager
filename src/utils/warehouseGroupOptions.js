// Same ordering/last-label semantics as the former eager picker projection.
// Yield after each record so historical orders never monopolize the UI thread.
export function* buildWarehouseGroupOptions({defaults,companyGroups,products,imports,dispatches,orders,requests,
  productLookup,resolveProductGroup,normalizeLabel,groupKey}) {
  const labels=new Map();
  const add=raw=>{const label=normalizeLabel(raw||'Nhóm hàng');if(label)labels.set(groupKey(label),label)};
  for(const raw of [...defaults,...companyGroups,'Bò','Túi bóng','Thùng xốp']){add(raw);yield;}
  for(const product of products){
    for(const raw of [resolveProductGroup(product,product.name),product.mainGroup,product.groupName,product.productGroup,product.category]){add(raw);yield;}
  }
  for(const row of imports){add(row.groupName||row.productGroup);yield;}
  const itemGroup=(row,fallback)=>row.productGroupName||row.groupName||row.productGroup||resolveProductGroup(productLookup.get(row.productId),fallback);
  for(const row of dispatches){add(itemGroup(row,row.productNameSnapshot||row.productName||row.description));yield;}
  for(const order of orders) {
    for(const row of order.items||[]){add(itemGroup(row,row.productName||row.description||row.name));yield;}
    yield;
  }
  for(const request of requests){
    for(const row of request.items||request.lines||request.products||[]){add(itemGroup(row,row.productName||row.description||row.name));yield;}
    yield;
  }
  return [...labels.values()];
}
