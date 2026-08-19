const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildSepayTransactionsUrl,
  createLegacyOrderLookup,
  fetchSepayTransactions,
  formatSepayDateTime,
  normalizeSepayTransaction,
  reconcileSepayTransactions
} = require('../functions/sepayReconciliation');

let passed = 0;
const test = async (name, callback) => {
  await callback();
  passed += 1;
  console.log(`PASS ${name}`);
};

const makeResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload
});

(async () => {
  await test('normalizes SePay v2 incoming transactions without treating money-out as paid', () => {
    const incoming = normalizeSepayTransaction({
      id: 'sepay-in-1',
      amount_in: '1395000',
      amount_out: 0,
      transaction_content: 'TT HDTFJ97G',
      transaction_date: '2026-08-19 19:47:00',
      account_number: '050086470672',
      reference_number: 'MB-REF-1'
    });
    const outgoing = normalizeSepayTransaction({ id: 'sepay-out-1', amount_in: 0, amount_out: 1395000 });

    assert.equal(incoming.transferType, 'in');
    assert.equal(incoming.transferAmount, 1395000);
    assert.equal(incoming.content, 'TT HDTFJ97G');
    assert.equal(outgoing.transferType, 'out');
    assert.equal(outgoing.transferAmount, 0);
  });

  await test('builds the official SePay v2 request with a server-only bearer token path', () => {
    const url = new URL(buildSepayTransactionsUrl({
      from: '2026-08-18 20:00:00',
      to: '2026-08-19 20:00:00',
      bankAccountId: 'account-uuid',
      perPage: 100,
      page: 2
    }));
    assert.equal(url.origin, 'https://userapi.sepay.vn');
    assert.equal(url.pathname, '/v2/transactions');
    assert.equal(url.searchParams.get('transaction_date_from'), '2026-08-18 20:00:00');
    assert.equal(url.searchParams.get('transaction_date_to'), '2026-08-19 20:00:00');
    assert.equal(url.searchParams.get('bank_account_id'), 'account-uuid');
    assert.equal(url.searchParams.get('per_page'), '100');
    assert.equal(url.searchParams.get('page'), '2');
    assert.match(formatSepayDateTime(new Date('2026-08-19T12:47:00.000Z')), /^2026-08-19 19:47:00$/);
  });

  await test('fetches every advertised SePay page, applies the API authorization header, and deduplicates transaction ids', async () => {
    const requests = [];
    const pages = [
      {
        data: [
          { id: 'tx-1', amount_in: 1395000, transaction_content: 'TT HDTFJ97G' },
          { id: 'tx-2', amount_in: 500000, transaction_content: 'TT HDABC12' }
        ],
        pagination: { total_pages: 2 }
      },
      {
        data: [
          { id: 'tx-2', amount_in: 500000, transaction_content: 'TT HDABC12' },
          { id: 'tx-3', amount_in: 250000, transaction_content: 'TT HDXYZ34' }
        ],
        pagination: { total_pages: 2 }
      }
    ];
    const result = await fetchSepayTransactions({
      apiToken: 'server-only-token',
      now: new Date('2026-08-19T13:00:00.000Z'),
      perPage: 2,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return makeResponse(pages[requests.length - 1]);
      }
    });

    assert.equal(result.pagesFetched, 2);
    assert.deepEqual(result.transactions.map(transaction => transaction.id), ['tx-1', 'tx-2', 'tx-3']);
    assert.equal(requests[0].options.headers.Authorization, 'Bearer server-only-token');
    assert.equal(new URL(requests[1].url).searchParams.get('page'), '2');
  });

  await test('finds a legacy invoice after the old 2,000-order scan ceiling without restarting prior pages', async () => {
    const legacyOrders = Array.from({ length: 2001 }, (_, index) => ({ id: `o_${index}` }));
    legacyOrders[2000] = { id: 'o_tfj97g' };
    let pagesFetched = 0;
    const lookup = createLegacyOrderLookup({
      pageSize: 500,
      fetchPage: async (cursor) => {
        pagesFetched += 1;
        const startIndex = cursor ? legacyOrders.indexOf(cursor) + 1 : 0;
        return legacyOrders.slice(startIndex, startIndex + 500);
      },
      getOrderCodes: (order) => order.id === 'o_tfj97g' ? ['HDTFJ97G'] : [`HD${order.id.slice(-6)}`]
    });

    const matched = await lookup(['HDTFJ97G']);

    assert.equal(matched.id, 'o_tfj97g');
    assert.equal(pagesFetched, 5);
    assert.equal(await lookup(['HDNOTFOUND']), null);
    assert.equal(pagesFetched, 5);
  });

  await test('only applies a positive incoming transaction to the invoice identified by its transfer content and stays idempotent across 100 reconciliation runs', async () => {
    const transaction = normalizeSepayTransaction({
      id: 'sepay-transaction-97g',
      reference_number: 'MB-97G',
      amount_in: 1395000,
      transaction_content: 'TT HDTFJ97G'
    });
    const applications = [];
    const reconcile = () => reconcileSepayTransactions({
      fetchTransactions: async () => ({ transactions: [
        transaction,
        normalizeSepayTransaction({ id: 'sepay-outgoing', amount_out: 1395000, transaction_content: 'TT HDTFJ97G' })
      ] }),
      findOrder: async (candidate) => candidate.content.includes('HDTFJ97G') ? { id: 'order-97g' } : null,
      applyTransaction: async ({ transaction: candidate, orderDoc }) => {
        const identity = `${orderDoc.id}:${candidate.id}`;
        if (applications.includes(identity)) return { status: 'duplicate_ignored' };
        applications.push(identity);
        return { status: 'paid', paymentId: `sepay_${identity}` };
      },
      targetOrderId: 'order-97g'
    });

    const results = [];
    for (let run = 0; run < 100; run += 1) results.push(await reconcile());

    assert.equal(results[0].matchedCount, 1);
    assert.equal(results[0].outcomes[0].status, 'paid');
    assert.equal(results[0].outcomes[1].status, 'ignored_not_money_in');
    assert.ok(results.slice(1).every(result => result.outcomes[0].status === 'duplicate_ignored'));
    assert.deepEqual(applications, ['order-97g:sepay-transaction-97g']);
  });

  await assert.rejects(
    () => fetchSepayTransactions({ fetchImpl: async () => makeResponse({}) }),
    error => error.code === 'sepay_api_token_missing' && error.statusCode === 503
  );
  passed += 1;
  console.log('PASS fails explicitly when the server SePay token is not configured');

  await test('binds the SePay secret only to the HTTP check and scheduled reconciliation functions', () => {
    const functionsSource = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    assert.match(functionsSource, /syncSepayPaymentStatus = functions\.https\.onRequest\(\{ secrets: \['SEPAY_API_TOKEN'\] \}/);
    assert.match(functionsSource, /autoReconcileSepayTransactions = onSchedule\(\{[\s\S]*?secrets: \['SEPAY_API_TOKEN'\]/);
  });

  console.log(`SePay reconciliation tests passed: ${passed}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
