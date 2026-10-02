import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const htmlPath = path.join(root, 'docs/reports/HD-Manager-Performance-Audit.html');
const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
const lines = app.split('\n');
const firstLine = text => lines.findIndex(line => line.includes(text)) + 1;
const collections = ['orders', 'orderRequests', 'warehouseDispatches', 'customers', 'products',
  'warehouseImports', 'warehouseStockCounts', 'pricingInputs', 'payrollSnapshots', 'payments',
  'expenses', 'financials', 'deliveryReports'];
const readModels = collections.map(collection => ({
  collection, cursorIntegrated: false,
  evidence: 'App.jsx does not import readTenantCursorPage; shared raw arrays remain active.',
  firstReferenceLine: firstLine(collection),
  nextStep: 'Separate paged display state from complete business aggregates, then wire server query filters and cursors.',
}));
const readJson = async filename => {
  try { return JSON.parse(await readFile(path.join(root, 'test-results/phase4b', filename), 'utf8')); }
  catch { return { status: 'UNVERIFIED' }; }
};
const backfill = await readJson('backfill-emulator.json');
const checks = await readJson('checks.json');
const blockers = [
  ['Inventory backfill', 'Legacy identifiers may be group names/default warehouse. No complete staging source export supplied. Balance key format was corrected to preserve identity.', 'Data owner: provide approved opening balances and explicit legacy-to-catalog mapping in an isolated staging export.', 'Run reconcile-inventory.cjs on the mapped export; review every mismatch and balance key migration before enabling a real staging writer.'],
  ['Reversal / amendment', `App.jsx:${firstLine('const handleEditWarehouseDispatch')} and ${firstLine('const handleDeleteWarehouseDispatch')} still use direct saveDataDocument; rules reject inventory mutations.`, 'Engineering: establish lifecycle constraints from linked orders, payment and delivery paths.', 'Implement transactional reversal/amend with immutable audit, version conflict checks and payment/delivery gates; wire UI after end-to-end tests.'],
  ['Read-model pagination', '13 critical collections still share complete client arrays. Cursor core is not integrated.', 'Engineering: extract per-screen read models and authoritative summaries.', 'Implement server filters/search and aggregate contracts per module before replacing full-load listeners.'],
  ['Server aggregates', 'No new server aggregate consumer is connected in App.jsx.', 'Engineering: define order, revenue, debt and inventory semantics including archived/paid/delivered states.', 'Test complete dataset totals against server aggregates, then connect paged screens.'],
  ['Runtime parity / credentials', 'Existing staging evidence is VPS PostgreSQL/Redis, while active client uses Firebase. No authenticated Firebase staging evidence.', 'Infrastructure owner: supply an isolated Firebase staging project and authorize its setup; provide credentials via secure local configuration.', 'Deploy only to that staging project, create test roles, verify Auth/Rules/Functions/Storage/jobs/notifications and capture evidence.'],
  ['Observability', 'Inventory endpoint now logs duration, operation ID, attempts and status; deployed trace and client/Firestore metrics remain unverified.', 'Engineering / infrastructure owner.', 'Verify correlation across staging client, HTTP endpoint, transaction and reconciliation; capture reads/writes/errors/cold starts.'],
];
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const evidence = { generatedAt: new Date().toISOString(), status: 'BLOCKED', backfillStatus: backfill.status,
  checks, readModels, blockers, loadTestRun: false, productionDeployed: false };
