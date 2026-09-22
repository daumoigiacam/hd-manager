export const ASSET_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'truck', label: 'Xe tải' },
  { id: 'car', label: 'Xe con' },
  { id: 'motorbike', label: 'Xe máy' },
  { id: 'machine', label: 'Máy móc' },
  { id: 'equipment', label: 'Thiết bị' },
  { id: 'office', label: 'Văn phòng' }
];

export const EXTRA_ASSET_FILTERS = [
  { id: 'generator', label: 'Máy phát điện' },
  { id: 'computer', label: 'Máy tính' },
  { id: 'phone', label: 'Điện thoại' },
  { id: 'furniture', label: 'Nội thất' },
  { id: 'tool', label: 'Công cụ' },
  { id: 'other', label: 'Tài sản khác' }
];

const normalizeText = (value) => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const toNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(`${value || ''}`.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const readDate = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDateKey = (value) => {
  const date = readDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const formatDate = (value) => {
  const date = readDate(value);
  return date ? date.toLocaleDateString('vi-VN') : '';
};

const daysUntil = (value, now = new Date()) => {
  const date = readDate(value);
  if (!date) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOfDue - startOfToday) / 86400000);
};

export const getAssetName = (asset = {}) => (
  `${asset.name || asset.vehicleName || asset.vehicleModel || asset.vehicleBrand || asset.assetName || ''}`.trim()
  || 'Tài sản chưa đặt tên'
);

export const getAssetCode = (asset = {}) => (
  `${asset.assetCode || asset.code || asset.plateNumber || asset.licensePlate || asset.vehiclePlate || asset.id || ''}`.trim()
  || 'Chưa có mã'
);

export const getAssetImage = (asset = {}) => (
  asset.imageUrl
  || asset.photoUrl
  || asset.assetImageUrl
  || asset.handoverImageUrl
  || asset.thumbnailUrl
  || ''
);

export const getAssetTypeKey = (asset = {}) => {
  const value = normalizeText(asset.type || asset.assetType || asset.category || asset.assetCategory);
  const vehicleSignal = normalizeText([
    asset.plateNumber,
    asset.licensePlate,
    asset.vehiclePlate,
    asset.vehicleBrand,
    asset.vehicleModel,
    asset.chassisNumber,
    asset.engineNumber
  ].filter(Boolean).join(' '));
  if (/xe tai|truck|van|container/.test(value)) return 'truck';
  if (/xe con|oto|o to|car|suv|sedan/.test(value)) return 'car';
  if (/xe may|motor|scooter|bike/.test(value)) return 'motorbike';
  if (/may phat|generator/.test(value)) return 'generator';
  if (/may moc|machine|may san xuat/.test(value)) return 'machine';
  if (/may tinh|computer|laptop/.test(value)) return 'computer';
  if (/dien thoai|phone|tablet/.test(value)) return 'phone';
  if (/noi that|furniture/.test(value)) return 'furniture';
  if (/cong cu|tool/.test(value)) return 'tool';
  if (/van phong|office/.test(value)) return 'office';
  if (/thiet bi|equipment/.test(value)) return 'equipment';
  if (vehicleSignal) return 'truck';
  return 'other';
};

export const getAssetTypeLabel = (asset = {}) => {
  const type = getAssetTypeKey(asset);
  return [...ASSET_FILTERS, ...EXTRA_ASSET_FILTERS].find(item => item.id === type)?.label
    || `${asset.type || asset.assetType || 'Tài sản khác'}`;
};

export const getAssetStatusMeta = (status) => {
  const normalized = normalizeText(status);
  if (/maint|bao duong|bao tri|repair/.test(normalized)) return { key: 'maintenance', label: 'Đang bảo trì', className: 'border-amber-100 bg-amber-50 text-amber-700', dotClass: 'bg-amber-500' };
  if (/inactive|tam ngung|ngung|suspended/.test(normalized)) return { key: 'suspended', label: 'Tạm ngưng', className: 'border-slate-200 bg-slate-100 text-slate-600', dotClass: 'bg-slate-400' };
  if (/dispose|thanh ly/.test(normalized)) return { key: 'disposed', label: 'Thanh lý', className: 'border-rose-100 bg-rose-50 text-rose-700', dotClass: 'bg-rose-500' };
  return { key: 'active', label: 'Đang hoạt động', className: 'border-emerald-100 bg-emerald-50 text-emerald-700', dotClass: 'bg-emerald-500' };
};

export const getDocumentExpiryMeta = (expiryDate, { noExpiry = false } = {}) => {
  if (!expiryDate) {
    return noExpiry
      ? { key: 'valid', label: 'Hợp lệ', detail: 'Không có ngày hết hạn', className: 'border-emerald-100 bg-emerald-50 text-emerald-700' }
      : { key: 'missing', label: 'Chưa cập nhật', detail: 'Chưa có ngày hết hạn', className: 'border-slate-200 bg-slate-100 text-slate-600' };
  }
  const remaining = daysUntil(expiryDate);
  if (remaining < 0) return { key: 'overdue', label: 'Quá hạn', detail: `Đã hết hạn ${Math.abs(remaining)} ngày`, className: 'border-rose-100 bg-rose-50 text-rose-700' };
  if (remaining <= 30) return { key: 'soon', label: 'Sắp hết hạn', detail: `Còn ${remaining} ngày`, className: 'border-amber-100 bg-amber-50 text-amber-700' };
  return { key: 'valid', label: 'Còn hạn', detail: `Còn ${remaining} ngày`, className: 'border-emerald-100 bg-emerald-50 text-emerald-700' };
};

