import { readFile, mkdir, writeFile } from 'node:fs/promises';

const run = 'test-results/full-interaction/recovery-001-s25-all-modules-usb';
const inventory = JSON.parse(await readFile('test-results/module-source-inventory.json', 'utf8'));
const evidence = JSON.parse(await readFile(`${run}/summary.json`, 'utf8'));
const samples = JSON.parse(await readFile(`${run}/samples.json`, 'utf8'));
const keys = [...new Set(inventory.modules.flatMap(module => [module.key, ...(module.aliases || [])]))];
const rows = keys.map(key => {
  const measured = samples.filter(sample => sample.module === key && sample.action === 'open');
  return { module: key, openSamples: measured.length,
    navigation: measured.length >= 5 ? 'PASS (isolated UI only)' : 'NOT VERIFIED',
    businessAcceptance: 'NOT VERIFIED',
    evidence: run,
  };
});
for (const [module, status, note] of [
  ['Login / recovery', 'PARTIAL PASS', 'UI validation, password visibility and recovery navigation passed on physical S25 and browser with no-session preview APK. Evidence: test-results/perf-recovery-001/login-isolated-native/results.json. Firebase authentication and biometric login not verified.'],
  ['Employee home / role resolution', 'PARTIAL PASS', 'Four browser cases passed: missing profile, sales, driver, production. Not Firebase role enforcement.'],
  ['Profile', 'NOT VERIFIED', 'Separate profile screen; not covered by main navigation suite.'],
  ['Customer portal', 'NOT VERIFIED', 'Separate customer login, home, orders, debt, payments, bank, points and messages require dedicated coverage.'],
  ['AI assistant', 'BLOCKED', 'Prior backend audit found missing geminiGenerateContent endpoint. No live AI request made.'],
  ['More menu', 'PARTIAL PASS', 'Used during navigation; not a separate business module.'],
]) rows.push({ module, navigation: status, businessAcceptance: 'NOT VERIFIED', note });
const result = { status: 'PARTIAL PASS', scope: 'Physical S25 Ultra; isolated preview APK, synthetic local data. Not production Firebase E2E.',
  rows, failures: evidence.failures, errors: evidence.errors,
  limitations: ['Five samples per main route are a smoke baseline, not a complete performance certification.',
    'Product screenshot timed out; preserve failed run status even though measured actions completed.',
    'Earlier native run blocked by screen lock; subsequent attempt disconnected. Neither is evidence of an application crash.',
    'Earlier web action run incomplete after browser closure; no complete action-suite PASS claimed.',
    'CRUD, offline, concurrency, server ACK, permissions, restart and long-duration memory tests remain incomplete per module.',
    'No production writes, deployment or source application changes performed.'] };
const out = 'docs/reports/module-coverage-20261013';
await mkdir(out, { recursive: true });
await writeFile(`${out}/coverage.json`, JSON.stringify(result, null, 2));
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
await writeFile(`${out}/report.html`, `<!doctype html><html lang="vi"><meta charset="utf-8"><title>HD Manager module coverage</title><style>body{font:16px/1.5 system-ui;margin:32px auto;max-width:1200px;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left}pre{white-space:pre-wrap}</style><h1>HD Manager: kiểm tra module 13/10/2026</h1><p><strong>PARTIAL PASS. Chưa chứng nhận toàn bộ ứng dụng.</strong></p><p>${esc(result.scope)}</p><table><thead><tr><th>Module</th><th>Số lần mở</th><th>Điều hướng / UI</th><th>Nghiệp vụ đầy đủ</th><th>Ghi chú</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.module)}</td><td>${esc(row.openSamples)}</td><td>${esc(row.navigation)}</td><td>${esc(row.businessAcceptance)}</td><td>${esc(row.note)}</td></tr>`).join('')}</tbody></table><h2>Giới hạn và phần còn lại</h2><ul>${result.limitations.map(text => `<li>${esc(text)}</li>`).join('')}</ul><h2>Lỗi kiểm thử cần giữ lại</h2><pre>${esc(JSON.stringify(result.failures, null, 2))}</pre></html>`);
console.log(JSON.stringify({ report: `${out}/report.html`, modules: rows.length, samples: samples.length }));
