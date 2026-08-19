const SEPAY_TRANSACTIONS_API_URL = 'https://userapi.sepay.vn/v2/transactions';
const SEPAY_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const parseMoney = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const normalized = `${value ?? ''}`.replace(/[^\d.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
};

const toPositiveInteger = (value, fallback, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maximum);
};

const formatSepayDateTime = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEPAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(safeDate).reduce((result, part) => ({
    ...result,
    [part.type]: part.value
  }), {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
};

const normalizeSepayTransaction = (transaction = {}) => {
  const amountIn = parseMoney(transaction.amount_in ?? transaction.amountIn ?? transaction.transfer_amount ?? transaction.transferAmount);
  const amountOut = parseMoney(transaction.amount_out ?? transaction.amountOut);
  const explicitTransferType = `${transaction.transfer_type ?? transaction.transferType ?? transaction.type ?? ''}`.trim().toLowerCase();
  const transferType = explicitTransferType || (amountIn > 0 ? 'in' : (amountOut > 0 ? 'out' : ''));
  const transferAmount = amountIn > 0
    ? amountIn
    : (transferType === 'in' ? parseMoney(transaction.amount ?? transaction.transferAmount) : 0);

  return {
    id: `${transaction.id ?? transaction.transaction_id ?? transaction.transactionId ?? ''}`.trim(),
    referenceCode: `${transaction.reference_number ?? transaction.referenceNumber ?? transaction.reference_code ?? transaction.referenceCode ?? ''}`.trim(),
    gateway: `${transaction.bank_brand_name ?? transaction.gateway ?? transaction.bankName ?? ''}`.trim(),
    transactionDate: `${transaction.transaction_date ?? transaction.transactionDate ?? transaction.created_at ?? transaction.createdAt ?? ''}`.trim(),
    accountNumber: `${transaction.account_number ?? transaction.accountNumber ?? ''}`.trim(),
    subAccount: `${transaction.va ?? transaction.sub_account ?? transaction.subAccount ?? ''}`.trim(),
    code: `${transaction.code ?? ''}`.trim(),
    content: `${transaction.transaction_content ?? transaction.transactionContent ?? transaction.content ?? transaction.description ?? ''}`.trim(),
    transferType,
    transferAmount,
    amountIn,
    amountOut,
    raw: transaction
  };
};

const getTransactionList = (payload = {}) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.transactions)) return payload.transactions;
  if (Array.isArray(payload?.data?.transactions)) return payload.data.transactions;
  return [];
};

const getTotalPages = (payload = {}) => {
  const pagination = payload?.pagination || payload?.meta?.pagination || payload?.meta || payload?.data?.pagination || {};
  return toPositiveInteger(
    pagination.total_pages ?? pagination.totalPages ?? pagination.last_page ?? pagination.lastPage,
    1
  );
};

const buildSepayTransactionsUrl = ({
  apiUrl = SEPAY_TRANSACTIONS_API_URL,
  from,
  to,
  page = 1,
  perPage = 100,
  bankAccountId = '',
  sinceId = ''
} = {}) => {
  const url = new URL(apiUrl);
  if (from) url.searchParams.set('transaction_date_from', from);
  if (to) url.searchParams.set('transaction_date_to', to);
  if (bankAccountId) url.searchParams.set('bank_account_id', bankAccountId);
  if (sinceId) url.searchParams.set('since_id', sinceId);
  url.searchParams.set('per_page', `${toPositiveInteger(perPage, 100, 100)}`);
  url.searchParams.set('page', `${toPositiveInteger(page, 1)}`);
  return url.toString();
};

const readJsonResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

const fetchSepayTransactions = async ({
  apiToken,
  fetchImpl = global.fetch,
  now = new Date(),
  lookbackMinutes = 24 * 60,
  maxPages = 10,
  perPage = 100,
  bankAccountId = '',
  sinceId = '',
  apiUrl = SEPAY_TRANSACTIONS_API_URL,
  wait = async () => {}
} = {}) => {
  const token = `${apiToken || ''}`.trim();
  if (!token) {
    const error = new Error('Thieu cau hinh SEPAY_API_TOKEN cho doi soat giao dich.');
    error.code = 'sepay_api_token_missing';
    error.statusCode = 503;
    throw error;
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Khong co fetch de goi SePay Transaction API.');
  }

  const safeNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const safeLookbackMinutes = toPositiveInteger(lookbackMinutes, 24 * 60, 7 * 24 * 60);
  const from = formatSepayDateTime(new Date(safeNow.getTime() - (safeLookbackMinutes * 60 * 1000)));
  const to = formatSepayDateTime(safeNow);
  const safeMaxPages = toPositiveInteger(maxPages, 10, 50);
  const safePerPage = toPositiveInteger(perPage, 100, 100);
  const transactions = [];
  const identities = new Set();
  let pagesFetched = 0;
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, safeMaxPages); page += 1) {
    if (pagesFetched > 0) await wait(350);
    const response = await fetchImpl(buildSepayTransactionsUrl({
      apiUrl,
      from,
      to,
      page,
      perPage: safePerPage,
      bankAccountId,
      sinceId
    }), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      }
    });
    const payload = await readJsonResponse(response);
    if (!response?.ok) {
      const error = new Error(`${payload?.message || payload?.error || `SePay Transaction API tra ve HTTP ${response?.status || 500}`}`);
      error.code = 'sepay_transaction_api_error';
      error.statusCode = Number(response?.status || 502);
      throw error;
    }

    pagesFetched += 1;
    totalPages = Math.max(1, getTotalPages(payload));
    const pageTransactions = getTransactionList(payload).map(normalizeSepayTransaction);
    for (const transaction of pageTransactions) {
      const identity = transaction.id || transaction.referenceCode;
      if (!identity || identities.has(identity)) continue;
      identities.add(identity);
      transactions.push(transaction);
    }

    if (pageTransactions.length < safePerPage && totalPages <= page) break;
  }

  return { transactions, pagesFetched, from, to };
};

