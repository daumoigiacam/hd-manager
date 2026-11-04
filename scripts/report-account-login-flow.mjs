import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='test-results/account-login-20261102';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const employee=await read(output+'/employee-1/result.json');
const customer=await read(output+'/customer-2/result.json');
const navigation=await read(output+'/employee-1/post-login-navigation/result.json');
const bootstrap=await read(output+'/diagnostics/bootstrap-availability.json');
const identity=await read('test-results/android10-startup-default-20261101/candidate-identity.json');
assert.equal(employee.phases.filter(e=>e.name==='auth.identity_login.started').length,1);
assert.equal(employee.state.roleGroup,'employee');assert.equal(employee.state.roleMatches,true);
assert.equal(customer.state.version,2);assert.equal(customer.state.roleGroup,'customer');
assert.equal(customer.state.roleMatches,true);assert.equal(customer.phases.filter(e=>e.name==='auth.identity_login.started').length,1);
assert.equal(bootstrap.status,404);assert.equal(bootstrap.deployedInListedFunctions,false);
const phase=(record,name)=>record.phases.find(e=>e.name===name)?.reportedStageDurationMs??null;
const rows=[employee,customer].map(record=>({account:record.account,samples:1,
 loginToShellMs:record.times.toShellMs,loginToAllRequiredDataAndTwoFramesMs:record.times.toTwoFramesAfterReadyMs,
 identityApiMs:phase(record,'auth.identity_login.api_completed'),firebaseCustomTokenMs:phase(record,'auth.identity_login.custom_token_completed'),
 earlierRetryAttemptsExcluded:record.state.attempts?.length??0,missingSources:record.state.missing,
 endReason:record.state.endReason,within200ms:record.times.toTwoFramesAfterReadyMs!==null?record.times.toTwoFramesAfterReadyMs<=200:
  record.times.toShellMs>200?false:null,
 assessment:record.status==='MEASURED_REAL_PASSWORD_LOGIN'?'MEASURED_ABOVE_TARGET':'DATA_READINESS_BLOCKED_NOT_ACCEPTED'}));
const result={at:new Date().toISOString(),localDate:new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Saigon',dateStyle:'short',timeStyle:'medium'}).format(new Date()),
 status:'NOT_ACCEPTED',maximumTargetMs:200,rows,bootstrap,
 device:{android:'10',api:'29',webview:'74',serial:'emulator-5554',packageName:'com.hdmanager.app.acceptance'},
 candidate:{apkSha256:identity.apkSha256,installedMatches:identity.installedMatches,sourceMapMatches:identity.sourceMapMatches,sourceCount:Object.keys(identity.sources).length},
 employeePostLoginNavigation:navigation.samples.map(s=>({module:s.module,inputToFeedbackMs:s.inputToFeedbackMs,inputToReadyMs:s.inputToReadyMs})),
 excludedDiagnostic:{file:'customer-1/result.json',reason:'Observer v1 mixed a failed submit and human retry interval, and requested private pricing sources with no customer transport. Retained as incomplete;26s is not reported as successful customer-login latency.'},
 evidence:{employee:'employee-1/result.json',customer:'customer-2/result.json',customerContract:'customer-2/armed.json',bootstrap:'diagnostics/bootstrap-availability.json',functionMetadata:'diagnostics/firebase-function-metadata.json',observerTests:'observer-tests.log'},
 limitations:['One successful employee account and one successful customer account; no P95 or every-account/device certification.',
 'The APK process and JS were already running. Timing starts at real trusted login input; excludes human typing and app-process cold start.',
 'Source readiness uses matching-tenant application confirmation flags and no busy/loading marker, then two RAF callbacks. Not compositor paint, INP, every Home action or server write ACK.',
 'Customer Home is visible, but catalogue bootstrap is absent and messages remain unconfirmed. Complete-data readiness is unmeasured, never zero or PASS.',
 'The current customer contract excludes pricingInputs/pricingRules because the actual App has no customer transport for them. No grants or data access were changed.',
 'A162ms post-login navigation sample does not establish162ms login; failed retries and human retry intervals are kept separately.',
 'Only measurement tooling/tests changed in this task. No production deploy, account/password/PIN/permission change or explicit business record save/delete by the harness. Normal login auditing/background app work may occur.']};
