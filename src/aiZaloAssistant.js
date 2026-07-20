export const AI_ZALO_ASSISTANT_SYSTEM_PROMPT = `
Bạn là AI Zalo Assistant của HD Manager, trợ lý chăm sóc khách hàng cho công ty đầu mối gia cầm.

Vai trò:
- Trả lời lịch sự, ngắn gọn, thân thiện, giống nhân viên bán hàng Việt Nam.
- Chỉ trả lời dựa trên dữ liệu HD Manager cung cấp.
- Không bịa giá, không bịa hàng tồn, không bịa công nợ, không tự cam kết giao hàng.
- Nếu không chắc chắn hoặc thiếu dữ liệu, trả về need_human.

Luật an toàn:
- Khách hỏi giá: chỉ trả lời theo bảng giá mới nhất trong HD Manager.
- Khách hỏi QR/thanh toán: chỉ gửi link/QR của đơn chưa thanh toán gần nhất.
- Khách đặt hàng: chỉ ghi nhận ý định và báo nhân viên xác nhận, không tự tạo đơn nếu chưa có rule riêng.
- Khách phàn nàn, xin giảm giá, đổi hàng, thiếu hàng, sai tiền: không tự xử lý, chuyển need_human.
- AI không được tự xóa nợ, giảm nợ, hứa giảm giá, xử lý khiếu nại hoặc xác nhận đơn mơ hồ.

Output bắt buộc là JSON:
{
  "intent": "...",
  "confidence": 0.0,
  "autoReplyAllowed": true,
  "replyText": "...",
  "reason": "..."
}
`.trim();

export const AI_ZALO_OUTPUT_SCHEMA = {
  intent: 'ask_price | ask_stock | place_order | ask_debt | ask_payment_qr | confirm_received | complaint | negotiate_price | change_order | unknown',
  confidence: 'number từ 0.0 đến 1.0',
  autoReplyAllowed: 'boolean',
  replyText: 'string',
  reason: 'string'
};

export const AI_ZALO_INTENTS = [
  'ask_price',
  'ask_stock',
  'place_order',
  'ask_debt',
  'ask_payment_qr',
  'confirm_received',
  'complaint',
  'negotiate_price',
  'change_order',
  'unknown'
];

export const AI_ZALO_AUTO_REPLY_INTENTS = new Set(['ask_price', 'ask_stock', 'ask_payment_qr', 'confirm_received']);
export const AI_ZALO_HUMAN_ONLY_INTENTS = new Set(['complaint', 'negotiate_price', 'change_order', 'ask_debt', 'place_order', 'unknown']);

export const AI_ZALO_DEFAULT_REPLY_RULES = {
  ask_price: { minConfidence: 0.82, autoReplyAllowed: true, requireHumanApproval: false },
  ask_stock: { minConfidence: 0.82, autoReplyAllowed: true, requireHumanApproval: false },
  ask_payment_qr: { minConfidence: 0.84, autoReplyAllowed: true, requireHumanApproval: false },
  confirm_received: { minConfidence: 0.78, autoReplyAllowed: true, requireHumanApproval: false },
  place_order: { minConfidence: 1, autoReplyAllowed: false, requireHumanApproval: true },
  ask_debt: { minConfidence: 1, autoReplyAllowed: false, requireHumanApproval: true },
  complaint: { minConfidence: 1, autoReplyAllowed: false, requireHumanApproval: true },
  negotiate_price: { minConfidence: 1, autoReplyAllowed: false, requireHumanApproval: true },
  change_order: { minConfidence: 1, autoReplyAllowed: false, requireHumanApproval: true },
  unknown: { minConfidence: 1, autoReplyAllowed: false, requireHumanApproval: true }
};

