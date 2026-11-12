// Preserve Array.find's FIRST matching entry across the customer-ID OR
// compatible name/phone conditions. Labels/IDs/phones must stay immutable while
// grouping; callers may update only totals/counts/timestamps on the entries.
export function createSupplierEntryIndex({normalizeName,normalizePhone}) {
  if(typeof normalizeName!=='function'||typeof normalizePhone!=='function')throw new TypeError('Supplier normalizers are required.');
  const customers=new Map(),names=new Map();let order=0;
  const earlier=(left,right)=>!left?right:!right?left:left.order<=right.order?left:right;
  return {
    add(entry){
      const value={entry,order:order++},key=normalizeName(entry.name);
      if(entry.customerId&&!customers.has(entry.customerId))customers.set(entry.customerId,value);
      let group=names.get(key);
      if(!group){group={first:value,blank:null,phones:new Map()};names.set(key,group);}
      if(!entry.phone){if(!group.blank)group.blank=value;}
      else {const phone=normalizePhone(entry.phone);if(!group.phones.has(phone))group.phones.set(phone,value);}
      return entry;
    },
    find(name,phone,customerId){
      const byId=customerId&&customerId===customerId?customers.get(customerId):undefined;
      const group=names.get(normalizeName(name));
      const byName=!group?undefined:!phone?group.first:earlier(group.blank,group.phones.get(normalizePhone(phone)));
      return earlier(byId,byName)?.entry;
    },
  };
}
