import fs from 'node:fs/promises';
import path from 'node:path';

const input = 'test-results/performance-upgrade-20261103';
const output = 'performance/upgrade-20261103/reports/five-engines';
const read = async name => JSON.parse(await fs.readFile(path.join(input, name), 'utf8'));
const ab = await read('home-model-native-ab-v13-40-completed.json');
const cacheControl = await read('home-model-control-v11-cache-and-refresh.json');
const cachePilot = await read('home-model-v13-cache-and-refresh.json');
const integrity = await read('home-model-business-integrity-qualified.json');
const service = await read('home-model-native-service-02/status.json');
const master = await fs.readFile(path.join(input, 'home-model-v13-master-final.log'), 'utf8');
if (!/tests 999/.test(master) || !/pass 998/.test(master) || !/fail 0/.test(master)) throw new Error('Final regression evidence does not match');
if (ab.summary.control.eventUiMs.n !== 20 || ab.summary.pilot.eventUiMs.n !== 20) throw new Error('Incomplete native A/B');
const bundle = async cohort => {
  const identity = await read(`${cohort}/capacitor-build-identity.json`);
  const apkDir = path.join(input, cohort, 'capacitor-project/app/build/outputs/apk');
  const files = [];
  const walk = async dir => { for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(file);
    else if (ent.name.endsWith('.apk')) files.push({ file, bytes: (await fs.stat(file)).size });
  } };
  await walk(apkDir);
  return { cohort, builtAt: identity.at, assetBytes: identity.files.reduce((sum, file) => sum + file.bytes, 0), apks: files, identity: `${input}/${cohort}/capacitor-build-identity.json` };
};
const report = {
  at: new Date().toISOString(), status: 'NOT_PASS_SYSTEM_ACCEPTANCE',
  authorization: 'Local fictional Firebase Emulator prototype only; no production adoption or deployment.',
  production: { requests: 0, deploy: false, rulesChanged: false, migration: false },
  scope: 'Owner Home: four financial cards and primary line chart only. Detail and AI controls explicitly disabled in QA. Immutable fictional source, no production event bridge.',
  conditions: {
    device: 'Owned Pixel_4_2 emulator-5554, Android 10/API29, WebView74.0.3729.185, 2GiB/4vCPU, host GPU',
    timezone: 'Asia/Ho_Chi_Minh (browser Asia/Saigon); both controlled cohorts measured after the same explicit device timezone change.',
    fixture: '15704 fictional documents; demo-hdm-perf-verification / demo-hdm-home-projection-local',
    authentication: 'Local identity mock followed by real Firebase SDK/Auth Emulator. Production password verification, WAN and cold backend are not represented.',
    clock: 'Trusted login pointerdown to actual visible Home + enabled navigation / verified current financial source; mutation/rAF witness, two frames. Legacy 100ms sampled timings retained separately.',
    samples: '20 completed fresh-app-storage observations per variant; 43 attempts total with 3 preserved ADB setup/metadata timeouts before trusted login. Conditional completed observations, not uninterrupted reliability.',
    misses: 'All 20 pilot login observations published a new session-scoped model; not substituted with prepared-model hits. Local services were already running.',
    exclusions: 'Not app-icon cold start TTID/TTFD, physical-device acceptance, full-app or all-role performance, or persistent-cache restore.'
  },
  beforeAfter: ab.summary,
  ramCacheReturn: { control: cacheControl.summary, pilot: cachePilot.summary, qualification: '20 same-principal/session/day Home↔Customers returns per cohort. All retained first paints labelled pending; later current-source reconfirmation and exact money. Existing RAM cache only.' },
  bundle: { control: await bundle('after-home-model-control-v11'), pilot: await bundle('after-home-model-pilot-v13') },
  correctness: {
    exactOracle: { revenue: 120000000, expense: 7018800000, profit: -6898800000, receivables: 80000000 },
    native: 'Exact four-card oracle in all 40 completed login observations; current pilot denial hides financial UI and explicit logout returns to login. Injected denial, not a production Rules test.',
    sourceCorrection: 'Authoritative complete empty complaints must publish [] rather than retain null. Missing-input null suppressed payroll rewards. No salary formula changed; older v6–v9 expense/profit acceptance is disqualified.',
    sourceIntegrity: integrity.status,
    sourceIntegrityQualification: integrity.qualification,
    strictMismatchRetained: integrity.originalMismatchPreserved,
    cursor: 'Separate isolated synthetic cursor regression:107/107 fresh,106/106 resumed after insertion before cursor; exact original values/order,0 duplicate/tenant leak. Does not prove every legacy module uses pagination.'
  },
  diagnosis: {
    data: 'Existing primary client path waits for 13 complete history inputs and computes payroll/debt/report in the WebView. Local prototype reads a small versioned scope-bound projection calculated with the exact existing formulas outside the UI.',
    remainingUi: 'Pilot event UI P95 267.5ms >200ms; control258.3ms. No UI-startup gain demonstrated. Diagnostic custom-token boundary72.1ms includes49.7ms fetch,0.7ms JSON,19.1ms SDK completion; mapped samples show SDK waiting plus scattered React/startup work, no dominant business CPU loop proven.',
    longTasks: 'Pilot worst111.7ms vs control92.7ms. P95max-task96.5ms vs86.6ms. Not an all-interactions-under100ms PASS.',
    cpu: 'Owned Android-process CPU seconds only; excludes local Node projection server/JVM CPU. Work moved off device is not total-system CPU savings.',
    clockSkew: 'Prototype validates server time with bounded skew and conservative wall+monotonic expiry. Actual generatedAt is preserved, no silently extended stale cache.'
  },
  regression: { tests: 999, passed: 998, failed: 0, skipped: 1, lint: 'exit0; standard repository scope', typecheck: 'exit0', clientAndClock: '16 passed; actual WebView74 exercised', sourceReadiness: '4 passed' },
  remaining: {
    homeUi200ms: 'FAIL in this local cohort',
    criticalData3s: 'MET only for this owner/frozen-fictional local scenario (P95 993.4ms)',
    cache100ms: 'MET in measured same-session RAM-return cohort (P95 54.6ms); persistent restore NOT VERIFIED',
    allUi100ms: 'NOT VERIFIED; a111.7ms task remains',
    soakAndMemoryLeak: 'Latest v13 2-hour soak NOT VERIFIED. Lower startup PSS is not evidence of no leak.',
    macrobenchmark: 'Latest TTID/TTFD Android Macrobenchmark NOT VERIFIED; current diagnostic Capacitor APK/CDP startup harness is reported separately.',
    realLowEndDevice: 'BLOCKED: user has no suitable physical Android8–10 device.',
    productionAndRoles: 'NOT VERIFIED; no production event invalidation bridge or all-role projection implementation authorized/tested.'
  },
  rollback: 'Pilot is an explicit QA Vite transform only. Build without HD_VERIFICATION_HOME_MODEL_PILOT to restore current 13-source primary path; no production entry imported. Stop bounded loopback service; immutable demo-project generation/model may be removed only in that demo project. Preserve authorization/read-ownership/confirmed-empty fixes and evidence. No business-document rollback required.',
  service: { status: service.status, requests: service.requests, published: service.modelPublished, hits: service.modelReadHits, failures: service.failures },
  evidence: [
    'home-model-native-ab-v13-40-completed.json', 'home-model-v13-cache-and-refresh.json',
    'home-model-control-v11-cache-and-refresh.json', 'android-after-home-model-pilot-v13-denial-gate.json',
    'cpu-after-home-model-pilot-v13-auth-boundary-cpu-01-source-analysis.json',
    'home-model-business-source-unchanged.json', 'home-model-business-integrity-qualified.json',
    'home-model-v13-master-final.log', 'home-model-v13-typecheck-final.log', 'home-model-v13-lint-final.log'
  ].map(name => `${input}/${name}`)
};
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'home-model-final.json'), JSON.stringify(report, null, 2));
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const row = (label, key, unit = '') => `<tr><td>${label}</td><td>${report.beforeAfter.control[key].p95.toFixed(1)}${unit}</td><td>${report.beforeAfter.pilot[key].p95.toFixed(1)}${unit}</td></tr>`;
await fs.writeFile(path.join(output, 'home-model-final.html'), `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HD Manager — Local prototype verification</title><style>body{font:16px/1.6 system-ui;max-width:1120px;margin:32px auto;padding:0 24px;color:#173042;background:#f4f7fa}section{background:white;border:1px solid #dbe3eb;border-radius:16px;padding:22px;margin:18px 0}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #dbe3eb;padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere}.status{color:#a32727;font-weight:800}</style><h1>HD Manager — kiểm chứng prototype local</h1><p class="status">CHƯA PASS TOÀN HỆ THỐNG — UI P95 267,5 ms vượt mục tiêu200 ms.</p><p>20 lượt hoàn tất mỗi bản trên Android10 giả lập, dữ liệu giả;3 lần ADB gián đoạn được giữ trong bằng chứng. Không deploy Production.</p><section><h2>Đối chiếu P95</h2><table><tr><th>Chỉ số</th><th>Đối chứng</th><th>Prototype</th></tr>${row('Home UI','eventUiMs',' ms')}${row('Dữ liệu quan trọng','eventDataMs',' ms')}${row('PSS','pssKiB',' KiB')}${row('JS heap','jsHeapBytes',' bytes')}${row('CPU tiến trình Android','cpuSeconds',' s')}<tr><td>Trở lại Home bằng RAM cache</td><td>${cacheControl.summary.p95.toFixed(1)} ms</td><td>${cachePilot.summary.p95.toFixed(1)} ms</td></tr></table><p>Prototype chỉ gồm4 ô tài chính và biểu đồ chính của chủ doanh nghiệp. Nguồn dữ liệu giả cố định; chưa có cầu cập nhật nghiệp vụ Production. CPU backend không nằm trong số đo CPU Android.</p></section><section><h2>Kết quả và giới hạn đầy đủ</h2><pre>${esc(JSON.stringify(report, null, 2))}</pre></section></html>`);
const activePath = 'performance/upgrade-20261103/active-session.json';
const active = JSON.parse(await fs.readFile(activePath, 'utf8'));
Object.assign(active, { at: report.at, status: report.status, currentFrozenCandidate: 'after-home-model-pilot-v13', controlFrozenCandidate: 'after-home-model-control-v11', measurements: report.beforeAfter, sourceAfterFrozenBuild: 'No app-source change after v13 native A/B; reporting and diagnostic harness only.', currentWork: 'Local prototype verified within narrow scope; system acceptance remains NOT PASS. UI latency, current long-duration soak, physical device and production event bridge remain open.', reports: `${output}/home-model-final.html`, prototypeService: report.service });
await fs.writeFile(activePath, JSON.stringify(active, null, 2));
const proposalPath = 'performance/upgrade-20261103/proposals/home-priority-read-model.json';
const proposal = JSON.parse(await fs.readFile(proposalPath, 'utf8'));
proposal.status = 'LOCAL_FICTIONAL_PROTOTYPE_VERIFIED_NOT_PRODUCTION_ADOPTED';
proposal.latestEvidence = `${output}/home-model-final.json`;
proposal.correctedOracle = report.correctness.exactOracle;
proposal.historicalOracleQualification = 'Original proposal oracle omitted rewards because confirmed-empty complaints were retained as missing; do not use it for current financial acceptance.';
await fs.writeFile(proposalPath, JSON.stringify(proposal, null, 2));
console.log(JSON.stringify({ status: report.status, report: `${output}/home-model-final.html`, bundle: report.bundle }));
