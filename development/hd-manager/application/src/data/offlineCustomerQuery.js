export const CUSTOMER_DIRECTORY_PAGE_SIZE=20;
export const normalizeCustomerLookup=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().trim();

// Bound result payloads and keep all identity/search predicates inside SQLite.
// Substring predicates cannot use a B-tree search-key index; do not pretend
// that adding one would remove this scoped scan.
export function offlineCustomerQuery(keys,{search='',after='',limit=20,managerId='all',directory=false}={},historyFilter=null){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new TypeError('Invalid customer page limit');
 if(typeof managerId!=='string'||typeof after!=='string')throw new TypeError('Invalid customer filter');
 const terms=[...new Set(normalizeCustomerLookup(search).split(/\s+/).filter(Boolean))];
 if(terms.length>16)throw new TypeError('Too many search terms');
 const predicates=['tenant_id=?','principal_id=?','id>?'];
 const params=[...keys,after];
 if(managerId!=='all'){predicates.push("json_extract(local_json,'$.empId')=?");params.push(managerId);}
 for(const term of terms){predicates.push('instr(search_key,?)>0');params.push(term);}
 if(historyFilter){predicates.push(historyFilter.sql);params.push(...historyFilter.params);}
 const fields=['id','companyId','name','phone','address','customerHonorific','customerGroup','empId','zaloContact','zaloGroupLink','location','locationUrl','locationInput','locationLat','locationLng','allowedDriverIds','isArchived','createdAt','updatedAt'];
 const document=directory?`json_object(${fields.map(field=>`'${field}',json_extract(local_json,'$.${field}')`).join(',')}) AS local_json`:'local_json';
 return {sql:`SELECT id,${document},state FROM offline_customers WHERE ${predicates.join(' AND ')} ORDER BY id LIMIT ?`,params:[...params,limit]};
}
