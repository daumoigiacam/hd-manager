import { access, mkdir, writeFile } from 'node:fs/promises';
const evidenceRoot = 'test-results/firebase-device-readonly';
const screens = [
  ['home', 'Trang chu', 'home'], ['executive_dashboard', 'Dieu hanh', 'executive'],
  ['order_requests', 'Dat hang', 'requests'], ['orders', 'Don hang', 'orders'],
  ['warehouse_dispatch', 'Xuat kho', 'current'], ['warehouse_import', 'Nhap Xuat Ton', 'inventory'],
  ['delivery_reports', 'Giao hang', 'delivery'], ['products', 'Kho san pham', 'products'],
  ['customers', 'Khach hang', 'customers'], ['debt', 'So no', 'debt-verified'],
  ['finance', 'Thu chi', 'finance-verified'], ['bank_payments', 'Ngan hang', 'bank-verified'],
  ['messages', 'Tin nhan', 'messages'], ['pricing', 'Gia ca', 'pricing'],
  ['company_attendance', 'Cham cong', 'attendance'], ['employee_reviews', 'Danh gia', 'reviews'],
  ['asset_management', 'Tai san', 'assets-verified'], ['payroll', 'Bang luong', 'payroll'],
  ['employees', 'Nhan su', 'employees'], ['price_quotes', 'Bao gia hang loat', 'quotes'],
  ['settings', 'Cai dat', 'settings'], ['role_permissions', 'Vai tro', 'roles'],
  ['billing', 'Goi cuoc', 'billing'],
];
const rows = [];
for (const [module, label, file] of screens) {
  const evidence = `${evidenceRoot}/${file}.png`;
  await access(evidence);
  rows.push({ module, label, evidence, result: 'Screen visually observed after user login; NOT full business acceptance' });
}
const result = {
  date: '2026-10-13', status: 'PARTIAL PASS', device: 'Samsung SM-S938B / Android 16',
  application: { package: 'com.hdmanager.app', versionName: '1.0.6', versionCode: 26101101 },
  scope: 'Read-only navigation on installed production APK after user reported login. Owner role observed. Screens may contain cached data; no fresh server-response trace collected.',
  screens: rows,
  additional: ['Company information screen observed through owner profile entry.', 'Sync panel states no pending operations.', 'Returned to Home without signing out.'],
  findings: [
    'Installed version differs from 1.0.7 source/acceptance baseline: do not attribute measured preview timings or recent fixes to this APK.',
    'Dispatch search still shows an inner white box on this installed version.',
    'Billing screen shows a placeholder/information message, not evidence of functioning subscription checkout.',
  ],
  limitations: [
    'User performed login; password/biometric flow and login latency were not observed or measured.',
    'No deliberate create/update/delete/save/send/attendance mutation was performed. Application background behavior was not instrumented.',
    'Customer portal and non-owner roles not tested in the live session.',
    'AI request not sent; previous endpoint audit is separate evidence.',
    'CRUD, permissions enforcement, financial reconciliation, offline recovery, server ACK and concurrency remain unverified.',
    'UIAutomator exposed no WebView descendants and release remote debugging was unavailable; screenshots are not P95 latency measurements.',
  ],
};
const out = 'docs/reports/firebase-device-readonly-20261013';
await mkdir(out, { recursive: true });
await writeFile(`${out}/report.json`, JSON.stringify(result, null, 2));
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
await writeFile(`${out}/report.html`, `<!doctype html><html lang="vi"><meta charset="utf-8"><title>HD Manager Firebase session audit</title><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:32px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left}li{margin-bottom:8px}</style><h1>HD Manager: phiên thật trên S25 Ultra</h1><p>13/10/2026 — APK 1.0.6 (26101101). <strong>PARTIAL PASS</strong>.</p><p>Đã quan sát 23 màn hình chính sau khi người dùng đăng nhập. Chỉ xác nhận màn hình hiển thị, không chứng nhận toàn bộ nghiệp vụ hoặc dữ liệu vừa nhận từ Firebase.</p><table><tr><th>Module</th><th>Màn hình</th><th>Kết quả</th></tr>${rows.map(r => `<tr><td>${esc(r.module)}</td><td>${esc(r.label)}</td><td>Đã quan sát; nghiệp vụ đầy đủ chưa kiểm chứng</td></tr>`).join('')}</table><h2>Phát hiện</h2><ul>${result.findings.map(x => `<li>${esc(x)}</li>`).join('')}</ul><h2>Giới hạn</h2><ul>${result.limitations.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p>Ảnh dữ liệu thật chỉ lưu cục bộ trong test-results/firebase-device-readonly; không đưa ảnh vào báo cáo Git.</p></html>`);
console.log(JSON.stringify({ report: `${out}/report.html`, screens: rows.length }));
