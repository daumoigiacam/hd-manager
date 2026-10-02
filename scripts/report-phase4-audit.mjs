import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPORT_PATH = path.resolve('docs/reports/HD-Manager-Performance-Audit.html');
const EVIDENCE_DIR = path.resolve('test-results/phase4');
const START = '<!-- PHASE4:START -->';
const END = '<!-- PHASE4:END -->';

const readJson = async name => JSON.parse(await readFile(path.join(EVIDENCE_DIR, name), 'utf8'));
const [inventory, rules, cursor, benchmark, architecture] = await Promise.all([
  readJson('firestore-inventory-transaction.json'),
  readJson('firestore-inventory-rules.json'),
  readJson('firestore-cursor-pagination.json'),
  readJson('cursor-pagination-benchmark.json'),
  readJson('runtime-architecture.json'),
]);

const escapeHtml = value => `${value ?? ''}`
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const table = (headers, rows) => `<div class="table-scroll"><table><thead><tr>${headers
  .map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows
  .map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const vi = value => Number(value).toLocaleString('vi-VN');
const statusClass = value => value === 'PASS' ? 'p4-ok' : value === 'PARTIAL' ? 'p4-warn' : 'status';
const status = value => `<strong class="${statusClass(value)}">${escapeHtml(value)}</strong>`;

const inventoryRows = inventory.evidence
  .filter(row => Number.isFinite(row.concurrentRequests))
  .map(row => [
    vi(row.concurrentRequests),
    vi(row.requestedQuantity),
    vi(row.accepted),
    vi(row.rejected),
    vi(row.finalStock),
    `${Number(row.durationMs).toFixed(2)} ms`,
    row.finalStock >= 0 ? status('PASS') : status('BLOCKED'),
  ]);
const retry = inventory.evidence.find(row => row.scenario === 'idempotent-retry');
const largeRows = benchmark.rows.map(row => [
  vi(row.records),
  vi(row.before.recordsLoaded),
  vi(row.before.payloadBytes),
  vi(row.after.firstPageRecords),
  vi(row.after.firstPagePayloadBytes),
  `${Number(row.payloadReductionPercent).toFixed(4)}%`,
  'Synthetic local only',
]);
const architectureRows = architecture.matrix.map(row => [
  escapeHtml(row.layer),
  escapeHtml(row.production),
  escapeHtml(row.staging),
  row.match ? status('PASS') : status('BLOCKED'),
]);

const section = `${START}
<section id="phase-4-audit">
<style>.p4-ok{color:#157347}.p4-warn{color:#946200}.p4-callout{border-left:4px solid #a32725;background:#fff5f4;padding:12px 16px;margin:12px 0}.p4-evidence{border-left:4px solid #155c9a;background:#f3f8fc;padding:12px 16px;margin:12px 0}</style>
<h2>Phase 4</h2>
<p class="status">FINAL STATUS: BLOCKED.</p>
<p>Ngày tạo bằng chứng: ${escapeHtml(inventory.generatedAt)}. Phase này không truy cập dữ liệu production, không deploy production, không thay Android release và không chạy tải thật. Các số đo concurrency là từ Local Firestore Emulator; bảng 100–100.000 bản ghi là benchmark tổng hợp trong một tiến trình Node.</p>
<div class="p4-callout"><strong>Load gate đóng:</strong> transaction tồn kho đã giữ đúng bất biến trong emulator, nhưng runtime staging hiện không tương đương runtime Firebase đang phục vụ production; read model chính vẫn full-load và chưa dùng cursor; chưa có migration/reconciliation số dư tồn kho hoặc luồng reversal/amend phía server.</div>

<h3>Inventory Concurrency</h3>
<p>Luồng nhập kho, kiểm kho và xuất kho mới gửi command lên Cloud Function. Function xác minh tenant + RBAC, đọc operation/chứng từ/số dư trong cùng Firestore transaction, kiểm tra tồn rồi mới ghi số dư, ledger bất biến và chứng từ. UI chỉ cập nhật sau server ACK. Mã chưa deploy.</p>
${table(['Requests', 'Số lượng/request', 'Accepted', 'Rejected', 'Tồn cuối', 'Thời gian emulator', 'Bất biến'], inventoryRows)}
<p>Ở 25 và 50 request, một phần request bị Firestore emulator hủy do contention/retry budget. Đây là từ chối an toàn, không phải throughput đạt production; tồn cuối không âm và số chứng từ bằng số giao dịch được chấp nhận.</p>

<h3>Oversell Test</h3>
<p>${status(inventory.status)} trên Local Firestore Emulator cho ma trận 2/5/10/25/50. Trường hợp 2 request cùng xuất 60 từ tồn 100 chỉ một request được chấp nhận, tồn cuối 40. OUTBOUND không có balance được chặn fail-closed thay vì tự tạo số âm.</p>

<h3>Idempotency</h3>
<p>${retry ? `${retry.attempts} lần gửi cùng operation key tạo ${retry.outboundDocuments} phiếu xuất, ${retry.duplicates} lần được nhận diện là retry và tồn cuối ${retry.finalStock}.` : 'UNMEASURED'} Cùng key nhưng payload khác trả conflict. Operation key được tenant-scope và kiểm tra phía server.</p>

<h3>Cursor Pagination</h3>
<p>Primitive cursor dùng <code>where(companyId)</code>, <code>orderBy(documentId())</code>, <code>startAfter(snapshot)</code> và <code>limit</code>. Emulator trả ${cursor.originalRecords} bản ghi gốc qua ${cursor.pages} trang, không trùng, không rò tenant và không thiếu bản ghi gốc khi có mutation giữa các trang.</p>
${table(['Kiểm tra', 'Kết quả'], [
  ['Original records missing', vi(cursor.mutationDuringPagination.originalRecordsMissing)],
  ['Duplicate records', vi(cursor.duplicateCount)],
  ['Tenant leaks', vi(cursor.tenantLeakCount)],
  ['Insert trước cursor', cursor.mutationDuringPagination.insertionBeforeCursorExcludedFromSession ? 'Loại khỏi session hiện tại (đúng snapshot semantics)' : 'NOT PASS'],
  ['Insert sau cursor', cursor.mutationDuringPagination.insertionAfterCursorIncluded ? 'Có trong trang sau' : 'NOT PASS'],
  ['Tích hợp vào read model App.jsx', status('BLOCKED')],
])}
<p class="status">Không được gọi local slicing là pagination. Các collection nghiệp vụ chính vẫn được nạp toàn bộ để tính tổng, tồn, lương và dashboard; thay bằng limit đơn thuần sẽ làm sai số liệu. Cần tách page read model và server aggregates trước khi bật.</p>

<h3>Large Dataset</h3>
<p>So sánh dưới đây chỉ đo payload JSON tổng hợp giữa full collection và page 50 bản ghi. Không phải latency Firestore/network/browser/staging và không phải load test.</p>
${table(['Records', 'Full rows', 'Full bytes', 'Page rows', 'Page bytes', 'Payload giảm', 'Phạm vi'], largeRows)}
<p>Benchmark cho thấy lý do cần cursor, không chứng minh app hiện đã scale: runtime App.jsx vẫn còn full-load ở các collection trọng yếu.</p>

<h3>Runtime Architecture Verification</h3>
${table(['Layer', 'Production client path', 'Staging evidence', 'Parity'], architectureRows)}
<p>Health staging read-only trả HTTP ${escapeHtml(architecture.stagingVpsEvidence.healthStatus)}; PostgreSQL ${escapeHtml(architecture.stagingVpsEvidence.postgres)}, Redis ${escapeHtml(architecture.stagingVpsEvidence.redis)}. Production client đang dùng Firebase Auth/Firestore/Cloud Functions nên số health này không đại diện đường chạy production.</p>

<h3>Staging Parity</h3>
<p>${status(architecture.parity)}. VPS staging Node/PostgreSQL/Redis không phải Firebase runtime đang được client production sử dụng. Không có cơ sở hợp lệ để chạy tải rồi suy diễn sang production.</p>

<h3>Authentication</h3>
<p>Staging login: <strong>${escapeHtml(architecture.authentication.login)}</strong>; token: <strong>${escapeHtml(architecture.authentication.token)}</strong>; test tenant: <strong>${escapeHtml(architecture.authentication.testTenant)}</strong>. Thiếu tài khoản kiểm thử an toàn và token nên chưa thể nghiệm thu RBAC end-to-end.</p>

<h3>Tenant Isolation</h3>
<p>${status(rules.status)} trên Firestore emulator (${rules.checks}/${rules.expectedChecks} nhóm kiểm tra): cùng tenant đọc được; cross-tenant và customer bị từ chối; client không thể tạo/sửa/xóa các collection inventory do server quản lý; cập nhật liên kết đơn hàng không được thay inventory facts. Phân quyền server có unit test cho owner, role mặc định tiếng Việt, override chính xác và denial.</p>

<h3>Regression</h3>
<p>Các gate mã nguồn và local/emulator đã chạy sau thay đổi. Emulator PASS không thay thế staging/mobile/recovery, vì vậy kết quả regression sạch không thay đổi trạng thái tổng thể <strong>BLOCKED</strong>.</p>
${table(['Gate', 'Kết quả', 'Phạm vi'], [
  ['npm run test:all', status('PASS'), 'Toàn bộ regression mặc định; exit code 0'],
  ['npm run build', status('PASS'), 'Vite production build; 2.478 modules'],
  ['npm run lint + lint Phase 4', status('PASS'), 'ESLint toàn danh mục hiện hữu và toàn bộ file Phase 4'],
  ['Inventory concurrency unit', status('PASS'), '18/18, gồm RBAC, ràng buộc chi phí và ma trận 2/5/10/25/50'],
  ['Firestore inventory transaction', status('PASS'), '6/6 trên Local Firestore Emulator'],
  ['Firestore inventory rules', status('PASS'), `${rules.checks}/${rules.expectedChecks} nhóm kiểm tra`],
  ['Firestore cursor pagination', status('PASS'), `${cursor.pages} trang; 0 thiếu, 0 trùng, 0 rò tenant`],
  ['Tenant rules regression', status('PASS'), '14 ca trên Local Firestore Emulator'],
  ['Save integrity', status('PASS'), '45/45'],
  ['Authenticated staging E2E', status('BLOCKED'), 'Thiếu staging Firebase parity, test tenant và test credentials'],
])}

<h3>Before/After</h3>
${table(['Hạng mục', 'Trước', 'Sau Phase 4', 'Giới hạn'], [
  ['Xuất kho đồng thời', 'Client ghi chứng từ, không khóa tồn chung', 'Server Firestore transaction + balance + immutable ledger', 'Chưa deploy; cần backfill balance'],
  ['Retry cùng thao tác', 'Có thể lặp nghiệp vụ', 'Operation record + request hash; trừ tồn một lần', 'Chưa fault-injection trên staging parity'],
  ['Tenant/RBAC tồn kho', 'Dựa chủ yếu vào UI/rules chung', 'Identity + tenant + action permission được kiểm tra trong transaction', 'Chưa login test tenant staging'],
  ['Danh sách lớn', 'Full-load rồi local slice', 'Có cursor primitive và emulator proof', 'Chưa nối vào read model/aggregates'],
  ['Load test', 'Không có môi trường parity', 'Vẫn không có môi trường parity', 'Không chạy tải để tránh kết quả sai'],
])}

<h3>Load Test Readiness</h3>
<p class="status">BLOCKED. Không chạy 100/250/500/750/1.000 users.</p>
<p>Chỉ được chuyển thành <strong>READY FOR LOAD TEST</strong> sau khi hoàn tất tất cả blocker, chạy reconciliation và xác minh staging có cùng auth/API/datastore/index/rules/observability với production.</p>

<h3>Remaining Blockers</h3>
<ol>
<li>Backfill <code>inventoryBalances</code> từ dữ liệu hiện hữu, đối soát và có rollback; OUTBOUND hiện fail-closed khi balance chưa được khởi tạo.</li>
<li>Thiết kế operation reversal/amend phía server; client edit/delete chứng từ tồn kho hiện bị rules chặn để bảo vệ ledger.</li>
<li>Tích hợp cursor vào read model từng module và thay các tổng số bằng server aggregates, không giới hạn dữ liệu rồi làm sai báo cáo.</li>
<li>Tạo staging Firebase-equivalent với test tenant, owner/kế toán/kho/sales/customer test identities và index/rules giống production.</li>
<li>Bổ sung trace ID, metrics transaction retry/contention, query reads, error rate và reconciliation trước/sau load.</li>
<li>Chạy regression thiết bị thật và recovery/fault injection sau khi staging parity đạt.</li>
</ol>

<h3>Evidence</h3>
<ul>
<li><code>test-results/phase4/firestore-inventory-transaction.json</code></li>
<li><code>test-results/phase4/firestore-inventory-rules.json</code></li>
<li><code>test-results/phase4/firestore-cursor-pagination.json</code></li>
<li><code>test-results/phase4/cursor-pagination-benchmark.json</code></li>
<li><code>test-results/phase4/runtime-architecture.json</code></li>
<li><code>tests/inventory-transaction-concurrency.test.cjs</code></li>
</ul>
<p class="status">BLOCKED</p>
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
console.log(JSON.stringify({ report: REPORT_PATH, status: 'BLOCKED' }, null, 2));
