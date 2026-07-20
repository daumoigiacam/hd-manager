const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return fallback;
  const normalized = String(value)
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const normalizeText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const startOfDay = (date = new Date()) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const getDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dateKey = (value) => {
  const date = getDateValue(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const monthKey = (value) => {
  const date = getDateValue(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getItemDate = (item = {}) =>
  item.date ||
  item.orderDate ||
  item.createdAt ||
  item.updatedAt ||
  item.importDate ||
  item.dispatchDate ||
  item.paymentDate;

const getProductDisplayName = (product = {}) =>
  product.shortName ||
  product.abbreviation ||
  product.code ||
  product.name ||
  product.productName ||
  'Sản phẩm';

const getProductGroupName = (product = {}, fallback = '') =>
  product.mainGroup ||
  product.groupName ||
  product.category ||
  product.type ||
  fallback ||
  getProductDisplayName(product);

const getProductPrice = (product = {}) =>
  toNumber(
    product.sellingPrice ??
      product.price ??
      product.defaultPrice ??
      product.unitPrice ??
      product.salePrice,
    0
  );

const buildProductIndexes = (products = []) => {
  const byId = new Map();
  const byName = new Map();
  products.forEach((product) => {
    if (!product) return;
    if (product.id) byId.set(product.id, product);
    const keys = [
      product.name,
      product.productName,
      product.shortName,
      product.abbreviation,
      product.code,
      product.mainGroup,
      product.groupName,
    ];
    keys.forEach((key) => {
      const normalized = normalizeText(key);
      if (normalized && !byName.has(normalized)) byName.set(normalized, product);
    });
  });
  return { byId, byName };
};

const resolveProduct = (line = {}, indexes) => {
  if (line.productId && indexes.byId.has(line.productId)) return indexes.byId.get(line.productId);
  const keys = [
    line.productName,
    line.name,
    line.itemName,
    line.type,
    line.productType,
    line.shortName,
    line.productCode,
  ];
  for (const key of keys) {
    const normalized = normalizeText(key);
    if (normalized && indexes.byName.has(normalized)) return indexes.byName.get(normalized);
  }
  return null;
};

const extractOrderLines = (order = {}) => {
  const collections = [order.items, order.products, order.lines, order.orderItems, order.details];
  const found = collections.find((collection) => Array.isArray(collection) && collection.length);
  if (found) return found;
  if (order.productName || order.productId || order.productType) return [order];
  return [];
};

const getLineQuantity = (line = {}) =>
  toNumber(
    line.quantity ??
      line.qty ??
      line.count ??
      line.amount ??
      line.numberOfItems ??
      line.numberOfBirds,
    0
  );

const getLineKg = (line = {}) =>
  toNumber(line.weightKg ?? line.kg ?? line.totalKg ?? line.actualWeightKg ?? line.netWeight, 0);

const getLineUnit = (line = {}) =>
  String(line.unit || line.quantityUnit || line.countUnit || line.measureUnit || '').trim();

const getLinePrice = (line = {}) =>
  toNumber(line.unitPrice ?? line.price ?? line.salePrice ?? line.sellingPrice ?? line.pricePerKg, 0);

const getLineTotal = (line = {}) => {
  const explicit = toNumber(line.total ?? line.totalAmount ?? line.amountMoney ?? line.lineTotal, 0);
  if (explicit > 0) return explicit;
  const price = getLinePrice(line);
  const kg = getLineKg(line);
  const quantity = getLineQuantity(line);
  const basis = kg > 0 ? kg : quantity;
  return basis * price;
};

const getDefaultRules = () => ({
  targetMargin: 20,
  standardMargin: 18,
  minMargin: 15,
  maxMargin: 30,
  operationMode: 'assistant',
  autoAdjustPercent: 3,
  allocationBasis: 'kg',
  costAllocation: {
    direct: 100,
    production: 100,
    labor: 100,
    management: 100,
    finance: 100,
    asset: 100,
  },
  lossStages: [
    { name: 'Sống -> Không móc', inputWeight: 3, outputWeight: 2.65 },
    { name: 'Không móc -> Móc', inputWeight: 2.65, outputWeight: 2.35 },
  ],
  cutParts: [
    { partName: 'Ức', ratioPercent: 18, valueFactor: 1.25, lossPercent: 2 },
    { partName: 'Đùi', ratioPercent: 20, valueFactor: 1.2, lossPercent: 2 },
    { partName: 'Cánh', ratioPercent: 12, valueFactor: 1.18, lossPercent: 1 },
    { partName: 'Chân', ratioPercent: 6, valueFactor: 0.95, lossPercent: 1 },
    { partName: 'Đầu cổ', ratioPercent: 10, valueFactor: 0.75, lossPercent: 1 },
    { partName: 'Lòng', ratioPercent: 7, valueFactor: 0.9, lossPercent: 1 },
    { partName: 'Xương', ratioPercent: 12, valueFactor: 0.55, lossPercent: 1 },
  ],
});

const normalizeRules = (rules = {}) => {
  const defaults = getDefaultRules();
  const costAllocation = {
    ...defaults.costAllocation,
    ...(rules.costAllocation || {}),
  };
  return {
    ...defaults,
    ...rules,
    targetMargin: toNumber(rules.targetMargin, defaults.targetMargin),
    standardMargin: toNumber(rules.standardMargin, defaults.standardMargin),
    minMargin: toNumber(rules.minMargin, defaults.minMargin),
    maxMargin: toNumber(rules.maxMargin, defaults.maxMargin),
    autoAdjustPercent: toNumber(rules.autoAdjustPercent, defaults.autoAdjustPercent),
    costAllocation,
    lossStages: Array.isArray(rules.lossStages) && rules.lossStages.length ? rules.lossStages : defaults.lossStages,
    cutParts: Array.isArray(rules.cutParts) && rules.cutParts.length ? rules.cutParts : defaults.cutParts,
  };
};

const buildCostBuckets = ({ expenses = [], assets = [], assetCostLogs = [], today = new Date(), rules }) => {
  const thisMonth = monthKey(today);
  const monthlyExpenses = expenses.filter((expense) => monthKey(getItemDate(expense)) === thisMonth);
  const byType = monthlyExpenses.reduce(
    (acc, expense) => {
      const amount = toNumber(expense.amount ?? expense.value ?? expense.total, 0);
      const text = normalizeText(`${expense.type || ''} ${expense.category || ''} ${expense.note || ''} ${expense.name || ''}`);
      if (/luong|nhan cong|cong nhan|salary|payroll/.test(text)) acc.labor += amount;
      else if (/dien|nuoc|gas|hoa chat|ve sinh|san xuat|da|bao bi|tem|tui/.test(text)) acc.production += amount;
      else if (/lai vay|ngan hang|phi thanh toan|tai chinh/.test(text)) acc.finance += amount;
      else if (/van phong|ke toan|nhan su|dieu hanh|quan ly/.test(text)) acc.management += amount;
      else acc.direct += amount;
      return acc;
    },
    { direct: 0, production: 0, labor: 0, management: 0, finance: 0 }
  );

  const monthlyAssetLogs = assetCostLogs.filter((log) => monthKey(getItemDate(log)) === thisMonth);
  const assetLogCost = monthlyAssetLogs.reduce((sum, log) => sum + toNumber(log.amount ?? log.cost ?? log.value, 0), 0);
  const monthlyDepreciation = assets.reduce((sum, asset) => {
    const depreciation =
      toNumber(asset.monthlyDepreciation, 0) ||
      toNumber(asset.depreciationPerMonth, 0) ||
      toNumber(asset.purchasePrice ?? asset.value ?? asset.cost, 0) / Math.max(toNumber(asset.usefulLifeMonths, 0), 1);
    return sum + (Number.isFinite(depreciation) ? depreciation : 0);
  }, 0);

  const raw = {
    ...byType,
    asset: assetLogCost + monthlyDepreciation,
  };

  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value * (toNumber(rules.costAllocation?.[key], 100) / 100)])
  );
};

const buildSalesMetrics = ({ orders = [], products = [], today = new Date() }) => {
  const indexes = buildProductIndexes(products);
  const todayKey = dateKey(today);
  const thisMonth = monthKey(today);
  const metrics = new Map();
  const ensure = (product, line = {}) => {
    const name = product ? getProductDisplayName(product) : line.productName || line.name || line.productType || 'Sản phẩm khác';
    const key = product?.id || normalizeText(name);
    if (!metrics.has(key)) {
      metrics.set(key, {
        productId: product?.id || '',
        productName: name,
        groupName: getProductGroupName(product || {}, line.groupName || line.mainGroup || ''),
        unit: getLineUnit(line) || product?.unit || 'kg',
        currentPrice: getProductPrice(product || line),
        todayRevenue: 0,
        monthRevenue: 0,
        todayQuantity: 0,
        monthQuantity: 0,
        todayKg: 0,
        monthKg: 0,
        orders: 0,
      });
    }
    return metrics.get(key);
  };

  orders.forEach((order) => {
    const orderDate = getItemDate(order);
    const isToday = dateKey(orderDate) === todayKey;
    const isMonth = monthKey(orderDate) === thisMonth;
    if (!isToday && !isMonth) return;
    extractOrderLines(order).forEach((line) => {
      const product = resolveProduct(line, indexes);
      const metric = ensure(product, line);
      const total = getLineTotal(line);
      const quantity = getLineQuantity(line);
      const kg = getLineKg(line);
      if (isToday) {
        metric.todayRevenue += total;
        metric.todayQuantity += quantity;
        metric.todayKg += kg;
      }
      if (isMonth) {
        metric.monthRevenue += total;
        metric.monthQuantity += quantity;
        metric.monthKg += kg;
        metric.orders += 1;
      }
    });
  });

  return Array.from(metrics.values()).sort((a, b) => b.monthRevenue - a.monthRevenue);
};

const buildInputMetrics = ({ pricingInputs = [], warehouseImports = [], today = new Date() }) => {
  const thisMonth = monthKey(today);
  const rows = [];
  pricingInputs.forEach((input) => {
    if (monthKey(getItemDate(input)) !== thisMonth) return;
    const totalKg = toNumber(input.weightKg ?? input.totalKg, 0);
    const quantity = toNumber(input.quantity ?? input.count, 0);
    const pricePerKg = toNumber(input.pricePerKg, 0);
    const pricePerUnit = toNumber(input.pricePerUnit ?? input.pricePerCon, 0);
    rows.push({
      id: input.id,
      source: 'pricing',
      groupName: input.poultryType || input.groupName || input.productName || 'Nguyên liệu',
      batchCode: input.batchCode || input.lotCode || '',
      supplier: input.supplier || '',
      totalKg,
      quantity,
      quantityUnit: input.quantityUnit || input.unit || '',
      unitPrice: pricePerKg || pricePerUnit,
      pricePerKg,
      pricePerUnit,
      amount: toNumber(input.amount ?? input.totalAmount, 0) ||
        totalKg * pricePerKg ||
        quantity * pricePerUnit,
      date: getItemDate(input),
      timestamp: getDateValue(input.updatedAt || input.createdAt || input.importDate || input.date || getItemDate(input))?.getTime() || 0,
    });
  });
  warehouseImports.forEach((input) => {
    if (monthKey(getItemDate(input)) !== thisMonth) return;
    const totalKg = toNumber(input.totalKg ?? input.weightKg ?? input.kg, 0);
    const quantity = toNumber(input.quantity ?? input.count ?? input.totalQuantity, 0);
    const unitPrice = toNumber(input.unitPrice ?? input.pricePerKg ?? input.pricePerUnit, 0);
    rows.push({
      id: input.id,
      source: 'warehouse',
      groupName: input.groupName || input.productName || input.name || 'Nhập kho',
      batchCode: input.batchCode || input.lotCode || '',
      supplier: input.supplier || '',
      totalKg,
      quantity,
      quantityUnit: input.quantityUnit || input.unit || '',
      unitPrice,
      pricePerKg: unitPrice,
      pricePerUnit: unitPrice,
      amount:
        toNumber(input.amount ?? input.totalAmount ?? input.amountMoney ?? input.total, 0) ||
        (totalKg > 0 && unitPrice > 0 ? totalKg * unitPrice : 0) ||
        (quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0),
      date: getItemDate(input),
      timestamp: getDateValue(input.updatedAt || input.createdAt || input.importDate || input.date || getItemDate(input))?.getTime() || 0,
    });
  });
  return rows;
};

const getInputTimestamp = (item = {}) => {
  const explicitTimestamp = toNumber(item.timestamp, 0);
  if (explicitTimestamp > 0) return explicitTimestamp;
  const date = getDateValue(item.date || getItemDate(item));
  return date ? date.getTime() : 0;
};

const getInputRawPrices = (item = {}) => {
  const amount = toNumber(item.amount ?? item.totalAmount ?? item.total, 0);
  const totalKg = toNumber(item.totalKg ?? item.weightKg ?? item.kg, 0);
  const quantity = toNumber(item.quantity ?? item.count ?? item.totalQuantity, 0);
  const unitPrice = toNumber(item.unitPrice, 0);
  const explicitKgPrice = toNumber(item.pricePerKg, 0);
  const explicitUnitPrice = toNumber(item.pricePerUnit ?? item.pricePerCon, 0);

  const rawKgPrice =
    totalKg > 0 && amount > 0
      ? amount / totalKg
      : explicitKgPrice || (totalKg > 0 ? unitPrice : 0);

  const rawUnitPrice =
    quantity > 0 && amount > 0
      ? amount / quantity
      : explicitUnitPrice || (quantity > 0 ? unitPrice : 0);

  return {
    rawKgPrice: Number.isFinite(rawKgPrice) ? rawKgPrice : 0,
    rawUnitPrice: Number.isFinite(rawUnitPrice) ? rawUnitPrice : 0,
  };
};

const buildLatestInputCostBasis = ({
  inputRows = [],
  lossSummary = {},
  allocatedCost = 0,
  effectiveKg = 0,
  totalQuantity = 0,
}) => {
  const outputRatio = Math.max(toNumber(lossSummary.outputRatio, 1), 0.01);
  const allocatedCostPerKg = effectiveKg > 0 ? allocatedCost / effectiveKg : 0;
  const allocatedCostPerUnit = totalQuantity > 0 ? allocatedCost / totalQuantity : 0;
  const byGroup = new Map();
  let global = null;

  const putLatest = (key, basis) => {
    if (!key) return;
    const current = byGroup.get(key);
    if (!current || basis.timestamp >= current.timestamp) byGroup.set(key, basis);
  };

  inputRows.forEach((row) => {
    const { rawKgPrice, rawUnitPrice } = getInputRawPrices(row);
    if (rawKgPrice <= 0 && rawUnitPrice <= 0) return;

    const basis = {
      groupName: row.groupName || 'Nguyên liệu',
      date: row.date,
      timestamp: getInputTimestamp(row),
      rawKgPrice,
      rawUnitPrice,
      costPerKg: rawKgPrice > 0 ? rawKgPrice / outputRatio + allocatedCostPerKg : 0,
      costPerUnit: rawUnitPrice > 0 ? rawUnitPrice + allocatedCostPerUnit : 0,
      source: row.source || 'input',
    };

    const groupKeys = [
      row.groupName,
      row.productName,
      row.poultryType,
      row.name,
    ].map(normalizeText).filter(Boolean);
    groupKeys.forEach((key) => putLatest(key, basis));

    if (!global || basis.timestamp >= global.timestamp) global = basis;
  });

  return { global, byGroup };
};

const buildInventoryRows = ({ inputRows = [], warehouseDispatches = [], warehouseStockCounts = [] }) => {
  const rows = new Map();
  const ensure = (groupName) => {
    const key = normalizeText(groupName) || 'unknown';
    if (!rows.has(key)) {
      rows.set(key, {
        groupName: groupName || 'Nhóm hàng',
        inputKg: 0,
        inputQuantity: 0,
        dispatchKg: 0,
        dispatchQuantity: 0,
        checkedKg: 0,
        checkedQuantity: 0,
        remainingKg: 0,
        remainingQuantity: 0,
      });
    }
    return rows.get(key);
  };
  inputRows.forEach((item) => {
    const row = ensure(item.groupName);
    row.inputKg += toNumber(item.totalKg, 0);
    row.inputQuantity += toNumber(item.quantity, 0);
  });
  warehouseDispatches.forEach((item) => {
    const row = ensure(item.groupName || item.productName || item.productType || item.type);
    row.dispatchKg += toNumber(item.weightKg ?? item.totalKg ?? item.kg, 0);
    row.dispatchQuantity += toNumber(item.quantity ?? item.count ?? item.numberOfBirds, 0);
  });
  warehouseStockCounts.forEach((item) => {
    const row = ensure(item.groupName || item.productName || item.productType || item.type);
    row.checkedKg += toNumber(item.actualKg ?? item.checkedKg ?? item.stockKg, 0);
    row.checkedQuantity += toNumber(item.actualQuantity ?? item.checkedQuantity ?? item.stockQuantity, 0);
  });
  rows.forEach((row) => {
    row.remainingKg = row.inputKg - row.dispatchKg;
    row.remainingQuantity = row.inputQuantity - row.dispatchQuantity;
  });
  return Array.from(rows.values()).sort((a, b) => b.inputKg + b.inputQuantity - (a.inputKg + a.inputQuantity));
};

const calculateLossSummary = (rules) => {
  const stages = rules.lossStages || [];
  if (!stages.length) return { totalLossPercent: 0, outputRatio: 1, rows: [] };
  const rows = stages.map((stage) => {
    const input = toNumber(stage.inputWeight, 0);
    const output = toNumber(stage.outputWeight, 0);
    const lossKg = Math.max(input - output, 0);
    const lossPercent = input > 0 ? (lossKg / input) * 100 : toNumber(stage.lossPercent, 0);
    return { ...stage, inputWeight: input, outputWeight: output, lossKg, lossPercent };
  });
  const firstInput = rows[0]?.inputWeight || 0;
  const finalOutput = rows[rows.length - 1]?.outputWeight || firstInput;
  const outputRatio = firstInput > 0 ? finalOutput / firstInput : 1;
  return {
    totalLossPercent: firstInput > 0 ? ((firstInput - finalOutput) / firstInput) * 100 : 0,
    outputRatio,
    rows,
  };
};

const getSuggestedMargin = ({ rules, metric, inventoryRow, inputTrendPercent }) => {
  let margin = toNumber(rules.targetMargin, 20);
  const min = toNumber(rules.minMargin, 15);
  const max = toNumber(rules.maxMargin, 30);
  const monthlyQuantity = Math.max(metric.monthQuantity, metric.monthKg, 0);
  const remaining = Math.max(inventoryRow?.remainingQuantity || 0, inventoryRow?.remainingKg || 0, 0);
  if (monthlyQuantity > 0 && remaining / monthlyQuantity > 0.35) margin -= 1.5;
  if (monthlyQuantity > 50 || metric.monthRevenue > 5000000) margin += 1;
  if (inputTrendPercent > 8 && remaining > monthlyQuantity * 0.3) margin -= 1.5;
  if (inputTrendPercent < -5) margin += 1.5;
  return clamp(margin, min, max);
};

export const buildPricingEngineSnapshot = ({
  currentCompany = {},
  products = [],
  customers = [],
  orders = [],
  orderRequests = [],
  warehouseImports = [],
  warehouseDispatches = [],
  warehouseStockCounts = [],
  expenses = [],
  assets = [],
  assetCostLogs = [],
  pricingInputs = [],
  pricingRules = [],
  pricingScenarios = [],
  date = new Date(),
} = {}) => {
  const rules = normalizeRules(pricingRules?.[0] || {});
  const inputRows = buildInputMetrics({ pricingInputs, warehouseImports, today: date });
  const inputCost = inputRows.reduce((sum, item) => sum + toNumber(item.amount, 0), 0);
  const totalKg = inputRows.reduce((sum, item) => sum + toNumber(item.totalKg, 0), 0);
  const totalQuantity = inputRows.reduce((sum, item) => sum + toNumber(item.quantity, 0), 0);
  const costBuckets = buildCostBuckets({ expenses, assets, assetCostLogs, today: date, rules });
  const allocatedCost = Object.values(costBuckets).reduce((sum, value) => sum + toNumber(value, 0), 0);
  const totalCost = inputCost + allocatedCost;
  const lossSummary = calculateLossSummary(rules);
  const effectiveKg = totalKg * Math.max(lossSummary.outputRatio, 0.01);
  const costPerKg = effectiveKg > 0 ? totalCost / effectiveKg : 0;
  const costPerUnit = totalQuantity > 0 ? totalCost / totalQuantity : 0;
  const latestInputCost = buildLatestInputCostBasis({
    inputRows,
    lossSummary,
    allocatedCost,
    effectiveKg,
    totalQuantity,
  });
  const pricingCostPerKg = latestInputCost.global?.costPerKg || costPerKg;
  const pricingCostPerUnit = latestInputCost.global?.costPerUnit || costPerUnit;
  const inventoryRows = buildInventoryRows({ inputRows, warehouseDispatches, warehouseStockCounts });
  const salesRows = buildSalesMetrics({ orders, products, today: date });
  const thisMonth = monthKey(date);
  const monthlyRevenue = salesRows.reduce((sum, item) => sum + item.monthRevenue, 0);
  const monthlyProfit = monthlyRevenue - totalCost;
  const grossMarginPercent = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0;
  const previousInputs = inputRows
    .slice()
    .sort((a, b) => (getDateValue(a.date)?.getTime() || 0) - (getDateValue(b.date)?.getTime() || 0));
  const firstInputPrice = previousInputs[0]?.amount && previousInputs[0]?.totalKg
    ? previousInputs[0].amount / previousInputs[0].totalKg
    : 0;
  const latestInputPrice = previousInputs[previousInputs.length - 1]?.amount && previousInputs[previousInputs.length - 1]?.totalKg
    ? previousInputs[previousInputs.length - 1].amount / previousInputs[previousInputs.length - 1].totalKg
    : firstInputPrice;
  const inputTrendPercent = firstInputPrice > 0 ? ((latestInputPrice - firstInputPrice) / firstInputPrice) * 100 : 0;

  const inventoryByGroup = new Map(inventoryRows.map((row) => [normalizeText(row.groupName), row]));
  const priceSuggestions = salesRows.map((metric) => {
    const inventoryRow = inventoryByGroup.get(normalizeText(metric.groupName)) || inventoryByGroup.get(normalizeText(metric.productName));
    const unitText = normalizeText(metric.unit);
    const latestGroupInput =
      latestInputCost.byGroup.get(normalizeText(metric.groupName)) ||
      latestInputCost.byGroup.get(normalizeText(metric.productName)) ||
      latestInputCost.global;
    const useKgBasis = unitText.includes('kg') || metric.monthKg > metric.monthQuantity;
    const costBase = useKgBasis
      ? latestGroupInput?.costPerKg || pricingCostPerKg || costPerKg
      : latestGroupInput?.costPerUnit ||
        pricingCostPerUnit ||
        costPerUnit ||
        latestGroupInput?.costPerKg ||
        pricingCostPerKg ||
        costPerKg;
    const suggestedMargin = getSuggestedMargin({ rules, metric, inventoryRow, inputTrendPercent });
    const suggestedPrice = costBase > 0 ? costBase * (1 + suggestedMargin / 100) : metric.currentPrice;
    const currentPrice = metric.currentPrice || (metric.monthQuantity || metric.monthKg ? metric.monthRevenue / Math.max(metric.monthKg || metric.monthQuantity, 1) : 0);
    const profit = metric.monthRevenue - costBase * Math.max(metric.monthKg || metric.monthQuantity, 0);
    const riskLevel = profit < 0 ? 'danger' : suggestedMargin < rules.targetMargin ? 'warning' : 'good';
    const latestInputText = latestGroupInput?.date
      ? `Theo lô nhập mới nhất ${dateKey(latestGroupInput.date)}${latestGroupInput.groupName ? ` (${latestGroupInput.groupName})` : ''}`
      : '';
    const reason = [
      latestInputText,
      inputTrendPercent > 5 ? 'Giá đầu vào đang tăng' : '',
      inventoryRow && (inventoryRow.remainingKg > 0 || inventoryRow.remainingQuantity > 0) ? 'Có tồn cần cân đối tốc độ bán' : '',
      metric.monthRevenue > 0 ? 'Có dữ liệu bán trong tháng' : '',
    ].filter(Boolean).join(' • ') || 'Dựa trên giá vốn và biên lợi nhuận mục tiêu';
    return {
      ...metric,
      costBase,
      currentPrice,
      suggestedMargin,
      suggestedPrice,
      profit,
      riskLevel,
      reason,
      pricingBasis: latestGroupInput ? 'latest_input' : 'monthly_average',
      latestInputDate: latestGroupInput?.date || null,
      latestInputGroupName: latestGroupInput?.groupName || '',
      latestInputRawPrice: useKgBasis ? latestGroupInput?.rawKgPrice || 0 : latestGroupInput?.rawUnitPrice || 0,
    };
  }).sort((a, b) => b.monthRevenue - a.monthRevenue);

  const partCostRows = (rules.cutParts || []).map((part) => {
    const ratio = toNumber(part.ratioPercent, 0);
    const valueFactor = toNumber(part.valueFactor, 1);
    const lossPercent = toNumber(part.lossPercent, 0);
    const costPrice = pricingCostPerKg * Math.max(1 + lossPercent / 100, 0.01) * Math.max(valueFactor, 0.01);
    const suggestedPrice = costPrice * (1 + rules.targetMargin / 100);
    return {
      ...part,
      ratioPercent: ratio,
      valueFactor,
      lossPercent,
      costPrice,
      suggestedPrice,
      marginPercent: rules.targetMargin,
    };
  });

  const customerPriceSuggestions = customers.slice(0, 20).map((customer) => {
    const defaultMargin = toNumber(customer.defaultMargin ?? customer.marginPercent, rules.targetMargin);
    const minMargin = toNumber(customer.minMargin ?? customer.minimumMargin, rules.minMargin);
    const credibility = toNumber(customer.creditScore ?? customer.reputationScore, 80);
    const debt = toNumber(customer.debt ?? customer.totalDebt ?? customer.currentDebt, 0);
    const adjustedMargin = clamp(defaultMargin + (debt > 0 ? 1 : 0) - (credibility > 90 ? 0.5 : 0), minMargin, rules.maxMargin);
    return {
      customerId: customer.id,
      customerName: customer.name || customer.customerName || 'Khách hàng',
      defaultMargin,
      minMargin,
      adjustedMargin,
      debt,
      note: debt > 0 ? 'Có công nợ, nên giữ biên an toàn' : 'Có thể áp dụng biên theo lịch sử mua',
    };
  });

  const warnings = [];
  if (grossMarginPercent < rules.minMargin && monthlyRevenue > 0) {
    warnings.push({
      level: 'danger',
      title: 'Biên lợi nhuận thấp',
      message: `Biên gộp tháng đang khoảng ${grossMarginPercent.toFixed(1)}%, thấp hơn mức tối thiểu ${rules.minMargin}%.`,
    });
  }
  inventoryRows
    .filter((row) => row.remainingKg > 0 || row.remainingQuantity > 0)
    .slice(0, 4)
    .forEach((row) => {
      warnings.push({
        level: 'warning',
        title: `Tồn ${row.groupName}`,
        message: `Còn khoảng ${Math.max(row.remainingQuantity, 0).toFixed(0)} con/cái và ${Math.max(row.remainingKg, 0).toFixed(1)}kg cần theo dõi.`,
      });
    });
  if (inputTrendPercent > 8) {
    warnings.push({
      level: 'warning',
      title: 'Giá đầu vào tăng',
      message: `Giá đầu vào tăng khoảng ${inputTrendPercent.toFixed(1)}% trong dữ liệu tháng này.`,
    });
  }

  const bestProduct = priceSuggestions[0];
  const bestProfitProduct = priceSuggestions.slice().sort((a, b) => b.profit - a.profit)[0];
  const insights = [
    latestInputCost.global
      ? `Giá bán đang bám lô nhập mới nhất: ${latestInputCost.global.groupName || 'Nguyên liệu'} ngày ${dateKey(latestInputCost.global.date)}, giá nhập ${Math.round(latestInputCost.global.rawKgPrice || latestInputCost.global.rawUnitPrice || 0).toLocaleString('vi-VN')} đ.`
      : '',
    totalCost > 0 ? `Giá vốn bình quân đang khoảng ${Math.round(costPerKg).toLocaleString('vi-VN')} đ/kg và ${Math.round(costPerUnit).toLocaleString('vi-VN')} đ/con.` : 'Chưa có đủ giá đầu vào để tính giá vốn tự động.',
    bestProduct ? `${bestProduct.productName} đang tạo doanh thu cao nhất tháng: ${Math.round(bestProduct.monthRevenue).toLocaleString('vi-VN')} đ.` : 'Chưa có dữ liệu bán hàng trong tháng để xếp hạng sản phẩm.',
    bestProfitProduct ? `${bestProfitProduct.productName} đang có lợi nhuận ước tính cao nhất: ${Math.round(bestProfitProduct.profit).toLocaleString('vi-VN')} đ.` : '',
    inputTrendPercent !== 0 ? `Xu hướng giá đầu vào thay đổi khoảng ${inputTrendPercent.toFixed(1)}%, cần cân đối lại giá bán theo tồn kho và sức mua.` : '',
  ].filter(Boolean);

  const recommendations = priceSuggestions.slice(0, 5).map((item) => ({
    productName: item.productName,
    title: item.suggestedPrice > item.currentPrice ? 'Có thể tăng giá nhẹ' : 'Theo dõi giá bán',
    message: `${item.productName}: đề xuất ${Math.round(item.suggestedPrice).toLocaleString('vi-VN')} đ, biên ${item.suggestedMargin.toFixed(1)}%. ${item.reason}`,
    impact: Math.max(item.suggestedPrice - item.currentPrice, 0) * Math.max(item.monthKg || item.monthQuantity, 0),
  }));

  const backtestSummary = {
    period: '30-90 ngày',
    currentRevenue: monthlyRevenue,
    currentProfit: monthlyProfit,
    simulatedProfit:
      priceSuggestions.reduce((sum, item) => {
        const basis = Math.max(item.monthKg || item.monthQuantity, 0);
        return sum + (item.suggestedPrice - item.costBase) * basis;
      }, 0) || monthlyProfit,
  };

  return {
    companyName: currentCompany?.name || currentCompany?.companyName || '',
    rules,
    inputRows,
    inventoryRows,
    salesRows,
    lossSummary,
    costBuckets,
    partCostRows,
    priceSuggestions,
    customerPriceSuggestions,
    warnings,
    insights,
    recommendations,
    pricingScenarios,
    backtestSummary,
    totals: {
      inputCost,
      allocatedCost,
      totalCost,
      totalKg,
      effectiveKg,
      totalQuantity,
      costPerKg,
      costPerUnit,
      pricingCostPerKg,
      pricingCostPerUnit,
      latestInputRawKgPrice: latestInputCost.global?.rawKgPrice || 0,
      latestInputRawUnitPrice: latestInputCost.global?.rawUnitPrice || 0,
      latestInputDate: latestInputCost.global?.date || null,
      latestInputGroupName: latestInputCost.global?.groupName || '',
      monthlyRevenue,
      monthlyProfit,
      grossMarginPercent,
      inputTrendPercent,
      monthKey: thisMonth,
    },
  };
};

export default buildPricingEngineSnapshot;
