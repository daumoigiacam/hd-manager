import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPORT_PATH = path.resolve('docs/reports/HD-Manager-Performance-Audit.html');
const AUDIT_PATH = path.resolve('test-results/critical-business-audit/summary.json');
const BROWSER_DIR = path.resolve('test-results/full-interaction/critical-business');
const START = '<!-- CRITICAL-BUSINESS-AUDIT:START -->';
const END = '<!-- CRITICAL-BUSINESS-AUDIT:END -->';

const readJson = async (filePath, fallback) => readFile(filePath, 'utf8').then(JSON.parse).catch(() => fallback);
const latestResult = async (pattern) => {
  const files = await readdir('test-results').catch(() => []);
  const file = files.filter((name) => pattern.test(name)).sort().at(-1);
  return file ? { file, data: await readJson(path.join('test-results', file), null) } : { file: '', data: null };
};
const [audit, browser, observations, staging] = await Promise.all([
  readJson(AUDIT_PATH, null),
  readJson(path.join(BROWSER_DIR, 'summary.json'), { samples: 0, summary: [], failures: [{ error: 'Focused browser audit not run' }] }),
  readJson(path.join(BROWSER_DIR, 'observations.json'), []),
  readJson('test-results/phase2/staging-environment.json', {}),
]);
const bigStress = await latestResult(/^hd-manager-big-stress-.*\.json$/);
if (!audit) throw new Error(`Missing audit evidence: ${AUDIT_PATH}`);

