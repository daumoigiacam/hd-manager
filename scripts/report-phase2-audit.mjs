import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const REPORT_PATH = 'docs/reports/HD-Manager-Performance-Audit.html';
const PHASE2_START = '<!-- PHASE2:START -->';
const PHASE2_END = '<!-- PHASE2:END -->';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const escapeHtml = (value) => String(value ?? 'UNMEASURED').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const fixed = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : 'UNMEASURED';
const table = (heads, rows) => `<div class="table-scroll"><table><thead><tr>${heads.map((head) => `<th>${escapeHtml(head)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

const [phase1Results, phase1Ui, phase2Ui, collections, cpu, staging] = await Promise.all([
  readJson('test-results/master-audit/audit-results.json'),
  readJson('test-results/full-interaction/master-baseline/summary.json'),
  readJson('test-results/full-interaction/phase2-client/summary.json'),
  readJson('test-results/phase2/collection-inventory.json'),
  readJson('test-results/phase2/cpu-profile-analysis.json'),
  readJson('test-results/phase2/staging-environment.json'),
]);

const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const generatedAt = new Date().toISOString();
const phase2Profiles = cpu.profiles.filter((profile) => profile.directory.endsWith('phase2-client'));
const focused = phase2Ui.summary.filter((row) => row.key.startsWith('cpu-low-6x/'));
const metric = (module) => focused.find((row) => row.key === `cpu-low-6x/${module}/open`);
const payroll = metric('payroll');
const pricing = metric('pricing');
const finance = metric('finance');
const phase1SlowCpu = phase1Ui.summary
  .filter((row) => row.key.startsWith('cpu-low-6x/') && row.key.endsWith('/open'))
  .sort((a, b) => b.p50 - a.p50);
const stagingRows = Object.fromEntries((staging.host?.raw || [])
  .filter((line) => line.startsWith('ROW|'))
  .map((line) => {
    const [, name, count] = line.split('|');
    return [name, Number(count)];
  }));
const hostStats = (staging.host?.raw || []).filter((line) => line.startsWith('STAT|')).map((line) => {
  const [, container, cpuPercent, memory, network, blockIo] = line.split('|');
  return [container, cpuPercent, memory, network, blockIo, 'Idle snapshot only'];
});
const topProfile = (module) => phase2Profiles
  .filter((profile) => profile.module === module)
  .sort((a, b) => b.sampledMs - a.sampledMs)[0];
const profileRows = ['payroll', 'pricing', 'finance'].map((module) => {
  const profile = topProfile(module);
  const top = profile?.topSelf?.slice(0, 4).map((entry) => `${entry.functionName} ${fixed(entry.selfMs)} ms`).join('; ');
  return [module, fixed(profile?.sampledMs), profile?.sampleCount, top];
});

const loadRows = [100, 250, 500, 750, 1000].map((users) => [
  users,
  'NOT RUN', 'UNMEASURED', 'UNMEASURED', 'UNMEASURED', 'UNMEASURED', 'UNMEASURED', 'UNMEASURED', 'UNMEASURED',
  'Blocked: official staging credential failed; no isolated test tenant/data; staging PostgreSQL runtime is not datastore parity with audited Firebase client.',
]);

const collectionRows = collections.rows.map((row) => [
  row.collection,
  row.modules.length ? row.modules.join(', ') : 'not foreground-mapped',
  row.currentRows ?? 'PRODUCTION_UNMEASURED',
  row.query,
  row.fullLoad ? 'YES' : 'NO',
  row.pagination,
  row.index,
  row.payloadBytes ?? 'UNMEASURED',
  row.risk,
]);

const phase2 = `${PHASE2_START}
<section id="phase-2">
<h2>Phase 2</h2>
<p class="status">FINAL STATUS: NOT PASS.</p>
<p>Ngày chạy: ${escapeHtml(generatedAt)}. Commit nền: <code>${escapeHtml(commit)}</code>. Phase 2 chỉ dùng preview local và các probe chỉ đọc ở staging; không đọc/ghi production, không tạo dữ liệu production và không deploy.</p>
<p>Đã bổ sung kiểm kê 48 collection, profile sâu Bảng lương/Giá bán/Tài chính và snapshot môi trường staging. Không chạy tải xác thực khi thiếu test tenant/user/data chính thức. Không biến health-check thành số liệu tải nghiệp vụ.</p>

<h3>Environment</h3>
${table(['Thành phần', 'Giá trị', 'Mức xác minh'], [
  ['Staging web', 'https://staging-app.hdconnect.net', `version.json ${staging.probes.version.status}; build ${staging.probes.version.data?.buildId}`],
  ['Staging API', staging.apiBaseUrl, `health ${staging.probes.health.status}; ready ${staging.probes.readiness.status}`],
  ['Database staging', 'PostgreSQL / hd_connect_staging', 'Container healthy; read-only counts sampled'],
  ['Cache staging', 'Redis', `health latency ${fixed(staging.probes.health.data?.checks?.cache?.latencyMs)} ms; PONG`],
  ['Observability', 'Health payload + Docker stats + PostgreSQL read-only counts', 'No authenticated per-request trace/load dashboard available'],
  ['Test tenant/users/data', 'MISSING', 'Repository seed credential returned HTTP 401; no credential was guessed and no direct-DB auth bypass was used'],
  ['Runtime parity', 'MISMATCH', 'Audited client uses Firebase collection reads; available staging backend uses PostgreSQL/Redis Phase 6'],
])}
${table(['Staging table', 'Rows (read-only exact count)'], Object.entries(stagingRows))}
${table(['Container', 'CPU', 'Memory', 'Network I/O', 'Block I/O', 'Scope'], hostStats)}
<p class="note">Các container metrics trên là một snapshot khi rảnh, không phải metrics tại 100–1.000 users và không được dùng để suy ra năng lực tải.</p>

<h3>Workload Model</h3>
<p>Mô hình bắt buộc khi blocker được gỡ: mỗi virtual user giữ session riêng và think-time, thực hiện hỗn hợp login → dashboard → khách hàng/tìm kiếm → sản phẩm → tạo/sửa/lưu đơn → tồn kho → giao hàng → thanh toán → thông báo. Mỗi chứng từ dùng idempotency key duy nhất; dữ liệu kiểm thử thuộc tenant chuyên dụng; ghi đồng thời active users, in-flight requests, actions/user, RPS, duration và ramp-up.</p>
<p>Phân bố đề xuất: 15% login/session, 20% dashboard/list, 15% search/customer, 20% order create/edit/save, 10% stock, 8% delivery, 7% payment, 5% notification. Ramp 5 phút mỗi mức; giữ 15 phút/mức; dừng an toàn nếu error rate vượt 5%, timeout tăng liên tục hoặc DB/container vượt ngưỡng đã phê duyệt. Đây là kế hoạch, chưa phải kết quả.</p>

${[100, 250, 500, 750, 1000].map((users) => `<h3>${users.toLocaleString('en-US')} Users</h3><p class="status">NOT RUN. Không có p50/p90/p95/p99, RPS, error/timeout hoặc resource-under-load hợp lệ.</p>`).join('')}
${table(['Users', 'Status', 'RPS', 'p50', 'p90', 'p95', 'p99', 'Error/timeout', 'DB/server/cache metrics', 'Reason'], loadRows)}

<h3>Stress Test</h3><p class="status">NOT RUN.</p><p>Chưa xác định degradation point, breaking point hoặc recovery sau tải trên 1.000 users vì workload 1.000 users chưa được phép chạy.</p>
<h3>Soak Test</h3><p class="status">NOT RUN.</p><p>Chưa có chuỗi thời gian đủ dài để kết luận memory leak, DB connection leak, Redis leak, queue buildup hoặc latency degradation.</p>
<h3>Recovery Test</h3><p class="status">NOT RUN.</p><p>Không restart API/container, ngắt PostgreSQL/Redis hoặc gây lỗi mạng staging khi chưa có cửa sổ kiểm thử, quyền vận hành và tenant cô lập. Vì vậy retry, duplicate prevention, UI recovery và queue recovery chưa được nghiệm thu.</p>

<h3>Client Profiling</h3>
<p>Đã chạy 45 tương tác trên Desktop Chrome với mobile viewport, React production profiling, fixture 600 sản phẩm / 360 khách / 1.800 đơn / 900 thanh toán; 5 mẫu cho mỗi module/profile. Đây là preview local, không có API/DB latency. Không có Android thật hoặc emulator kết nối, nên không có dropped-frame, startup WebView, nhiệt/GPU hay memory acceptance trên Android.</p>
${table(['CPU profile', 'Module', 'n', 'Navigation p50 ms', 'p95 ms', 'Max ms', 'React render p50 ms', 'Max listeners', 'Errors'], phase2Ui.summary.map((row) => {
  const [profile, module] = row.key.split('/');
  return [profile, module, row.n, fixed(row.p50), fixed(row.p95), fixed(row.max), fixed(row.render?.p50), row.maxActiveListeners, phase2Ui.errors.length];
}))}
${table(['Module', 'Longest sampled CPU window ms', 'Samples', 'Largest self-time samples'], profileRows)}
<p>Ở CPU 6x: Giá bán p50 ${fixed(pricing?.p50)} ms (render ${fixed(pricing?.render?.p50)} ms), Bảng lương p50 ${fixed(payroll?.p50)} ms (render ${fixed(payroll?.render?.p50)} ms), Tài chính p50 ${fixed(finance?.p50)} ms. Giá bán thể hiện nhiều layout measurement; Bảng lương tập trung ở compute/render trong bundle. Tên hàm bị minify nên cần source-map profiling trước khi sửa thuật toán cụ thể.</p>

<h3>Database Profiling</h3>
<p>Staging PostgreSQL baseline: query health ${fixed(staging.probes.health.data?.checks?.postgres?.latencyMs)} ms, nhưng không có query latency/slow query/locks/pool/transaction metrics dưới tải. Redis baseline ${fixed(staging.probes.health.data?.checks?.cache?.latencyMs)} ms, nhưng không có hit rate/miss rate/latency distribution/connections dưới tải. Production Firebase rows và payload tuyệt đối không được suy đoán từ PostgreSQL staging.</p>
${table(['Metric bắt buộc', 'Kết quả'], [
  ['DB CPU/RAM/connections/pool', 'Idle container CPU/RAM sampled; connections/pool under load UNMEASURED'],
  ['DB query latency/slow queries/locks/transactions', 'UNMEASURED under load'],
  ['Server CPU/RAM/disk/network/container', 'Idle snapshot only; UNMEASURED under load'],
  ['Redis hit/miss/latency/memory/connections', 'Health latency and idle memory only; hit/miss/connections under load UNMEASURED'],
  ['API RPS/p50/p90/p95/p99/max/error/timeout/4xx/5xx', 'UNMEASURED'],
])}

<h3>Collection Full-load Inventory</h3>
<p><strong>${collections.totals.unboundedCompanyQueries}/${collections.totals.collections}</strong> collection dùng truy vấn company-wide không cursor/limit; ${collections.totals.critical} CRITICAL và ${collections.totals.high} HIGH. Chỉ <code>companies</code> là point lookup; <code>messages</code> giới hạn 200 nhưng chưa có cursor/load-older. DOM slicing không giảm Firebase reads hoặc payload.</p>
<p>Không áp <code>limit</code> chung vì sẽ làm sai tổng lương, công nợ, tồn kho, lịch sử và dashboard. Sửa đúng cần read model phân trang theo module, server-side aggregate/materialized summary, projection và cursor; sau đó differential test toàn bộ quyền xem và công thức trước/sau. Vì remediation này chưa hoàn tất và chưa có benchmark datastore tương đương, mục ưu tiên cao vẫn mở.</p>
${table(['Collection', 'Module', 'Current rows', 'Query', 'Full load', 'Pagination', 'Index', 'Payload', 'Risk'], collectionRows)}

<h3>Bottleneck Analysis</h3>
${table(['User action chain', 'Bằng chứng', 'Kết luận'], [
  ['Mở Giá bán → state → render', `CPU6x p50 ${fixed(pricing?.p50)} ms; render p50 ${fixed(pricing?.render?.p50)} ms; layout measurement nổi bật`, 'Client render/layout là bottleneck đã chứng minh trong preview'],
  ['Mở Bảng lương → state → compute → render', `CPU6x p50 ${fixed(payroll?.p50)} ms; render p50 ${fixed(payroll?.render?.p50)} ms`, 'Compute/render chiếm phần lớn; cần source-map profile và scale test theo số nhân viên/kỳ lương'],
  ['Module → Firebase query → snapshot → state', '46 company-wide unbounded queries; snapshot hợp nhất toàn bộ kết quả', 'Bottleneck quy mô có rủi ro cao nhưng payload/latency production chưa đo'],
  ['UI → API → service → PostgreSQL/Redis', 'Staging auth/test tenant/parity chưa sẵn sàng', 'Không đủ dữ liệu chọn API/DB/network là bottleneck đầu tiên toàn hệ thống'],
])}

<h3>Before / After</h3>
<p>Tối ưu có benchmark hợp lệ vẫn là search 5.000 khách hàng: p50 ${fixed(phase1Results.search.before.p50)} → ${fixed(phase1Results.search.after.p50)} ms, giảm ${fixed(phase1Results.search.p50ImprovementPercent)}%; hash kết quả không đổi. Phase 2 không tuyên bố thêm cải thiện module/API/DB vì chưa triển khai remediation collection và chưa có cặp benchmark tương đương.</p>

<h3>Data Integrity</h3>
<p>Phase 1 unit/differential tests xác nhận kết quả search và regression local. Phase 2 chưa tạo/sửa dữ liệu staging và chưa chạy load, nên chưa có post-load reconciliation cho duplicate order/payment, inventory, debt, customer data hoặc tenant isolation. Trạng thái: <span class="status">NOT VERIFIED UNDER LOAD</span>.</p>

<h3>Remaining Risks</h3>
<ul><li>Thiếu test tenant, test users, test data và credential staging hợp lệ.</li><li>Staging PostgreSQL/Redis không tương đương datastore Firebase của client đang audit.</li><li>46 query collection theo công ty chưa phân trang/cursor hoặc aggregate.</li><li>Không có API/DB/Redis metrics dưới tải 100–1.000 users.</li><li>Không có soak, stress, recovery hoặc post-load integrity verification.</li><li>Không có Android thật/emulator; dropped frames, memory, CPU và startup native chưa đo.</li><li>Sample UI chỉ n=5 mỗi nhóm; tail percentiles bằng max, không đủ kết luận độ ổn định.</li></ul>

<h3>Final PASS/NOT PASS</h3><p class="status">NOT PASS.</p><p>Definition of Done còn thiếu full-load remediation, 500/750/1.000-user tests, tail latency/error/resource metrics, soak/stress/recovery, Android profiling và data-integrity verification. Không thể đưa production dựa trên Phase 2 hiện tại.</p>

<h3>10 Câu Hỏi Bắt Buộc</h3>
<ol>
<li><strong>HD Manager chịu được bao nhiêu concurrent users trước khi p95 vượt budget?</strong> Chưa xác định; không có authenticated realistic load hợp lệ.</li>
<li><strong>500 users có làm app/API/DB tăng latency đáng kể không?</strong> Chưa biết; 500 users NOT RUN.</li>
<li><strong>1.000 users có gây error/timeout không?</strong> Chưa biết; 1.000 users NOT RUN.</li>
<li><strong>Bottleneck đầu tiên ở đâu?</strong> Trong preview client, Giá bán/Bảng lương bị chi phối bởi render/compute; bottleneck toàn hệ thống chưa thể xếp hạng khi thiếu API/DB load.</li>
<li><strong>CPU, RAM, DB connection và network tại 1.000 users?</strong> UNMEASURED. Idle snapshot không đại diện cho 1.000 users.</li>
<li><strong>Module nào vẫn chậm nhất?</strong> Baseline 22 module CPU6x: ${escapeHtml(phase1SlowCpu[0]?.key.split('/')[1])} p50 ${fixed(phase1SlowCpu[0]?.p50)} ms; focused Phase 2 có Giá bán ${fixed(pricing?.p50)} ms và Bảng lương ${fixed(payroll?.p50)} ms. Chưa phải production latency.</li>
<li><strong>Collection/query nào vẫn nguy hiểm khi dữ liệu tăng?</strong> 46 company-wide queries trong bảng trên; payroll, orders, customers, payments, inventory/debt/history là ưu tiên cao.</li>
<li><strong>App có memory leak không?</strong> Chưa kết luận; soak test NOT RUN.</li>
<li><strong>Android thật có dropped frames/lag không?</strong> Chưa biết; không có thiết bị Android kết nối.</li>
<li><strong>Có thể đưa production chưa?</strong> Chưa. Blocker: credential/tenant staging chính thức, runtime parity, remediation 46 full loads, load 100–1.000, soak/stress/recovery, Android và integrity.</li>
</ol>

<h3>Evidence</h3>
<ul><li><code>test-results/phase2/staging-environment.json</code>: HTTP/SSH read-only environment evidence.</li><li><code>test-results/phase2/collection-inventory.json</code>: 48 collection/query rows.</li><li><code>test-results/full-interaction/phase2-client/</code>: 45 client samples, summary and CPU profiles.</li><li><code>test-results/phase2/cpu-profile-analysis.json</code>: parsed CPU self-time samples.</li></ul>
</section>
${PHASE2_END}`;

let report = await readFile(REPORT_PATH, 'utf8');
const existingStart = report.indexOf(PHASE2_START);
const existingEnd = report.indexOf(PHASE2_END);
if (existingStart >= 0 && existingEnd > existingStart) {
  report = `${report.slice(0, existingStart)}${report.slice(existingEnd + PHASE2_END.length)}`;
}
if (!report.includes('</main>')) throw new Error('Report does not contain </main>');
report = report.replace('</main>', `${phase2}\n</main>`);
await writeFile(REPORT_PATH, report);

const evidence = {
  generatedAt,
  commit,
  status: 'NOT PASS',
  collections: collections.totals,
  clientSamples: phase2Ui.samples,
  loadLevelsRun: [],
  blockers: ['valid staging test identity', 'isolated test tenant/data', 'Firebase/PostgreSQL runtime parity', 'Android device/emulator'],
};
await writeFile('test-results/phase2/audit-results.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ report: REPORT_PATH, status: evidence.status, clientSamples: evidence.clientSamples, collections: evidence.collections.collections }));
