import fs from 'node:fs/promises';

const phases = process.argv.slice(2);
const runs = await Promise.all(phases.map(async phase => ({ phase, ...JSON.parse(await fs.readFile(`test-results/full-interaction/${phase}/summary.json`, 'utf8')) })));
const names = {
  home: 'Trang chủ', executive_dashboard: 'Điều hành', order_requests: 'Lên đơn đặt hàng', orders: 'Đơn hàng',
  warehouse_dispatch: 'Xuất kho', warehouse_import: 'Nhập Xuất Tồn', delivery_reports: 'Báo cáo giao hàng',
  products: 'Kho sản phẩm', customers: 'Khách hàng', debt: 'Sổ nợ', finance: 'Thu chi', bank_payments: 'Ngân hàng',
  messages: 'Tin nhắn', pricing: 'Giá cả', company_attendance: 'Chấm công', employee_reviews: 'Đánh giá',
  asset_management: 'Quản lý tài sản', payroll: 'Bảng lương', employees: 'Nhân sự', price_quotes: 'Báo giá hàng loạt',
  settings: 'Cài đặt', role_permissions: 'Vai trò', billing: 'Gói cước',
};
const summaries = new Map(runs.flatMap(run => run.summary.map(row => [row.key, row])));
const profiles = ['cpu-high-1x', 'cpu-mid-3x', 'cpu-low-6x'];
const cell = key => summaries.has(key) ? Math.round(summaries.get(key).p50).toLocaleString('vi-VN') : 'Chưa đo';
const lines = [
  '# HD Manager 1.0.5 kiểm tra hiệu năng toàn bộ module',
  '',
  'Ngày 02/10/2026. Mã ứng dụng được đo: 5f162f5c. Không sửa mã nghiệp vụ, không ghi dữ liệu công ty, không deploy trong audit này.',
  '',
  '## Phạm vi và cách đọc',
  '',
  'Đo 22 mục trong menu Thêm và Trang chủ, tổng 23 màn hình. Đây là kiểm thử client có dữ liệu mẫu, không phải chứng nhận mọi luồng nghiệp vụ trên production.',
  'Chrome desktop headless; viewport 1366x900 ở CPU 1x, 390x844 ở CPU 3x và 6x. 1x là máy kiểm thử không giảm tốc; 3x/6x là giảm tốc CPU, không tương ứng một mẫu máy cụ thể. Khác viewport nên không quy toàn bộ chênh lệch cho CPU.',
  'React production profiling có overhead. Mỗi màn hình mở 5 lần; bảng dùng trung vị P50, không dùng P95 của 5 mẫu để suy rộng. Đồng hồ đo từ sự kiện tới UI kỳ vọng và hai requestAnimationFrame; không bao gồm xác nhận lưu của Firebase. CPU profile bao gồm cả đoạn tự động tìm/bấm phần tử trước sự kiện, nên self-time không được cộng hoặc quy thành tỷ lệ của thời gian tương tác.',
  'Dữ liệu thêm vào seed: 600 sản phẩm, 360 khách, 1.800 đơn hàng, 900 khoản thu, 4.500 đơn đặt, 4.300 phiếu xuất. Các module nhân sự, ngân hàng, tin nhắn, tài sản dùng seed ít dữ liệu; kết quả nhanh ở đó không chứng minh chịu tải lớn.',
  '',
  '## Thời gian mở màn hình',
  '',
  'Đơn vị ms. Chỉ đánh giá thao tác mở, không đại diện cho lưu hoặc mọi tab bên trong.',
  '',
  '| Module | CPU 1x | CPU 3x | CPU 6x |',
  '|---|---:|---:|---:|',
];
for (const [key, name] of Object.entries(names)) lines.push(`| ${name} | ${profiles.map(p => cell(`${p}/${key}/open`)).join(' | ')} |`);
lines.push('', '## Thao tác bên trong', '', 'Đơn vị ms, trung vị các mẫu thành công. Chưa đo hoặc timeout không được tính là nhanh. Lưu trong preview có chi phí JSON/localStorage của mock; không đồng nhất với lưu trên máy chủ.', '', '| Module và thao tác | CPU 1x | CPU 3x | CPU 6x |', '|---|---:|---:|---:|');
const actions = [...new Set([...summaries.keys()].map(key => key.split('/').slice(1).join('/')).filter(key => !key.endsWith('/open')))];
for (const action of actions) {
  const [module, command] = action.split('/');
  lines.push(`| ${names[module] || module}: ${command} | ${profiles.map(p => cell(`${p}/${action}`)).join(' | ')} |`);
}
lines.push('', '## Nguyên nhân có bằng chứng', '',
  '1. **Xuất kho và đơn đặt:** `src/App.jsx:10171` dựng lại đối chiếu đơn thiếu trên tập đơn/phiếu; `:10189` tạo nhiều biến thể khóa theo tên và ID. `:4775` chuẩn hóa Unicode và regex được gọi nhiều lần. CPU profile của mở/lưu xuất kho và tạo đơn đều thấy các hàm này là điểm nóng. Sau thay đổi dữ liệu, việc tổng hợp/dựng lại UI vẫn diễn ra trên main thread.',
  '2. **Báo cáo giao hàng:** `src/App.jsx:48470` giải quyết giá/đơn nguồn cho phiếu; `:48825` xử lý các phiếu để dựng bảng đối chiếu. `src/services/productPricingUnits.js:13,28` chuẩn hóa đơn vị, mỗi lần tìm lại qua các đơn vị chuẩn. CPU profile ghi nhận nhiều self-time ở chuẩn hóa tên, đơn vị và billing snapshot. Tập phiếu mẫu không có đầy đủ frozen pricing nên đi qua nhánh tương thích lịch sử; dữ liệu mới có snapshot có thể nhanh hơn.',
  '3. **Nhập Xuất Tồn:** `src/App.jsx:51953` tổng hợp tồn theo ngày, lọc và quét nhập/xuất; `:52471` gọi lại tổng hợp cho lịch sử theo ngày. Profile ghi nhận chuẩn hóa khóa nhóm/đơn vị và xử lý movement. Dữ liệu thử chủ yếu cùng ngày, chưa đại diện lịch sử nhiều năm.',
  '4. **Kho sản phẩm:** `src/App.jsx:43986` tính từng sản phẩm qua `productStockBalance`; `src/utils/productMeasures.js:21` quét toàn bộ nhập/xuất cho mỗi sản phẩm. Chi phí tăng theo số sản phẩm nhân số movement. Profile mở trang xác nhận các vòng filter/reduce này là điểm nóng. Có phân trang hiển thị nhưng phần tính tồn vẫn chạy trước đó.',
  '5. **Đơn đặt:** `src/App.jsx:59830` map đơn, mỗi đơn tìm khách và sản phẩm bằng `.find`, sau đó sort; `:59868` chuẩn bị nhãn so sánh, `:60381` tổng hợp bảng. Các hàm này xuất hiện trong CPU profile tạo đơn cùng các hàm đối chiếu. Đây là chi phí ngoài bản thân việc ghi một đơn.',
  '6. **Giá cả:** `src/App.jsx:36840` suy luận nhóm và `src/services/pricingEngineService.js:17` chuẩn hóa dữ liệu khi tổng hợp giá. Profile mở trang ghi nhận chi phí này. Lưu quy tắc có số đo chậm nhưng chưa tách riêng thời gian lưu và cập nhật lại toàn bộ state.',
  '7. **Lưu sản phẩm/khách hàng/áp dụng báo giá:** xác nhận chậm trong preview. Chưa đủ profile riêng để khẳng định chính xác tỷ trọng từng nguyên nhân ở production. Mock `src/mocks/firebase-firestore.js:61` serialize toàn bộ store và ghi localStorage; đây là chi phí của môi trường thử, không phải bằng chứng Firestore thực tế chậm. Không dùng các số này để kết luận server bị nghẽn.',
  '', '## Tác vụ nền cần kiểm chứng thêm', '',
  '- `src/App.jsx:17322`: tự sao lưu sau 45 giây trên web hoặc 5 phút native; có lịch idle nhưng không kiểm tra người dùng đang nhập xuất kho. Việc được gọi lúc idle không bảo đảm toàn bộ phần xử lý async sau đó không cạnh tranh CPU.',
  '- `src/App.jsx:15162,15249`: khi bật tích điểm, quét fingerprint đơn/thu/phiếu; lượt đầu gọi đồng bộ cho nhiều khách bằng `forEach` không có hàng đợi giới hạn tại vị trí gọi. Đây là rủi ro từ mã, chưa tái hiện bật tích điểm trên dữ liệu công ty.',
  '- `src/App.jsx:13105`: retry hàng đợi ghi mỗi 30 giây; `:14560`: REST fallback mỗi 5 phút web/12 phút native. Sự tồn tại của timer không chứng minh nó gây lag. Chưa chạy soak test nhiều giờ với backend thật.',
  '', '## Các trường hợp không đạt hoặc chưa đo xong', '',
  '- Lượt chính: sửa/tạo đơn đặt và lưu nhập kho ở CPU 6x vượt timeout thao tác 7 giây. Lượt bổ sung tăng timeout lên 30 giây để đo đầy đủ; không xóa chứng cứ timeout cũ.',
  '- Kịch bản Nhân sự cũ dùng selector không còn đúng; đã sửa selector nút hồ sơ. Không tính timeout selector thành lag ứng dụng.',
  '- Kịch bản ghi báo cáo giao hàng tìm ô tự nhập Loại hàng nhưng fixture có phiếu xuất liên kết, UI hiển thị các dòng giao thực tế. Chưa đo lưu báo cáo giao hàng trong trường hợp này; không đánh dấu PASS.',
  '- Ở viewport desktop, log tự động cho thấy thanh điều hướng dưới intercept pointer của nút thêm sản phẩm và thao tác khách hàng. Đây là lỗi tương tác trong môi trường thử, không phải số đo CPU; cần tái hiện UI riêng.',
  '', '## Giới hạn kết luận', '',
  'Không kết luận toàn bộ app mượt. Chưa đo xác nhận Firebase, mạng thật, nhiều người dùng đồng thời, gửi email/push, AI/Zalo, camera/PDF, khôi phục/sao lưu lớn, từng mục con Cài đặt và phiên sử dụng kéo dài. Các màn hình seed nhỏ không được chứng nhận tải lớn. Cuộn được đo bằng RAF lập trình trong 1,2 giây mỗi màn hình, không phải FPS compositor hoặc thao tác vuốt thiết bị thật.',
  '', '## Dữ liệu kiểm chứng', '',
);
for (const run of runs) lines.push(`- test-results/full-interaction/${run.phase}/: ${run.samples} mẫu thành công; ${run.failures.length} ca không hoàn tất; ${run.errors.length} pageerror. Xem summary.json, samples.json, observations.json và CPU profiles. Không cộng mẫu thành công thành số ca nghiệp vụ độc lập.`);
lines.push('', 'Ưu tiên xử lý: tạo/sửa đơn đặt; lưu xuất kho và đối chiếu đơn thiếu; tổng hợp/lưu nhập kho; tính tồn sản phẩm; đối chiếu giao hàng. Sau đó xác minh các luồng lưu khách hàng/báo giá bằng backend kiểm thử, rồi kiểm tra tác vụ nền. Giữ nguyên quy tắc số lượng, giá và công nợ trong mọi tối ưu.', '');
await fs.writeFile('docs/reports/FULL_APP_PERFORMANCE_105_2026_10_02.md', lines.join('\n'));
console.log(`Reported ${Object.keys(names).length} screens and ${actions.length} action types.`);