export const getAssetDocumentRows = (asset = {}) => {
  const customDocuments = Array.isArray(asset.assetDocuments)
    ? asset.assetDocuments
    : (Array.isArray(asset.documents) ? asset.documents : []);
  const builtInDocuments = [
    {
      id: 'inspection',
      type: 'Đăng kiểm',
      reference: asset.inspectionCertificateNo,
      expiryDate: asset.inspectionExpiry || asset.inspectionExpiryDate,
      imageUrl: asset.inspectionImageUrl
    },
    {
      id: 'registration',
      type: 'Giấy đăng ký',
      reference: asset.registrationNumber,
      expiryDate: asset.registrationExpiry || asset.registrationExpiryDate,
      imageUrl: asset.registrationImageUrl,
      noExpiry: true
    },
    {
      id: 'insurance-liability',
      type: 'Bảo hiểm TNDS',
      reference: asset.liabilityInsuranceNo || asset.insurancePolicyNo,
      expiryDate: asset.liabilityInsuranceExpiry || asset.insuranceExpiry
    },
    {
      id: 'insurance-physical',
      type: 'Bảo hiểm vật chất',
      reference: asset.physicalInsuranceNo,
      expiryDate: asset.physicalInsuranceExpiry
    },
    {
      id: 'badge',
      type: 'Phù hiệu',
      reference: asset.badgeNumber,
      expiryDate: asset.badgeExpiry
    }
  ].filter(row => row.reference || row.expiryDate || row.imageUrl);
  const customRows = customDocuments.filter(Boolean).map((row, index) => ({
    id: row.id || `document-${index}`,
    type: row.type || row.name || 'Giấy tờ khác',
    reference: row.reference || row.number || '',
    expiryDate: row.expiryDate || row.expiry || '',
    imageUrl: row.imageUrl || row.url || '',
    note: row.note || '',
    noExpiry: Boolean(row.noExpiry)
  }));
  return [...builtInDocuments, ...customRows].map(row => ({
    ...row,
    expiry: getDocumentExpiryMeta(row.expiryDate, { noExpiry: row.noExpiry })
  }));
};

export const getAssetMaintenanceRows = (asset = {}) => {
  const savedRows = Array.isArray(asset.maintenanceSchedule) ? asset.maintenanceSchedule : [];
  const derivedNext = asset.nextMaintenanceDate || asset.nextMaintenanceKm
    ? [{
      id: 'next-maintenance',
      title: 'Bảo dưỡng định kỳ',
      dueDate: asset.nextMaintenanceDate || '',
      dueKm: asset.nextMaintenanceKm || '',
      status: '',
      isDerived: true
    }]
    : [];
  return [...savedRows, ...derivedNext].filter(Boolean).map((row, index) => {
    const dueDate = row.dueDate || row.date || row.nextDate || '';
    const remaining = daysUntil(dueDate);
    const forced = normalizeText(row.status);
    let status = 'scheduled';
    if (/complete|hoan thanh/.test(forced)) status = 'completed';
    else if (remaining !== null && remaining < 0) status = 'overdue';
    else if (remaining !== null && remaining <= 30) status = 'soon';
    return {
      id: row.id || `maintenance-${index}`,
      title: row.title || row.name || 'Bảo dưỡng định kỳ',
      dueDate,
      dueKm: row.dueKm || row.km || '',
      status,
      note: row.note || '',
      completedAt: row.completedAt || '',
      isDerived: Boolean(row.isDerived)
    };
  });
};

export const isAssetAttentionRequired = (asset = {}, metrics = {}) => {
  const status = getAssetStatusMeta(asset.status);
  if (status.key === 'maintenance' || status.key === 'suspended') return true;
  if (['red', 'yellow', 'orange'].includes(metrics.maintenanceWarning)) return true;
  if (['red', 'yellow'].includes(metrics.inspectionWarning?.level)) return true;
  return getAssetDocumentRows(asset).some(row => ['overdue', 'soon'].includes(row.expiry.key));
};

export const assetMatchesFilter = (asset = {}, filterId, metrics = {}) => (
  filterId === 'all'
    || (filterId === 'attention' && isAssetAttentionRequired(asset, metrics))
    || getAssetTypeKey(asset) === filterId
);

export const assetMatchesSearch = (asset = {}, query = '', assigneeName = '') => {
  const keyword = normalizeText(query);
  if (!keyword) return true;
  return normalizeText([
    getAssetName(asset),
    getAssetCode(asset),
    asset.type,
    asset.assetType,
    asset.category,
    asset.plateNumber,
    asset.licensePlate,
    assigneeName,
    asset.responsibleName,
    asset.unitName,
    asset.currentLocation
  ].filter(Boolean).join(' ')).includes(keyword);
};

