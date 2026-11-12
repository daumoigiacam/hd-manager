// Pure original stock-count rules copied verbatim from actual App/shared declarations.
// normalizeLookupText retains its exact expression without the unrelated global cache.
const normalizeLookupText = (value = '') => `${value}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};
export const normalizeLeadingLabel = (str = '') => capitalizeFirst(`${str}`.trim());
export const parseLooseQuantityValue = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0;
  const matched = `${value}`.replace(/\s+/g, '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return matched ? Math.max(0, parseFloat(matched[0]) || 0) : 0;
};
export const normalizeWarehouseMeasureUnit = (unit = '') => {
  const normalized = normalizeLookupText(unit || '').replace(/\s+/g, '');
  const unitMap = {
    con: 'Con',
    cai: 'Cái',
    bo: 'Bộ',
    boc: 'Bọc',
    bao: 'Bao',
    thung: 'Thùng',
    can: 'Can',
    tui: 'Túi',
    ro: 'Rổ',
    kg: 'Kg',
    ky: 'Kg',
    ki: 'Kg',
    kilo: 'Kg'
  };
  return unitMap[normalized] || normalizeLeadingLabel(unit || 'Đơn vị');
};
export const normalizeWarehouseMeasureEntries = (entries = []) => {
  const grouped = new Map();
  (entries || []).forEach((entry) => {
    const quantity = parseLooseQuantityValue(entry?.quantity ?? entry?.value ?? entry?.amount ?? entry?.total);
    const unit = normalizeWarehouseMeasureUnit(entry?.unit || entry?.label || '');
    if (quantity <= 0 || !unit) return;
    const key = normalizeLookupText(unit);
    const current = grouped.get(key) || { unit, quantity: 0 };
    current.quantity += quantity;
    grouped.set(key, current);
  });
  return Array.from(grouped.values());
};
export const normalizeWarehouseCountedMeasureEntries = (entries = []) => {
  const grouped = new Map();
  (entries || []).forEach((entry) => {
    const rawQuantity = entry?.quantity ?? entry?.value ?? entry?.amount ?? entry?.total;
    const unit = normalizeWarehouseMeasureUnit(entry?.unit || entry?.label || '');
    if (rawQuantity === null || rawQuantity === undefined || `${rawQuantity}`.trim() === '' || !unit) return;
    const quantity = parseLooseQuantityValue(rawQuantity);
    if (quantity < 0) return;
    grouped.set(normalizeLookupText(unit), { unit, quantity });
  });
  return Array.from(grouped.values());
};
export const buildWarehouseImportMeasureEntries = ({ totalKg = 0, quantity = 0, quantityUnit = 'Con', extraMeasures = [] } = {}) => normalizeWarehouseMeasureEntries([
  totalKg > 0 ? { unit: 'Kg', quantity: totalKg } : null,
  quantity > 0 ? { unit: quantityUnit || 'Con', quantity } : null,
  ...(extraMeasures || [])
].filter(Boolean));

export const STOCK_COUNT_RULES = Object.freeze({
  'stockCount.create':{capability:'stockCounts.create',action:'create_actual_inventory_stock'},
  'stockCount.update':{capability:'stockCounts.update',action:'edit_actual_inventory_stock'},
  'stockCount.archive':{capability:'stockCounts.archive',action:'delete_actual_inventory_stock'},
});
export const STOCK_COUNT_REASON_CAPABILITY='stockCounts.reason';
export const STOCK_COUNT_REASONS=['Đếm sai','Bị mất','Hư hỏng','Bị lỗi','Bị chết','Bị loại','Trả nhà cung cấp','Khác'];
const invalid=message=>{throw Object.assign(Error(message),{code:'invalid-argument'});};
export const stockCountIdentifier=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
export function canonicalStockCount(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalStockCount).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalStockCount(value[key])).join(',')+'}';
}
export const publicStockCount=value=>JSON.parse(JSON.stringify(value,(key,item)=>/(password|token|secret|apikey|map.*key)$/i.test(key)?undefined:item));
export function stockCountRevision(document){const n=document?.offlineRevision??0;if(!Number.isSafeInteger(n)||n<0||n>=Number.MAX_SAFE_INTEGER)invalid('Phiên bản phiếu kiểm tồn không hợp lệ.');return n;}
const businessDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
export function buildStockCountValues(draft){
  const groupName=normalizeLeadingLabel(draft.groupName||'');
  if(!groupName)invalid('Vui lòng chọn nhóm hàng cần kiểm thực tế.');
  const quantity=parseLooseQuantityValue(draft.quantity),totalKg=parseLooseQuantityValue(draft.totalKg);
  const hasQuantityInput=`${draft.quantity??''}`.trim()!=='',hasTotalKgInput=`${draft.totalKg??''}`.trim()!=='';
  if(typeof draft.quantityUnit!=='string'||!draft.quantityUnit.trim())invalid('Hãy chọn rõ đơn vị kiểm tồn; không suy đơn vị lịch sử.');
  const quantityUnit=normalizeWarehouseMeasureUnit(draft.quantityUnit);
  const countedMeasures=normalizeWarehouseCountedMeasureEntries([
    hasQuantityInput?{unit:quantityUnit,quantity}:null,hasTotalKgInput?{unit:'Kg',quantity:totalKg}:null,
  ].filter(Boolean));
  if(!countedMeasures.length)invalid('Cần nhập ít nhất một chỉ số thực tế như số con, số kg, số bao hoặc số thùng.');
  const values={groupName,totalKg,quantity,quantityUnit,measures:buildWarehouseImportMeasureEntries({totalKg,quantity,quantityUnit}),extraMeasures:[],countedMeasures,date:draft.date,reason:`${draft.reason||''}`,note:`${draft.note||''}`.trim()};
  return validateStockCountValues(values);
}
export function validateStockCountValues(value){
  const keys=['groupName','totalKg','quantity','quantityUnit','measures','extraMeasures','countedMeasures','date','reason','note'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))invalid('Trường kiểm tồn ngoài giao thức được duyệt.');
  if(typeof value.groupName!=='string'||!value.groupName||value.groupName.length>160||normalizeLeadingLabel(value.groupName)!==value.groupName||
    !businessDate(value.date)||typeof value.quantityUnit!=='string'||!value.quantityUnit.trim()||value.quantityUnit.length>80||normalizeWarehouseMeasureUnit(value.quantityUnit)!==value.quantityUnit||
    !['quantity','totalKg'].every(k=>typeof value[k]==='number'&&Number.isFinite(value[k])&&value[k]>=0)||
    !Array.isArray(value.extraMeasures)||value.extraMeasures.length||typeof value.reason!=='string'||value.reason.length>1000||typeof value.note!=='string'||value.note.length>4000)invalid('Dữ liệu hoặc ngày kiểm tồn không hợp lệ.');
  if(!Array.isArray(value.countedMeasures)||value.countedMeasures.length<1||value.countedMeasures.length>2||canonicalStockCount(normalizeWarehouseCountedMeasureEntries(value.countedMeasures))!==canonicalStockCount(value.countedMeasures))invalid('Chỉ số kiểm tồn không hợp lệ.');
  for(const measure of value.countedMeasures){if(Object.keys(measure).sort().join(',')!=='quantity,unit'||!Number.isFinite(measure.quantity)||measure.quantity<0||
    ![value.quantityUnit,'Kg'].includes(measure.unit)||measure.quantity!==(measure.unit==='Kg'?value.totalKg:value.quantity))invalid('Chỉ số kiểm tồn không khớp giá trị đã nhập.');}
  if(canonicalStockCount(buildWarehouseImportMeasureEntries(value))!==canonicalStockCount(value.measures))invalid('Số đo kiểm tồn đã thay đổi.');
  return value;
}
export function assertLegacyStockCount(document){
  if(!document||!stockCountIdentifier(document.id)||typeof document.companyId!=='string'||document.readOnlyLedger||document.sourceSystem==='hd-connect-vps'||document.nativeModel||document.sourceArchiveSha256)invalid('Nguồn kiểm tồn này cần giao thức riêng, không dùng phiếu legacy.');
}
export function assertEditableStockCount(document){
  assertLegacyStockCount(document);
  if(document.isArchived)invalid('Phiếu đã lưu trữ không thể sửa.');
  if((document.extraMeasures?.length||0)>0||(document.countedMeasures?.length||0)>2||(document.measures?.length||0)>2)invalid('Phiếu có chỉ số bổ sung cần luồng sửa đầy đủ; không được bỏ các đơn vị lịch sử.');
  const nonKg=(document.countedMeasures||[]).filter(x=>normalizeWarehouseMeasureUnit(x.unit)!=='Kg');
  if(nonKg.length>1)invalid('Phiếu có nhiều đơn vị kiểm tồn cần luồng sửa đầy đủ.');
  if((document.measures||[]).filter(x=>normalizeWarehouseMeasureUnit(x.unit)!=='Kg').length>1)invalid('Phiếu có nhiều đơn vị số đo cần luồng sửa đầy đủ.');
}
export function applyStockCountIntent(base,kind,values,{id,tenantId,employeeId,editedAt}){
  if(!STOCK_COUNT_RULES[kind]||!stockCountIdentifier(id)||!stockCountIdentifier(employeeId)||typeof editedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(editedAt)||!Number.isFinite(Date.parse(editedAt)))invalid('Định danh hoặc thời gian thao tác không hợp lệ.');
  if(kind==='stockCount.create')return {...validateStockCountValues(values),id,clientMutationId:id.slice(4),companyId:tenantId,empId:employeeId,createdByEmpId:employeeId,isArchived:false,createdAt:editedAt,offlineRevision:1};
  assertLegacyStockCount(base);if(base.id!==id||base.companyId!==tenantId)invalid('Phiếu kiểm tồn ngoài phạm vi.');
  if(kind==='stockCount.archive')return {...base,isArchived:true,archivedAt:editedAt,archivedByEmpId:employeeId,offlineRevision:stockCountRevision(base)+1};
  assertEditableStockCount(base);return {...base,...validateStockCountValues(values),updatedAt:editedAt,offlineRevision:stockCountRevision(base)+1};
}
export function validateStockCountPayload(kind,payload){
  const keys=['version','baseFingerprint','baseRevision','baseDocument','values','editedAt','employeeId','resolvesConflictId'];
  if(!STOCK_COUNT_RULES[kind]||!payload||Object.keys(payload).length!==keys.length||Object.keys(payload).some(k=>!keys.includes(k))||payload.version!==1||
    !Number.isSafeInteger(payload.baseRevision)||payload.baseRevision<0||!stockCountIdentifier(payload.employeeId)||
    typeof payload.editedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(payload.editedAt)||!Number.isFinite(Date.parse(payload.editedAt))||
    (payload.resolvesConflictId!==null&&!stockCountIdentifier(payload.resolvesConflictId)))invalid('Lệnh kiểm tồn không hợp lệ.');
  if(kind==='stockCount.create'){
    if(payload.baseDocument!==null||payload.baseFingerprint!==null||payload.baseRevision!==0||payload.resolvesConflictId!==null)invalid('Phiếu mới không được ghi đè nguồn đã có.');
  }else{
    assertLegacyStockCount(payload.baseDocument);
    if(!/^[a-f0-9]{64}$/.test(payload.baseFingerprint)||stockCountRevision(payload.baseDocument)!==payload.baseRevision)invalid('Thiếu bản nguồn và CAS kiểm tồn.');
  }
  if(kind==='stockCount.archive'){if(payload.values!==null)invalid('Lưu trữ không sửa số lượng hoặc số đo.');}
  else validateStockCountValues(payload.values);
  return payload;
}

export const buildStoredWarehouseMeasureEntries = (item = {}) => {
  const totalKg = parseLooseQuantityValue(item.totalKg ?? item.weightKg);
  const quantity = parseLooseQuantityValue(item.quantity ?? item.totalQuantity);
  const quantityUnit = normalizeWarehouseMeasureUnit(item.quantityUnit || item.unit || 'Con');
  const primaryUnitKey = normalizeLookupText(quantityUnit);
  const kgKey = normalizeLookupText('Kg');
  if (totalKg <= 0 && quantity <= 0 && Array.isArray(item.measures) && item.measures.length > 0) {
    return normalizeWarehouseMeasureEntries(item.measures);
  }
  const extraSource = Array.isArray(item.extraMeasures) && item.extraMeasures.length > 0
    ? item.extraMeasures
    : Array.isArray(item.measures)
      ? item.measures.filter((measure) => {
        const unitKey = normalizeLookupText(normalizeWarehouseMeasureUnit(measure?.unit || measure?.label || ''));
        return unitKey && unitKey !== kgKey && unitKey !== primaryUnitKey;
      })
      : [];
  return buildWarehouseImportMeasureEntries({
    totalKg,
    quantity,
    quantityUnit,
    extraMeasures: extraSource
  });
};
export const buildStoredWarehouseStockCountMeasureEntries = (item = {}) => {
  if (Array.isArray(item.countedMeasures) && item.countedMeasures.length > 0) {
    return normalizeWarehouseCountedMeasureEntries(item.countedMeasures);
  }
  return buildStoredWarehouseMeasureEntries(item);
};

export function stockCountDraftFromDocument(document){
  const hasCounted=Array.isArray(document.countedMeasures)&&document.countedMeasures.length>0;
  const primaryUnit=Boolean(document.quantityUnit||document.unit);
  // Same original stored-measure resolver, except never infer historical Con
  // for a legacy positive quantity with no persisted unit. Require user choice.
  const measures=hasCounted||primaryUnit?buildStoredWarehouseStockCountMeasureEntries(document):normalizeWarehouseMeasureEntries(document.measures||[]);
  const kg=measures.find(row=>normalizeWarehouseMeasureUnit(row.unit)==='Kg'),quantity=measures.find(row=>normalizeWarehouseMeasureUnit(row.unit)!=='Kg');
  return {groupName:normalizeLeadingLabel(document.groupName||document.productGroup||''),
    quantity:quantity?String(quantity.quantity):hasCounted||primaryUnit?'':document.quantity??document.totalQuantity??'',
    totalKg:kg?String(kg.quantity):hasCounted||primaryUnit?'':document.totalKg??document.weightKg??'',
    quantityUnit:quantity?.unit||document.quantityUnit||document.unit||'',date:document.date||'',reason:document.reason||'',note:document.note||''};
}