await mkdir(path.join(root, 'test-results/phase4b'), { recursive: true });
await writeFile(path.join(root, 'test-results/phase4b/readiness.json'), JSON.stringify(evidence, null, 2));
const section = `<!-- PHASE4B:START -->
<section id="phase-4b-audit"><h2>Phase 4B</h2>
<p>${escape(evidence.generatedAt)}. Partial implementation; readiness remains BLOCKED. No production deploy, inventory write, Android release change or user load test.</p>
<h3>Inventory backfill</h3><p>Emulator-only, demo-project guarded backfill. Per-balance transaction and deterministic receipts support chunks, interruption, resume and retry. It never overwrites an existing balance without a receipt and never creates inventory movements. Real staging backfill is NOT COMPLETE.</p>
<h3>Reconciliation</h3><p>Explicit tenant/warehouse/product/unit mapping, evidenced opening and ordered ledger chain are required. Reports missing, duplicate, orphan, negative, foreign-tenant and mismatched balances. Mismatches produce no automatic correction. Emulator fixture result: ${escape(backfill.status)}. Source hash and cutoff are recorded.</p>
<h3>Reversal</h3><p>BLOCKED: reconciliation accepts evidenced reversal records, but this is not a reversal workflow implementation. Payment/delivery lifecycle and server/UI contracts remain incomplete.</p>
<h3>Amendment</h3><p>BLOCKED: current direct client edits conflict with immutable inventory rules. No claim of amendment safety or completed end-to-end workflow.</p>
<h3>Read-model pagination</h3><p>BLOCKED: cursor primitive exists; the following consumers still need integration.</p>
<table><thead><tr><th>Collection</th><th>Source line</th><th>Status</th></tr></thead><tbody>${readModels.map(row => `<tr><td>${escape(row.collection)}</td><td>App.jsx:${row.firstReferenceLine}</td><td>NOT INTEGRATED</td></tr>`).join('')}</tbody></table>
<h3>Server aggregates</h3><p>BLOCKED: no aggregate computed from an incomplete page is presented as a dataset total. Existing full-load consumers remain; aggregate latency/query-count/payload are UNMEASURED.</p>
<h3>Runtime parity</h3><table><thead><tr><th>Capability</th><th>Production source</th><th>Staging evidence</th><th>Equivalent</th></tr></thead><tbody>${[
  ['Auth', 'Firebase custom-token Identity Center'], ['Firestore', 'Firebase SDK and listeners'],
  ['Functions', 'functions/index.js'], ['Storage', 'storage.rules and firebase.json; runtime coverage unverified'],
  ['Rules', 'firestore.rules'], ['API', 'Firebase HTTP endpoints'],
  ['Background jobs', 'Scheduled functions'], ['Notifications', 'Server notification integrations'],
].map(([name, source]) => `<tr><td>${escape(name)}</td><td>${escape(source)}</td><td>No equivalent authenticated Firebase staging evidence</td><td>UNVERIFIED</td></tr>`).join('')}</tbody></table>
<h3>Test tenant</h3><p>Local demo-phase4b fixtures are isolated synthetic inventory data. They do not establish staging owner/manager/employee/customer login, tokens or API authorization.</p>
<h3>Observability</h3><p>Inventory HTTP success logs include timestamp, hashed operation ID, duration, transaction attempts and replay status. Rejections log code and duration. No deployed end-to-end metrics or cold-start evidence yet.</p>
<h3>Data integrity</h3><p>Unit and emulator tests cover reconciliation and backfill. Full order → outbound → retry → reversal → reconciliation workflow remains BLOCKED.</p>
<h3>Regression</h3><pre>${escape(JSON.stringify(checks, null, 2))}</pre>
<h3>Load-test readiness</h3><p>LOAD TEST = BLOCKED. No 100–1,000-user load executed. Large read-model render/search/filter/scroll measurements remain UNMEASURED.</p>
<h3>Remaining Blockers</h3><table><thead><tr><th>Blocker</th><th>Evidence</th><th>Owner action required</th><th>Exact next step</th></tr></thead><tbody>${blockers.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>
<p class="status">BLOCKED</p></section><!-- PHASE4B:END -->`;
let html = await readFile(htmlPath, 'utf8');
const start = html.indexOf('<!-- PHASE4B:START -->');
if (start >= 0) {
  const end = html.indexOf('<!-- PHASE4B:END -->', start);
  if (end < 0) throw new Error('Incomplete Phase 4B section.');
  html = html.slice(0, start) + section + html.slice(end + '<!-- PHASE4B:END -->'.length);
} else html = html.replace('</main>', `${section}\n</main>`);
await writeFile(htmlPath, html);
console.log(JSON.stringify({ report: htmlPath, status: 'BLOCKED' }));