const normalizeOrderCode = (value = '') => `${value || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');

// The visible code of older invoices is derived from the document id, so it has no Firestore field to query directly.
const createLegacyOrderLookup = ({
  fetchPage,
  getOrderCodes,
  pageSize = 500
} = {}) => {
  if (typeof fetchPage !== 'function' || typeof getOrderCodes !== 'function') {
    throw new Error('Thieu phu thuoc tim don legacy.');
  }

  const safePageSize = toPositiveInteger(pageSize, 500, 1000);
  const orderByCode = new Map();
  let cursor = null;
  let cursorId = '';
  let exhausted = false;

  return async (codeTokens = []) => {
    const wantedCodes = [...new Set((Array.isArray(codeTokens) ? codeTokens : [codeTokens])
      .map(normalizeOrderCode)
      .filter(Boolean))];
    if (!wantedCodes.length) return null;

    const findIndexedOrder = () => wantedCodes.map(code => orderByCode.get(code)).find(Boolean) || null;
    const indexedOrder = findIndexedOrder();
    if (indexedOrder) return indexedOrder;

    while (!exhausted) {
      const page = await fetchPage(cursor);
      const docs = Array.isArray(page) ? page : [];
      if (!docs.length) {
        exhausted = true;
        break;
      }

      for (const doc of docs) {
        for (const code of getOrderCodes(doc) || []) {
          const normalizedCode = normalizeOrderCode(code);
          if (normalizedCode && !orderByCode.has(normalizedCode)) orderByCode.set(normalizedCode, doc);
        }
      }

      const nextCursor = docs[docs.length - 1];
      const nextCursorId = `${nextCursor?.id || ''}`;
      if (!nextCursor || (nextCursorId && nextCursorId === cursorId)) {
        throw new Error('Khong the tiep tuc phan trang don legacy.');
      }
      cursor = nextCursor;
      cursorId = nextCursorId;
      if (docs.length < safePageSize) exhausted = true;

      const matchedOrder = findIndexedOrder();
      if (matchedOrder) return matchedOrder;
    }

    return findIndexedOrder();
  };
};

const reconcileSepayTransactions = async ({
  fetchTransactions,
  findOrder,
  applyTransaction,
  targetOrderId = ''
} = {}) => {
  if (typeof fetchTransactions !== 'function' || typeof findOrder !== 'function' || typeof applyTransaction !== 'function') {
    throw new Error('Thieu phu thuoc doi soat SePay.');
  }

  const fetched = await fetchTransactions();
  const outcomes = [];
  const targetId = `${targetOrderId || ''}`.trim();

  for (const transaction of fetched.transactions || []) {
    if (transaction.transferType && transaction.transferType !== 'in') {
      outcomes.push({ transactionId: transaction.id, status: 'ignored_not_money_in' });
      continue;
    }
    if (parseMoney(transaction.transferAmount) <= 0) {
      outcomes.push({ transactionId: transaction.id, status: 'ignored_invalid_amount' });
      continue;
    }

    const orderDoc = await findOrder(transaction);
    if (!orderDoc) {
      outcomes.push({ transactionId: transaction.id, status: 'order_not_found' });
      continue;
    }
    if (targetId && orderDoc.id !== targetId) {
      outcomes.push({ transactionId: transaction.id, status: 'ignored_other_order', orderId: orderDoc.id });
      continue;
    }

    const result = await applyTransaction({ transaction, orderDoc });
    outcomes.push({ transactionId: transaction.id, orderId: orderDoc.id, ...result });
  }

  return {
    ...fetched,
    outcomes,
    matchedCount: outcomes.filter(outcome => ['paid', 'partial', 'duplicate_ignored'].includes(outcome.status)).length
  };
};

module.exports = {
  SEPAY_TRANSACTIONS_API_URL,
  buildSepayTransactionsUrl,
  createLegacyOrderLookup,
  fetchSepayTransactions,
  formatSepayDateTime,
  normalizeSepayTransaction,
  reconcileSepayTransactions
};
