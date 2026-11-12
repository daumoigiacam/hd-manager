import { classifyAiZaloIntent, normalizeAiZaloText } from './aiZaloAssistant.js';

const NEED_HUMAN_PATTERNS = [
  'nhu hom qua',
  'nhu moi khi',
  'giong lan truoc',
  'tang them',
  'lay them it',
  'giao som',
  'co hang khong',
  'con hang khong',
  'gia cao',
  'sao hom nay gia'
];

const FILLER_WORDS = new Set([
  'anh', 'chi', 'em', 'co', 'chu',
  'cho', 'giup', 'lay', 'dat', 'mua', 'giao', 'gui',
  'mai', 'hom', 'nay', 'ngay', 'kia', 'sang', 'chieu', 'toi',
  'nhe', 'nha', 'a', 'di', 'duoc', 'khong', 'nhu', 'moi', 'khi'
]);

const UNIT_ALIASES = new Map([
  ['kg', 'kg'],
  ['kgs', 'kg'],
  ['kilogam', 'kg'],
  ['ki', 'kg'],
  ['ky', 'kg'],
  ['can', 'kg'],
  ['con', 'con'],
  ['cai', 'cái'],
  ['bo', 'bộ'],
  ['boc', 'bọc'],
  ['bao', 'bao'],
  ['thung', 'thùng'],
  ['ro', 'rổ'],
  ['tui', 'túi']
]);

function safeNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = parseFloat(`${value || ''}`.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampConfidence(value) {
  const number = safeNumber(value, 0);
  return Math.max(0, Math.min(1, Number(number.toFixed(2))));
}

function toIsoDateOnly(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeOrderUnit(unit = '') {
  const normalized = normalizeAiZaloText(unit).replace(/\s+/g, '');
  return UNIT_ALIASES.get(normalized) || unit || '';
}

function parseDeliveryDate(normalizedText = '', now = new Date()) {
  if (normalizedText.includes('ngay kia')) return toIsoDateOnly(addDays(now, 2));
  if (normalizedText.includes('mai')) return toIsoDateOnly(addDays(now, 1));
  if (normalizedText.includes('hom nay')) return toIsoDateOnly(now);
  const explicitDate = normalizedText.match(/\b(\d{1,2})\s*[\/.-]\s*(\d{1,2})(?:\s*[\/.-]\s*(\d{2,4}))?\b/);
  if (!explicitDate) return '';
  const day = parseInt(explicitDate[1], 10);
  const month = parseInt(explicitDate[2], 10);
  const rawYear = explicitDate[3] ? parseInt(explicitDate[3], 10) : now.getFullYear();
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return toIsoDateOnly(new Date(year, month - 1, day));
}

function extractQuantities(normalizedText = '') {
  const quantityRegex = /(\d+(?:[.,]\d+)?)\s*(kg|kgs|kilogam|ki|ky|can|con|cai|bo|boc|bao|thung|ro|tui)\b/g;
  const matches = [];
  let match = quantityRegex.exec(normalizedText);
  while (match) {
    const quantity = safeNumber(match[1], 0);
    const unit = normalizeOrderUnit(match[2]);
    if (quantity > 0 && unit) {
      matches.push({ quantity, unit, raw: match[0], index: match.index });
    }
    match = quantityRegex.exec(normalizedText);
  }
  return matches;
}

function getProductLookupLabels(product = {}) {
  const labels = [
    product.name,
    product.shortName,
    product.shortCode,
    product.compactName,
    product.sku,
    product.code,
    product.category,
    product.groupName,
    product.productGroup,
    ...(Array.isArray(product.aliases) ? product.aliases : [])
  ];
  return [...new Set(labels.map(label => `${label || ''}`.trim()).filter(Boolean))];
}

function scoreProductMatch(normalizedText = '', product = {}) {
  const compactText = normalizedText.replace(/\s+/g, '');
  let bestScore = 0;
  let bestLabel = '';
  getProductLookupLabels(product).forEach((label) => {
    const normalizedLabel = normalizeAiZaloText(label);
    if (!normalizedLabel) return;
    const compactLabel = normalizedLabel.replace(/\s+/g, '');
    if (compactLabel.length < 2) return;
    const labelTokens = normalizedLabel.split(' ').filter(token => token && !FILLER_WORDS.has(token));
    let score = 0;
    if (normalizedText === normalizedLabel || compactText === compactLabel) score += 80;
    if (normalizedText.includes(normalizedLabel)) score += 45 + labelTokens.length * 6;
    if (compactLabel.length >= 2 && compactText.includes(compactLabel)) score += 35 + Math.min(compactLabel.length, 20);
    const tokenMatches = labelTokens.filter(token => normalizedText.includes(token)).length;
    if (labelTokens.length > 0 && tokenMatches === labelTokens.length) score += 18 + tokenMatches * 8;
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  });
  return { score: bestScore, label: bestLabel };
}

function findProduct(normalizedText = '', products = []) {
  const candidates = (products || [])
    .filter(product => product && !product.isArchived)
    .map(product => ({ product, ...scoreProductMatch(normalizedText, product) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
  if (candidates.length === 0) {
    return { product: null, confidenceBoost: 0, reason: 'Không khớp sản phẩm nào trong danh mục HD Manager.' };
  }
  const [top, second] = candidates;
  if (second && top.score < 58 && (top.score - second.score) < 12) {
    return { product: null, confidenceBoost: 0, reason: `Sản phẩm chưa đủ chắc: ${top.product?.name || top.label} / ${second.product?.name || second.label}.` };
  }
  return {
    product: top.product,
    confidenceBoost: top.score >= 70 ? 0.16 : top.score >= 45 ? 0.11 : 0.06,
    reason: ''
  };
}

function formatQuantity(quantity) {
  const value = safeNumber(quantity, 0);
  if (!value) return '0';
  return Number.isInteger(value) ? `${value}` : `${value}`.replace('.', ',');
}

function buildSummary(items = [], requestedDeliveryDate = '') {
  const itemText = items.map(item => `${formatQuantity(item.quantity)} ${item.unit} ${item.productName}`.trim()).join(', ');
  return `Khách đặt ${itemText}${requestedDeliveryDate ? ` giao ngày ${requestedDeliveryDate}` : ''}`;
}

function buildAcceptedReply(items = []) {
  const itemLines = items.map(item => `${formatQuantity(item.quantity)}${item.unit === 'kg' ? 'kg' : ` ${item.unit}`} ${item.productName}`);
  return [
    'Dạ em đã ghi nhận yêu cầu:',
    '',
    ...itemLines,
    '',
    'Nhân viên kinh doanh sẽ xác nhận đơn trong ít phút nữa ạ.'
  ].join('\n');
}

export function extractZaloOrderRequest({
  messageText = '',
  products = [],
  now = new Date(),
  confidenceThreshold = 0.8
} = {}) {
  const normalizedText = normalizeAiZaloText(messageText);
  const classifier = classifyAiZaloIntent(messageText);
  const baseIntent = classifier.intent || 'unknown';
  const requestedDeliveryDate = parseDeliveryDate(normalizedText, now);

  const fail = (overrides = {}) => ({
    shouldCreateRequest: false,
    status: 'need_human',
    aiIntent: baseIntent,
    aiConfidence: clampConfidence(overrides.aiConfidence ?? classifier.confidence ?? 0.3),
    items: [],
    requestedDeliveryDate,
    aiSummary: overrides.aiSummary || 'Tin nhắn cần nhân viên kiểm tra.',
    aiReplyText: '',
    reason: overrides.reason || 'Không đủ điều kiện tự tạo Order Request.',
    extractedData: overrides.extractedData || {}
  });

  if (!normalizedText) return fail({ aiIntent: 'unknown', aiConfidence: 0.2, reason: 'Không có nội dung tin nhắn.' });
  if (NEED_HUMAN_PATTERNS.some(pattern => normalizedText.includes(pattern))) {
    return fail({
      aiConfidence: Math.min(0.79, clampConfidence(classifier.confidence || 0.6)),
      aiSummary: 'Tin nhắn đặt hàng chưa đủ rõ, cần nhân viên xác nhận.',
      reason: 'Tin nhắn dùng cụm mơ hồ hoặc cần người duyệt.'
    });
  }
  const preliminaryQuantities = extractQuantities(normalizedText);
  const hasOrderVerb = ['dat', 'lay', 'mua', 'giao', 'gui', 'cho anh', 'cho chi', 'cho em', 'mai giao'].some(token => normalizedText.includes(token));
  if (baseIntent !== 'place_order' && !(preliminaryQuantities.length > 0 && hasOrderVerb)) {
    return fail({ reason: 'Intent không phải place_order.', aiSummary: 'Tin nhắn không phải yêu cầu đặt hàng rõ ràng.' });
  }

  const quantityMatches = preliminaryQuantities;
  if (quantityMatches.length === 0) {
    return fail({
      aiConfidence: Math.min(0.79, clampConfidence(classifier.confidence)),
      aiSummary: 'Khách có ý định đặt hàng nhưng thiếu số lượng/đơn vị rõ ràng.',
      reason: 'Không trích xuất được số lượng và đơn vị.'
    });
  }

  const productMatch = findProduct(normalizedText, products);
  if (!productMatch.product) {
    return fail({
      aiConfidence: Math.min(0.79, clampConfidence((classifier.confidence || 0) + 0.08)),
      aiSummary: 'Khách có ý định đặt hàng nhưng sản phẩm chưa khớp danh mục.',
      reason: productMatch.reason || 'Không xác định được sản phẩm trong danh mục.',
      extractedData: { quantityMatches }
    });
  }

  const firstQuantity = quantityMatches[0];
  const productName = productMatch.product.name || productMatch.product.shortName || productMatch.product.shortCode || '';
  const aiConfidence = clampConfidence((classifier.confidence || 0) + 0.12 + productMatch.confidenceBoost + 0.06);
  const items = [{
    productId: productMatch.product.id || '',
    productName,
    quantity: firstQuantity.quantity,
    unit: firstQuantity.unit
  }];
  const shouldCreateRequest = aiConfidence >= confidenceThreshold;

  return {
    shouldCreateRequest,
    status: shouldCreateRequest ? 'new' : 'need_human',
    aiIntent: 'place_order',
    aiConfidence,
    items,
    requestedDeliveryDate,
    aiSummary: buildSummary(items, requestedDeliveryDate),
    aiReplyText: shouldCreateRequest ? buildAcceptedReply(items) : '',
    reason: shouldCreateRequest ? 'Đủ sản phẩm, số lượng, đơn vị và độ tin cậy.' : 'Độ tin cậy thấp hơn ngưỡng tự tạo.',
    extractedData: {
      quantityMatches,
      productId: productMatch.product.id || '',
      productName,
      matchedProductLabel: productMatch.product.shortName || productMatch.product.shortCode || productName
    }
  };
}