const escapeHtml = (value) => `${value ?? ''}`
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const fixed = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : 'UNMEASURED';
const mb = (bytes) => Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : 'UNMEASURED';
const status = (value) => `<strong class="${value === 'PASS' ? 'cb-ok' : value === 'PARTIAL' ? 'cb-warn' : 'status'}">${escapeHtml(value)}</strong>`;
const table = (headers, rows) => `<div class="table-scroll"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const ui = (module, profile = 'cpu-low-6x', action = 'open') => (
  browser.summary?.find((row) => row.key === `${profile}/${module}/${action}`) || null
);
const scroll = (module, profile = 'cpu-low-6x') => (
  observations.find((row) => row.viewport === profile && row.module === module && row.kind === 'scroll') || null
);
const benchmark = (module, records) => audit.moduleBenchmarks.find((row) => row.module === module && row.records === records);
const operation = (module, records, label) => benchmark(module, records)?.operations.find((row) => row.label === label);
const collection = (name) => audit.collectionEvidence.find((row) => row.collection === name);

const moduleRows = [
  ['Xuất kho', 'warehouse_dispatch', 'warehouseDispatches'],
  ['Đơn đặt hàng', 'order_requests', 'orderRequests'],
  ['Đơn hàng', 'orders', 'orders'],
].map(([label, route, collectionName]) => {
  const open = ui(route);
  const scrollEvidence = scroll(route);
  const collectionRow = collection(collectionName);
  return [
    escapeHtml(label),
    open ? `${fixed(open.p50)} / ${fixed(open.p95)} ms (n=${open.n})` : 'UNMEASURED',
    scrollEvidence?.status === 'MEASURED'
      ? `max ${fixed(scrollEvidence.maxFrameMs)} ms; >34 ms: ${scrollEvidence.framesOver34ms}; DOM ${scrollEvidence.domNodes}`
      : 'UNMEASURED',
    collectionRow ? `${collectionRow.fullLoad ? 'FULL LOAD' : 'bounded'}; ${escapeHtml(collectionRow.pagination)}` : 'UNMEASURED',
    mb(benchmark(collectionName, 50_000)?.serializedBytes),
    status(audit.acceptance[label === 'Xuất kho' ? 'warehouseDispatch' : label === 'Đơn đặt hàng' ? 'orderRequests' : 'orders']),
  ];
});

const largeDatasetRows = audit.moduleBenchmarks.flatMap((entry) => {
  const initial = entry.operations.find((row) => row.label === 'full-load-derived-list');
  const search = entry.operations.find((row) => row.label === 'search-full-scan');
  const filter = entry.operations.find((row) => row.label === 'filter-full-scan');
  const sort = entry.operations.find((row) => row.label === 'sort-copy');
  const detail = entry.operations.find((row) => row.label === 'detail-linear-find');
  return [[
    escapeHtml(entry.module),
    entry.records.toLocaleString('vi-VN'),
    mb(entry.serializedBytes),
    fixed(initial?.p95Ms),
    fixed(search?.p95Ms),
    fixed(filter?.p95Ms),
    fixed(sort?.p95Ms),
    fixed(detail?.p95Ms),
  ]];
});

const criticalCollections = audit.collectionEvidence.map((row) => [
  `<code>${escapeHtml(row.collection)}</code>`,
  escapeHtml(row.query),
  row.fullLoad ? '<span class="status">Có</span>' : 'Không',
  escapeHtml(row.pagination),
  escapeHtml(row.projection),
  escapeHtml(row.risk),
]);

const phaseRows = [
  ['Tap Save → UI feedback', 'UNMEASURED', 'Focused harness chưa có ca tạo đơn thật; không suy diễn từ thời gian mở trang.'],
  ['Validation', 'UNMEASURED', 'Chưa có span riêng trong handler production.'],
  ['API', 'UNMEASURED', 'Client Firebase được audit không cùng runtime PostgreSQL staging.'],
  ['Business logic', 'UNMEASURED', 'Không có trace ID xuyên client/server.'],
  ['Database', 'UNMEASURED', 'Không có authenticated query plan/latency cho luồng đơn hàng.'],
  ['Inventory', 'UNMEASURED', 'Không có transaction tồn kho phía server để đo.'],
  ['Payment/debt', 'UNMEASURED', 'Đơn + payment/expense đã dùng atomic write nhưng chưa có backend timing breakdown.'],
  ['Response/ACK', 'Behavior verified', 'Tạo đơn thường giờ chờ ACK của atomic transaction trước khi báo thành công.'],
  ['UI reconciliation', 'PARTIAL', 'Unit/source regression xác nhận pending giữ biểu mẫu; chưa đo end-to-end trên staging.'],
];

const stagingHealth = staging.probes?.health;
const browserFailureCount = (browser.failures || []).length + (browser.errors || []).length;
const section = `${START}
<section id="critical-business-audit">
<style>.cb-ok{color:#157347}.cb-warn{color:#946200}.cb-callout{border-left:4px solid #a32725;background:#fff5f4;padding:12px 16px;margin:12px 0}.cb-evidence{border-left:4px solid #155c9a;background:#f3f8fc;padding:12px 16px;margin:12px 0}</style>
<h2>Critical Business Module Deep Audit</h2>
<p class="status">FINAL STATUS: NOT PASS.</p>
<p>Ngày chạy: ${escapeHtml(audit.generatedAt)}. Không truy cập production và không deploy. Phạm vi đo gồm benchmark CPU/RAM local có dữ liệu tổng hợp cố định, kiểm tra mã nguồn, unit/regression và ${browser.samples || 0} mẫu Chrome preview tập trung. API/DB/Redis, tải đồng thời và Android thật không được gán số liệu khi chưa có môi trường hợp lệ.</p>
<div class="cb-callout"><strong>Điều kiện chặn:</strong> không tìm thấy transaction kiểm tra tồn khả dụng khi tạo phiếu xuất Firebase; các collection trọng yếu vẫn full-load theo công ty; không có state machine chuyển trạng thái đơn đặt hàng được kiểm soát tập trung; staging không có identity/runtime parity để chạy load có xác thực.</div>

<h3>Xuất kho</h3>
<p>Đã bổ sung mã thao tác ổn định và document ID xác định theo tenant, nên SAVE ×3 hoặc retry cùng command hội tụ về một chứng từ trong mô hình và unit test. Tuy nhiên <code>handleAddWarehouseDispatch</code> chưa đọc tồn và ghi phiếu trong cùng transaction. Hai người dùng cùng thấy tồn 10 rồi cùng xuất 7 có thể dẫn tới tồn mô hình -4; đây là bằng chứng rủi ro từ mã nguồn và race model, chưa phải kết quả backend live.</p>
${table(['Kiểm tra', 'Kết quả', 'Bằng chứng'], [
  ['Mở module Chrome CPU 6x', ui('warehouse_dispatch') ? `p50 ${fixed(ui('warehouse_dispatch').p50)} ms; p95 ${fixed(ui('warehouse_dispatch').p95)} ms; n=${ui('warehouse_dispatch').n}` : 'UNMEASURED', 'Preview local, không phải Android/backend'],
  ['Double submit / reconnect retry', audit.idempotency.pass ? 'PASS local/unit' : 'NOT PASS', `${audit.idempotency.attempts} lần gửi → ${audit.idempotency.deterministicDocuments} document; tồn ${audit.idempotency.deterministicStockAfter}`],
  ['Tồn trước + nhập - xuất = tồn sau', 'PARTIAL', 'Công thức/hiển thị có regression tests; chưa nghiệm thu transaction phân tán'],
  ['Xuất vượt tồn / race', 'NOT PASS', `Transaction tồn kho: ${audit.sourceEvidence.warehouseDispatchUsesStockTransaction ? 'có' : 'không'}; guard tồn: ${audit.sourceEvidence.warehouseDispatchChecksAvailableStock ? 'có' : 'không'}`],
  ['Network failure', 'PARTIAL', 'Command ID giữ nguyên và hàng đợi bền; chưa fault-injection trên backend parity'],
])}

<h3>Đơn đặt hàng</h3>
<p>Các trạng thái quan sát trực tiếp trong mã: <code>${audit.workflow.observedStatuses.orderRequests.join('</code>, <code>')}</code>. Không phát hiện hàm/matrix trung tâm kiểm soát transition; vì vậy không thể xác nhận transition không hợp lệ, concurrent transition và retry transition đều an toàn.</p>
${table(['Kiểm tra', 'Kết quả', 'Bằng chứng'], [
  ['ID retry ổn định', audit.sourceEvidence.stableOrderRequestId ? 'PASS source/unit' : 'NOT PASS', `App.jsx:${audit.sourceEvidence.lines.handleAddOrderRequest}`],
  ['Workflow state machine', 'NOT PASS', 'Có nhiều trạng thái và cập nhật rời rạc; không có transition guard tập trung'],
  ['Search/filter 50.000 local p95', 'Synthetic only', `${fixed(operation('orderRequests', 50_000, 'search-full-scan')?.p95Ms)} / ${fixed(operation('orderRequests', 50_000, 'filter-full-scan')?.p95Ms)} ms`],
  ['Pagination datastore', 'NOT PASS', escapeHtml(collection('orderRequests')?.pagination || 'UNMEASURED')],
  ['Concurrency/retry backend', 'UNMEASURED', 'Không có authenticated staging parity'],
])}

<h3>Đơn hàng</h3>
<p>Đơn thường dùng ID xác định, gom order + payment/expense trong atomic save và giờ chờ ACK trước khi UI báo “máy chủ xác nhận”. Luồng chuyển phiếu xuất thành đơn dùng Firestore transaction để khóa liên kết phiếu xuất. Đây là cải thiện tính đúng; không được diễn giải thành hệ thống tồn kho đã atomic.</p>
${table(['Kiểm tra', 'Kết quả', 'Bằng chứng'], [
  ['ID idempotent', audit.sourceEvidence.stableOrderId ? 'PASS source/unit' : 'NOT PASS', `App.jsx:${audit.sourceEvidence.lines.handleAddOrder}`],
  ['Order + payment/expense atomic', audit.sourceEvidence.orderAndFinancialWritesAtomic ? 'PASS source/unit' : 'NOT PASS', 'Một atomic command, cùng tenant'],
  ['Chờ server ACK trước thành công', audit.sourceEvidence.orderAwaitsAtomicServerConfirmation ? 'PASS source/unit' : 'NOT PASS', 'Regression test bắt buộc requireSharedWriteConfirmation'],
  ['Phiếu xuất → đơn', audit.sourceEvidence.warehouseDispatchToOrderTransaction ? 'PASS source/unit' : 'NOT PASS', 'Transaction chặn một phiếu xuất liên kết hai lần'],
  ['Inventory concurrency', 'NOT PASS', 'Tạo phiếu xuất chưa transaction với số tồn'],
  ['Mobile/native', 'UNMEASURED', 'Không có thiết bị Android trong audit này'],
])}

<h4>Order Save Performance</h4>
<p>Không thể cung cấp breakdown ms giả khi code hiện chưa phát span riêng cho từng bước và staging không cùng backend. Bảng dưới là kết quả trung thực:</p>
${table(['Bước', 'Số đo', 'Giải thích'], phaseRows.map((row) => row.map(escapeHtml)))}

<h3>Cross-module Workflow</h3>
<p>Các đoạn workflow thực có trong code: Đơn đặt hàng có thể chuyển thành đơn; phiếu xuất có thể tạo đơn bằng transaction liên kết; đơn có payment/expense atomic và liên kết giao hàng/công nợ ở các handler riêng. Không có một transaction duy nhất bao trùm Đơn đặt hàng → Đơn hàng → Xuất kho → Giao hàng → Thanh toán → Công nợ, nên workflow tổng thể chỉ <strong>PARTIAL</strong>. Post-load reconciliation chưa chạy.</p>

<h3>Concurrency</h3>
${table(['Tình huống', 'Kết quả', 'Kết luận'], [
  ['Hai user cùng xuất 7 khi tồn 10', `${audit.concurrencyModel.aSawAvailable && audit.concurrencyModel.bSawAvailable ? 'Cả hai đều vượt local check' : 'Đã chặn'}; tồn mô hình ${audit.concurrencyModel.finalWithoutAtomicCompareAndWrite}`, 'NOT PASS: thiếu atomic compare-and-write tồn kho'],
  ['Hai lần tạo đơn cùng command', `${audit.idempotency.deterministicDocuments} document`, 'PASS trong local/unit model'],
  ['Hai thiết bị khác command nhưng cùng hàng', 'UNMEASURED', 'ID idempotency không thay thế lock tồn kho'],
  ['Concurrent status transition', 'UNMEASURED / NOT GUARDED', 'Không có transition matrix trung tâm'],
])}

<h3>Idempotency</h3>
<p>Order, order request và warehouse dispatch đều giữ một <code>clientMutationId</code> xuyên retry và tạo document ID tenant-scoped. Unit test mô phỏng SAVE ×3 + reconnect retry chỉ còn một document và trừ tồn một lần. Payment/expense của order dùng ID suy ra từ order và atomic command. Shipment/status transition toàn hệ thống chưa có cùng mức bảo đảm, nên trạng thái chung là <strong>PARTIAL</strong>.</p>

<h3>Inventory Integrity</h3>
<p><strong>Không đạt.</strong> Các regression hiện có xác minh snapshot kiểm kho, đơn vị và công thức hiển thị; idempotent dispatch ngăn retry cùng command trừ hai lần. Nhưng handler tạo phiếu xuất Firebase không transactionally kiểm tra số tồn khả dụng, nên chưa chứng minh không âm tồn, không oversell, cancel/reversal đúng hoặc hai thiết bị không lost update.</p>

<h3>Large Dataset</h3>
<p>Benchmark sau chạy in-process trên Node; p95 tính từ 8–30 mẫu tùy kích thước. “local-page-slice” không phải datastore pagination. Payload là JSON chưa nén trong bộ nhớ, không phải network payload.</p>
${table(['Module', 'Rows', 'JSON size', 'List p95 ms', 'Search p95 ms', 'Filter p95 ms', 'Sort p95 ms', 'Detail p95 ms'], largeDatasetRows)}
<p class="status">Large Dataset: NOT PASS.</p><p>Dù CPU local có thể xử lý fixture, các collection nghiệp vụ vẫn được tải toàn bộ theo tenant nên thời gian mạng, reads, RAM và chi phí tăng tuyến tính. Không được dùng bảng này để hợp thức hóa full-load.</p>
${bigStress.data ? `<p>Suite stress tổng hợp in-memory gần nhất cũng chạy ${bigStress.data.targets?.orders?.toLocaleString('vi-VN') || 'UNMEASURED'} orders, ${bigStress.data.targets?.transactions?.toLocaleString('vi-VN') || 'UNMEASURED'} transactions và ${bigStress.data.targets?.inventory?.toLocaleString('vi-VN') || 'UNMEASURED'} inventory rows: không crash, peak RSS ${mb(bigStress.data.memory?.peakRssBytes)}, event-loop max ${fixed(bigStress.data.eventLoop?.maxMs)} ms. Chỉ dùng làm evidence CPU/RAM local; chỉ số FPS ước tính từ Node bị loại khỏi nghiệm thu mobile.</p>` : '<p>Generic in-memory big-stress evidence: UNMEASURED.</p>'}
${table(['Collection', 'Query', 'Full load', 'Pagination', 'Projection', 'Risk'], criticalCollections)}

<h3>Mobile Performance</h3>
${table(['Module', 'Open p50 / p95', 'Programmatic scroll', 'Kết luận'], moduleRows)}
<p>CPU 6x dùng viewport 390×844 trên Chrome desktop, không phải WebView/điện thoại thật. Dropped frames, keyboard, rotate, lifecycle, back khi request đang chạy và memory native vẫn <strong>UNMEASURED</strong>.</p>

<h3>Load Test</h3>
<p class="status">100 / 250 / 500 / 750 / 1.000 concurrent users: NOT RUN.</p>
<p>Staging health read-only trả HTTP ${escapeHtml(stagingHealth?.status ?? 'UNMEASURED')} với PostgreSQL ${fixed(stagingHealth?.data?.checks?.postgres?.latencyMs)} ms và Redis ${fixed(stagingHealth?.data?.checks?.cache?.latencyMs)} ms ở thời điểm nhàn rỗi. Đây không phải latency dưới tải. Client đang audit dùng Firebase, trong khi staging probe là PostgreSQL/Redis; seed identity trước đó trả 401. Chạy load lúc này sẽ đo sai hệ thống hoặc tạo kết quả không có giá trị.</p>
<p>Suite 11.309 thao tác và big-stress nói trên đều là một tiến trình Node, không tạo 100–1.000 session đồng thời, không gọi API/DB thật và không được tính là load test.</p>

<h3>Bottlenecks</h3>
<ol>
<li><strong>Data integrity blocker:</strong> thiếu stock transaction/oversell guard khi tạo phiếu xuất Firebase.</li>
<li><strong>Scale blocker:</strong> full-load collection, không cursor/projection; 50.000 rows chỉ riêng JSON tổng hợp đã đạt ${mb(benchmark('orders', 50_000)?.serializedBytes)} cho orders.</li>
<li><strong>Workflow blocker:</strong> trạng thái đơn đặt hàng cập nhật phân tán, không transition guard tập trung.</li>
<li><strong>Observability blocker:</strong> chưa có trace xuyên UI/API/business/DB/inventory/payment nên không thể chia chính xác save latency.</li>
<li><strong>Environment blocker:</strong> staging auth và datastore không parity với client.</li>
</ol>

<h3>Before/After</h3>
${table(['Hạng mục', 'Trước', 'Sau', 'Xác minh'], [
  ['Retry/SAVE ×3', `${audit.idempotency.legacyModeledDocuments} document mô hình; tồn ${audit.idempotency.legacyModeledStockAfter}`, `${audit.idempotency.deterministicDocuments} document; tồn ${audit.idempotency.deterministicStockAfter}`, 'Unit + deterministic ID source evidence'],
  ['Order success feedback', 'Atomic write chạy nền; handler trả trước ACK', 'Handler chờ transaction ACK; sync-pending giữ biểu mẫu/hàng đợi', 'Order cross-account + save-integrity regression'],
  ['Stock concurrency', 'Không có transaction guard', 'Chưa sửa; vẫn không có transaction guard', 'NOT PASS, không che rủi ro bằng client check'],
  ['Performance latency', 'Không có backend breakdown', 'Vẫn chưa có backend breakdown', 'Không tuyên bố cải thiện tốc độ'],
])}

<h3>Final Status</h3>
<p class="status">NOT PASS.</p>
${table(['Nhóm', 'Trạng thái', 'Lý do chính'], [
  ['Xuất kho', status(audit.acceptance.warehouseDispatch), 'Concurrency/inventory/network recovery/backend large-data chưa đạt'],
  ['Đơn đặt hàng', status(audit.acceptance.orderRequests), 'Pagination và state transition concurrency chưa đạt'],
  ['Đơn hàng', status(audit.acceptance.orders), 'ACK/idempotency đã tốt hơn; inventory integration, load và mobile còn thiếu'],
  ['Focused Chrome run', browserFailureCount === 0 && browser.samples > 0 ? status('PARTIAL') : status('NOT PASS'), `${browser.samples || 0} samples; ${browserFailureCount} failure/error; preview local`],
])}
<p>Không thể nghiệm thu production cho ba module này cho tới khi có stock transaction phía server, read model phân trang, state transition guard, staging parity + tenant test, load/recovery/reconciliation và Android native profiling.</p>

<h3>Evidence</h3>
<ul>
<li><code>test-results/critical-business-audit/summary.json</code>: benchmark 100–50.000 rows, source evidence, race/idempotency model.</li>
<li><code>test-results/full-interaction/critical-business/</code>: Chrome preview samples/observations/CPU profiles nếu focused run hoàn tất.</li>
<li><code>tests/business-operation-idempotency.test.mjs</code>: SAVE ×3 + reconnect retry.</li>
<li><code>tests/order-cross-account-sync.test.mjs</code>: server confirmation semantics.</li>
<li><code>tests/save-integrity-regressions.test.mjs</code>: auth, offline queue, atomic save regressions.</li>
<li><code>test-results/phase2/collection-inventory.json</code> và <code>staging-environment.json</code>: query/runtime evidence.</li>
${bigStress.file ? `<li><code>test-results/${escapeHtml(bigStress.file)}</code>: generic local in-memory stress; không phải backend/mobile load.</li>` : ''}
</ul>
</section>
${END}`;

let report = await readFile(REPORT_PATH, 'utf8');
const existingStart = report.indexOf(START);
const existingEnd = report.indexOf(END);
if (existingStart >= 0 && existingEnd > existingStart) {
  report = `${report.slice(0, existingStart)}${report.slice(existingEnd + END.length)}`;
}
if (!report.includes('</main>')) throw new Error('Report does not contain </main>');
report = report.replace('</main>', `${section}\n</main>`);
await writeFile(REPORT_PATH, report);
console.log(JSON.stringify({ report: REPORT_PATH, status: audit.acceptance.final, browserSamples: browser.samples || 0, browserFailureCount }, null, 2));