export function normalizeAiZaloText(value = '') {
  return `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text, values = []) {
  return values.some(value => text.includes(normalizeAiZaloText(value)));
}

function safeNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const parsed = parseFloat(`${value || ''}`.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatVnd(value) {
  const number = Math.round(safeNumber(value, 0));
  return number.toLocaleString('vi-VN');
}

function clampConfidence(value) {
  const number = safeNumber(value, 0);
  return Math.max(0, Math.min(1, Number(number.toFixed(2))));
}

export function classifyAiZaloIntent(messageText = '') {
  const text = normalizeAiZaloText(messageText);
  if (!text) return { intent: 'unknown', confidence: 0.2 };

  if (hasAny(text, [
    'khieu nai', 'phan nan', 'giao thieu', 'thieu hang', 'sai hang', 'sai tien',
    'hang loi', 'hang hong', 'bi hong', 'bi chet', 'chet', 'thieu', 'tra hang'
  ])) return { intent: 'complaint', confidence: 0.94 };

  if (hasAny(text, ['bot gia', 'giam gia', 'xin giam', 'mac qua', 're hon', 'gia tot', 'lay re'])) {
    return { intent: 'negotiate_price', confidence: 0.91 };
  }

  if (hasAny(text, ['doi don', 'sua don', 'huy don', 'doi hang', 'them don', 'bot don', 'giam so luong', 'doi lai'])) {
    return { intent: 'change_order', confidence: 0.89 };
  }

  if (hasAny(text, ['cong no', 'con no', 'no anh', 'no chi', 'no em', 'no bao nhieu', 'con thieu bao nhieu', 'no con bao nhieu'])) {
    return { intent: 'ask_debt', confidence: 0.91 };
  }

  if (hasAny(text, ['ma qr', 'gui qr', 'qr', 'stk', 'so tai khoan', 'chuyen khoan', 'thanh toan', 'ma thanh toan'])) {
    return { intent: 'ask_payment_qr', confidence: 0.88 };
  }

  if (hasAny(text, ['da nhan', 'nhan hang roi', 'nhan duoc roi', 'da lay', 'ok roi', 'du hang', 'cam on'])) {
    return { intent: 'confirm_received', confidence: 0.83 };
  }

  if (
    hasAny(text, ['con hang', 'con khong', 'co hang', 'het hang', 'ton kho', 'con ban', 'hom nay con']) ||
    (text.includes('con ') && text.includes(' khong')) ||
    (text.includes('co ') && text.includes(' khong'))
  ) {
    return { intent: 'ask_stock', confidence: 0.84 };
  }

  if (hasAny(text, ['bao gia', 'gia', 'bao nhieu', 'bao nhieu tien', 'don gia', 'gia sao', 'hom nay'])) {
    return { intent: 'ask_price', confidence: 0.85 };
  }

  if (hasAny(text, ['dat', 'lay', 'mua', 'giao cho', 'cho anh', 'cho chi', 'cho em', 'mai cho', 'chieu cho', 'sang cho'])) {
    return { intent: 'place_order', confidence: 0.78 };
  }

  return { intent: 'unknown', confidence: 0.35 };
}

export function buildAiZaloGuardrailResponse({
  messageText = '',
  customerName = 'Quý khách',
  companyName = 'HD Manager',
  senderName = 'nhân viên phụ trách',
  product = null,
  price = null,
  stock = null,
  unpaidPayment = null,
  intent: forcedIntent = '',
  confidence: forcedConfidence = null,
  rule = null
} = {}) {
  const classifier = forcedIntent
    ? { intent: forcedIntent, confidence: clampConfidence(forcedConfidence ?? 0.8) }
    : classifyAiZaloIntent(messageText);
  const intent = AI_ZALO_INTENTS.includes(classifier.intent) ? classifier.intent : 'unknown';
  const confidence = clampConfidence(classifier.confidence);
  const minConfidence = clampConfidence(rule?.minConfidence ?? AI_ZALO_DEFAULT_REPLY_RULES[intent]?.minConfidence ?? 1);
  const ruleAllowsAuto = rule
    ? rule.enabled !== false && rule.autoReplyAllowed !== false && rule.requireHumanApproval !== true
    : AI_ZALO_DEFAULT_REPLY_RULES[intent]?.autoReplyAllowed === true;
  const name = customerName || 'Quý khách';
  const productName = product?.compactName || product?.shortName || product?.name || '';
  const productUnit = product?.unit || 'đơn vị';
  const productPrice = safeNumber(price ?? product?.price, 0);
  const productStock = stock === null || stock === undefined || stock === '' ? null : safeNumber(stock, NaN);

  const deny = (replyText, reason) => ({
    intent,
    confidence,
    autoReplyAllowed: false,
    replyText,
    reason
  });

  const allow = (replyText, reason) => ({
    intent,
    confidence,
    autoReplyAllowed: Boolean(
      AI_ZALO_AUTO_REPLY_INTENTS.has(intent) &&
      !AI_ZALO_HUMAN_ONLY_INTENTS.has(intent) &&
      ruleAllowsAuto &&
      confidence >= minConfidence
    ),
    replyText,
    reason
  });

  if (intent === 'ask_price') {
    if (!productName || productPrice <= 0) {
      return deny(
        'Khách đang hỏi giá. Vui lòng kiểm tra bảng giá mới nhất trong HD Manager trước khi trả lời.',
        'Thiếu sản phẩm hoặc chưa có bảng giá mới nhất trong HD Manager.'
      );
    }
    return allow(
      `Dạ ${name}, ${productName} hôm nay là ${formatVnd(productPrice)} đ/${productUnit}. Nếu cần đặt hàng, anh/chị nhắn số lượng giúp em nhé.`,
      `Trả lời theo bảng giá mới nhất của ${companyName}.`
    );
  }

  if (intent === 'ask_stock') {
    if (!productName || productStock === null || !Number.isFinite(productStock)) {
      return deny(
        'Khách đang hỏi còn hàng. Vui lòng kiểm tra tồn kho trong HD Manager trước khi trả lời.',
        'Thiếu sản phẩm hoặc chưa có dữ liệu tồn kho/còn hàng.'
      );
    }
    const replyText = productStock > 0
      ? `Dạ ${name}, hệ thống đang ghi nhận còn ${formatVnd(productStock)} ${productUnit} ${productName}. Anh/chị cần đặt bao nhiêu nhắn lại giúp em nhé.`
      : `Dạ ${name}, hệ thống đang ghi nhận ${productName} chưa còn tồn. Em sẽ báo nhân viên kiểm tra lại ngay.`;
    return allow(replyText, 'Trả lời dựa trên dữ liệu tồn kho HD Manager cung cấp.');
  }

  if (intent === 'ask_payment_qr') {
    const orderCode = unpaidPayment?.orderCode || unpaidPayment?.code || '';
    const hasPayosPayment = `${unpaidPayment?.paymentProvider || ''}`.toLowerCase() === 'payos'
      || Boolean(unpaidPayment?.paymentLinkId || unpaidPayment?.payosOrderCode || unpaidPayment?.checkoutUrl);
    const paymentLink = hasPayosPayment
      ? (unpaidPayment?.checkoutUrl || unpaidPayment?.link || '')
      : '';
    if (!orderCode || !paymentLink) {
      return deny(
        'Khách đang xin mã QR/thanh toán. Vui lòng kiểm tra đơn chưa thanh toán gần nhất trước khi gửi.',
        'Không có đơn chưa thanh toán gần nhất kèm link/QR thanh toán.'
      );
    }
    return allow(
      [`Dạ ${name}, mã thanh toán của đơn ${orderCode}:`, paymentLink, `Nội dung chuyển khoản: ${orderCode}`].join('\n'),
      'Chỉ gửi link/QR của đơn chưa thanh toán gần nhất.'
    );
  }

  if (intent === 'confirm_received') {
    return allow(
      `Dạ ${name}, em cảm ơn anh/chị đã xác nhận nhận hàng. Nếu có vấn đề gì, anh/chị báo lại để bên em xử lý ngay nhé.`,
      'Xác nhận nhận hàng là tình huống đơn giản, không thay đổi dữ liệu nhạy cảm.'
    );
  }

  if (intent === 'place_order') {
    return deny(
      `Dạ ${name}, em đã ghi nhận ý định đặt hàng của anh/chị và sẽ báo nhân viên phụ trách xác nhận lại trước khi lên đơn.`,
      'Khách đặt hàng cần nhân viên xác nhận, AI không tự tạo đơn.'
    );
  }

  if (intent === 'ask_debt') {
    return deny(
      'Khách đang hỏi công nợ. Vui lòng để nhân viên phụ trách kiểm tra và phản hồi.',
      'Công nợ là thông tin nhạy cảm, cần quyền và nhân viên duyệt trước khi gửi.'
    );
  }

  if (intent === 'complaint') {
    return deny(
      'Khách đang phản ánh/khiếu nại. Vui lòng chuyển nhân viên xử lý trực tiếp.',
      'Khiếu nại, thiếu hàng, sai tiền hoặc hàng lỗi không được AI tự xử lý.'
    );
  }

  if (intent === 'negotiate_price') {
    return deny(
      'Khách đang xin giảm giá. Vui lòng để nhân viên phụ trách duyệt trước khi phản hồi.',
      'AI không được tự cam kết giá mới hoặc giảm giá.'
    );
  }

  if (intent === 'change_order') {
    return deny(
      'Khách muốn đổi/sửa đơn. Vui lòng để nhân viên kiểm tra đơn trước khi phản hồi.',
      'Đổi đơn cần nhân viên xác nhận, AI không tự sửa đơn.'
    );
  }

  return deny(
    'Tin nhắn chưa đủ rõ. Vui lòng để nhân viên kiểm tra và trả lời.',
    'AI không đủ chắc chắn nên chuyển need_human.'
  );
}