await fs.writeFile(output+'/comparison.json',JSON.stringify(result,null,2));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seconds=value=>Number.isFinite(value)?(value/1000).toFixed(2)+' giây':'Chưa xác nhận';
const table=rows.map(row=>`<tr><th>${row.account==='employee'?'Nhân viên':'Khách hàng'}</th><td>${seconds(row.loginToShellMs)}</td><td>${seconds(row.loginToAllRequiredDataAndTwoFramesMs)}</td><td>Chưa đạt</td></tr>`).join('');
const html=`<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HD Manager — Đo đăng nhập</title><style>body{font:16px/1.65 system-ui;color:#18324b;background:#f4f7fb;margin:0}main{max-width:960px;margin:auto;padding:24px}section{padding:22px;border:1px solid #dce5ef;background:white;border-radius:16px;margin:18px 0}h1{font-size:27px;line-height:1.3}h2{font-size:20px}.fail{color:#ad223c;font-weight:750}.table{overflow:auto}table{width:100%;border-collapse:collapse;min-width:560px}td,th{text-align:left;padding:13px;border-bottom:1px solid #e2e8f0}thead{background:#eef3fb}code{overflow-wrap:anywhere}a{color:#175eb4}@media(max-width:600px){main{padding:14px}section{padding:15px}h1{font-size:24px}}</style><main><h1>HD Manager — Đăng nhập đến Trang chủ</h1><p>${escape(result.localDate)} · Android 10 / WebView 74</p><p class="fail">CHƯA ĐẠT MỤC TIÊU 100–200 MS</p><section><h2>Kết quả tài khoản thật</h2><div class="table"><table><thead><tr><th>Tài khoản</th><th>Hiện Trang chủ</th><th>Đủ nguồn dữ liệu + hai frame</th><th>Mốc 200 ms</th></tr></thead><tbody>${table}</tbody></table></div><p>Tính từ thao tác bấm đăng nhập thật, sau khi nhập xong thông tin. Một tài khoản mỗi loại; không phải P95, không đại diện mọi thiết bị. Tiến trình APK đã mở sẵn.</p><p>Lượt khách hàng thành công gần nhất đã tách ${rows[1].earlierRetryAttemptsExcluded} lần thử trước. Không cộng khoảng chờ nhập lại mật khẩu vào4,35giây.</p></section><section><h2>Thời gian xác thực</h2><p>Nhân viên: API đăng nhập ${seconds(rows[0].identityApiMs)}, Firebase custom-token ${seconds(rows[0].firebaseCustomTokenMs)}.</p><p>Khách hàng: API đăng nhập ${seconds(rows[1].identityApiMs)}, Firebase custom-token ${seconds(rows[1].firebaseCustomTokenMs)}.</p><p>Thao tác quay về Trang chủ nhân viên sau khi có dữ liệu: ${navigation.samples[0].inputToFeedbackMs.toFixed(1)} ms, một mẫu. Số này không thay thế thời gian đăng nhập và tải dữ liệu.</p></section><section><h2 class="fail">Blocker của khách hàng</h2><p>API <code>customerPortalBootstrap</code> trả HTTP404 cho CORS preflight; danh sách Functions đọc từ Firebase cũng không có hàm này. Chưa triển khai hay thay đổi dịch vụ cloud.</p><p>Các nguồn chưa xác nhận: ${escape(customer.state.missing.join(', '))}. Catalog4nguồn gắn với bootstrap; trạng thái messages cần kiểm tra riêng, không tự gán chung nguyên nhân.</p><p>Thời gian đủ dữ liệu của khách hàng được giữ là chưa đo được. Không dùng giao diện có sẵn hoặc nguồn cũ để báo0ms/PASS.</p></section><section><h2>Bằng chứng</h2><p>APK SHA256: <code>${escape(identity.apkSha256)}</code>. ${Object.keys(identity.sources).length} nguồn khớp source map; APK đang cài khớp artifact.</p><p><a href="comparison.json">So sánh máy đọc</a> · <a href="employee-1/result.json">Nhân viên</a> · <a href="customer-2/result.json">Khách hàng</a> · <a href="customer-1/result.json">Lượt chẩn đoán không hợp lệ</a> · <a href="diagnostics/bootstrap-availability.json">API404</a> · <a href="diagnostics/firebase-function-metadata.json">Functions metadata</a> · <a href="observer-tests.log">Kiểm thử bộ đo</a></p><p>Bộ đo lưu thời gian, tên nguồn và trạng thái; không thu số điện thoại, mật khẩu, token hoặc nội dung chứng từ. Không phát hành production.</p></section></main></html>`;
await fs.writeFile(output+'/report.html',html);console.log(JSON.stringify({output,status:result.status,rows}));