export const getAssetImageAlt = (asset = {}) => `${getAssetName(asset)}${asset.plateNumber ? ` ${asset.plateNumber}` : ''}`;

export const getAssetDetailFields = (asset = {}, assigneeName = '') => ([
  ['Mã tài sản', getAssetCode(asset)],
  ['Loại tài sản', getAssetTypeLabel(asset)],
  ['Nhóm tài sản', asset.group || asset.assetGroup || asset.category],
  ['Thương hiệu', asset.brand || asset.vehicleBrand],
  ['Model', asset.model || asset.vehicleModel],
  ['Năm sản xuất', asset.manufactureYear || asset.year || asset.productionYear],
  ['Ngày mua', formatDate(asset.purchaseDate || asset.acquisitionDate)],
  ['Ngày đưa vào sử dụng', formatDate(asset.inUseDate || asset.handoverDate)],
  ['Người phụ trách', assigneeName || asset.responsibleName],
  ['Đơn vị sử dụng', asset.unitName || asset.usingUnit || asset.department],
  ['Vị trí hiện tại', asset.currentLocation || asset.location],
  ['Trạng thái', getAssetStatusMeta(asset.status).label]
].filter(([, value]) => Boolean(`${value || ''}`.trim())));

export const getAssetOperationalMetrics = (asset = {}, metrics = {}) => {
  const type = getAssetTypeKey(asset);
  if (['truck', 'car', 'motorbike'].includes(type)) {
    return [
      ['KM hiện tại', `${Math.round(toNumber(metrics.latestKm || asset.currentKm))} km`],
      ['L/100km', metrics.actualConsumption > 0 ? metrics.actualConsumption.toFixed(1) : 'Chưa có'],
      ['Điểm vận hành', `${metrics.driverScore ?? 100}`]
    ];
  }
  if (['machine', 'generator'].includes(type)) {
    const operatingHours = asset.operatingHours || asset.currentOperatingHours || asset.runningHours;
    return [
      ['Giờ vận hành', operatingHours ? `${operatingHours} giờ` : 'Chưa có'],
      ['Công suất', asset.power || asset.capacity || 'Chưa có'],
      ['Tình trạng', asset.condition || getAssetStatusMeta(asset.status).label]
    ];
  }
  return [
    ['Tình trạng', asset.condition || getAssetStatusMeta(asset.status).label],
    ['Ngày dùng gần nhất', formatDate(asset.lastUsedAt || asset.lastUsedDate) || 'Chưa có'],
    ['Vị trí', asset.currentLocation || asset.location || 'Chưa có']
  ];
};

export const createAssetTimelineRows = ({ asset = {}, assetCostLogs = [], getCostTypeLabel }) => {
  const rows = [];
  const add = (id, title, detail, date, tone = 'neutral') => {
    if (!date) return;
    rows.push({ id, title, detail, date, tone, time: readDate(date)?.getTime() || 0 });
  };
  add('created', 'Tạo tài sản', `Mã ${getAssetCode(asset)}`, asset.createdAt || asset.createdDate, 'good');
  add('updated', 'Cập nhật tài sản', 'Thông tin tài sản được cập nhật', asset.updatedAt || asset.updatedDate, 'neutral');
  add('handover', 'Bàn giao tài sản', asset.handoverCondition || 'Đã ghi nhận bàn giao', asset.handoverDate, 'good');
  getAssetMaintenanceRows(asset).forEach(row => {
    if (row.completedAt) add(`maintenance-${row.id}`, row.title, 'Đã hoàn thành bảo trì', row.completedAt, 'good');
  });
  getAssetDocumentRows(asset).forEach(row => {
    if (row.expiryDate) add(`document-${row.id}`, `Cập nhật ${row.type}`, row.expiry.detail, row.expiryDate, row.expiry.key === 'overdue' ? 'danger' : 'neutral');
  });
  assetCostLogs.filter(log => `${log.assetId || ''}` === `${asset.id || ''}`).forEach(log => {
    add(`cost-${log.id}`, getCostTypeLabel(log.type === 'fuel' ? 'fuel' : log.costType || log.type), log.note || 'Phát sinh chi phí tài sản', log.date || log.createdAt, 'cost');
  });
  return rows.sort((left, right) => right.time - left.time);
};

export const getAssetUpdatedLabel = (asset = {}) => {
  const date = asset.updatedAt || asset.updatedDate || asset.createdAt || asset.createdDate;
  return formatDate(date) ? `Cập nhật: ${formatDate(date)}` : 'Chưa có ngày cập nhật';
};

export const buildMaintenanceDraft = () => ({
  id: `maintenance-${Date.now()}`,
  title: '',
  dueDate: toDateKey(new Date()),
  dueKm: '',
  note: ''
});

export const buildDocumentDraft = () => ({
  id: `document-${Date.now()}`,
  type: '',
  reference: '',
  expiryDate: '',
  note: '',
  noExpiry: false
});
