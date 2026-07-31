# HD Manager Premium QA Report

**Ngày kiểm tra:** 2026-08-01
**Nhánh:** `codex/premium-phase-2-navigation`
**Commit nền:** `1d55e9e feat(ui): polish premium visual system`
**Phạm vi:** Phase 3.1-3.5, chỉ kiểm thử và xác nhận; không thay đổi nghiệp vụ, dữ liệu, Firebase, API, SePay, QR, webhook, phân quyền hoặc công thức.

## 1. Kết luận điều hành

Mã nguồn đạt các cổng build, regression, Design System và KPI tự động. Bản local và bundle production preview đều tải được, không có lỗi import/bundle/routing và không phát hiện lỗi console mới trên các màn hình đã mở.

Trạng thái phát hành hiện tại là **RELEASE CANDIDATE CÓ ĐIỀU KIỆN**, chưa phải Production Ready. Hai cổng bắt buộc chưa có bằng chứng đo thực tế:

1. Android/iPhone thật: FPS, RAM, CPU, ANR, crash, Safe Area, gesture và keyboard.
2. Safari/Firefox thật: hiển thị, thao tác, routing và console.

Ngoài ra, mô phỏng kiến trúc tải lớn vẫn ghi nhận full-collection realtime listeners và bundle React lớn là rủi ro mở rộng. Theo ràng buộc của Phase 3, các điểm này không được refactor lớn trong đợt QA này.

## 2. Visual QA

### Màn hình đã mở và kiểm tra trực tiếp

| Màn hình | Tải được | Tràn ngang 1280px | Console warn/error mới | Kết quả |
|---|---:|---:|---:|---|
| Dashboard / Tổng quan tài chính | Có | Không | 0 | PASS |
| Đơn hàng | Có | Không | 0 | PASS |
| Kho / Nhập Xuất Tồn | Có | Không | 0 | PASS |
| Khách hàng | Có | Không | 0 | PASS |
| Nhà cung cấp | Không có lối điều hướng độc lập; nghiệp vụ đang tích hợp trong Khách hàng/Nhập kho | - | - | CONDITIONAL |
| Công nợ / Sổ nợ | Có | Không | 0 | PASS |
| Thu/Chi | Có | Không | 0 | PASS |
| Nhân viên / Nhân sự | Có | Không | 0 | PASS |
| Báo cáo giao hàng | Có | Không | 0 | PASS |
| AI điều hành | Có | Không | 0 | PASS |
| Cài đặt | Có | Không | 0 | PASS |

Các kiểm tra gồm heading, vùng hiển thị, tràn ngang, phần tử vượt viewport, cấu trúc navigation thích ứng và console runtime. Không thực hiện thao tác ghi/xóa dữ liệu thật.

### Responsive shell

| Viewport | Navigation quan sát được | Tràn ngang | Kết quả |
|---|---|---:|---|
| 320x640 | Bottom Navigation 56px | Không | PASS |
| 390x844 | Bottom Navigation 65px | Không | PASS |
| 412x915 | Bottom Navigation 69px | Không | PASS |
| 768x1024 | Navigation Rail 80px | Không | PASS |
| 1024x768 | Navigation Rail 80px | Không | PASS |
| 1366x768 | Sidebar 288px | Không | PASS |
| 1920x1080 | Sidebar 288px | Không | PASS |

Safe Area được xác nhận trong mã nguồn qua `env(safe-area-inset-top/right/bottom/left)` tại AppShell, dialog và các lớp toàn màn hình. Trình duyệt desktop không mô phỏng chính xác Dynamic Island, notch hoặc Android gesture area, nên xác nhận vật lý vẫn PENDING.

## 3. UX QA

- Điều hướng thích ứng tự chuyển Bottom Navigation, Navigation Rail và Sidebar theo breakpoint.
- Các module chính có tên rõ và trạng thái active; không phát hiện nút điều hướng chết trong luồng đã thử.
- Hai mục `Báo cáo` cùng tồn tại theo hai ngữ cảnh điều hướng; bộ kiểm thử phải chọn theo vùng `Vận hành`. Đây là điểm có thể gây nhầm cho người dùng nhưng chưa sửa vì chưa xác nhận hai mục có cùng nghiệp vụ.
- `Nhà cung cấp` không có menu độc lập trong tài khoản kiểm thử; cần chủ sản phẩm xác nhận đây là thiết kế tích hợp hay thiếu đường dẫn trước khi thay đổi UI.
- Không mở popup ghi dữ liệu, không tạo/sửa/xóa đơn và không kích hoạt thanh toán thật trong QA an toàn này.

## 4. Performance QA

### Build production

| Chỉ số | Kết quả |
|---|---:|
| Vite | 7.3.6 |
| Modules transformed | 2,346 |
| Build time | 13.03 giây |
| Main JS | 2,100.52 kB; gzip 542.63 kB |
| CSS chính | 1,290.13 kB; gzip 123.30 kB |
| Bundle production preview | HTTP 200, trang đăng nhập tải được |

### KPI và stress

| Chỉ số | Kết quả | Trạng thái |
|---|---:|---|
| API thường mô phỏng | 85 ms | PASS |
| Mở màn hình mô phỏng | 12.41 ms | PASS |
| Cold-start kiến trúc | 350 ms | PASS |
| Event-loop local | 24.5-24.92 ms | PASS |
| Memory leak sau GC | 0; heap 4.1 MB | PASS |
| Crash/ANR/freeze mô phỏng | 0 | PASS |
| Peak RSS stress lớn | 233.3 MB | PASS mô phỏng |
| Dataset stress | 1,000 khách; 10,000 sản phẩm; 100,000 giao dịch; 5,000 đơn; 500 nhân viên; 100,000 thông báo/lịch sử/tồn | PASS |
| FPS ước tính Node | 8.4 | KHÔNG dùng để kết luận UI; cần GPU trace thật |

So với Phase 1, event-loop vẫn tương đương/tốt hơn mức sau tối ưu (24.9 ms trước đó, 24.5 ms lần này). Bundle tăng từ 2,093.51 kB lên 2,100.52 kB và CSS tăng từ 1,251.99 kB lên 1,290.13 kB sau các Phase giao diện; đây là mức tăng cần theo dõi trên thiết bị RAM 3 GB.

### Bottleneck còn tồn tại

1. Realtime listeners đang nghe rộng nhiều collection tại root.
2. REST fallback có thể đọc nhiều trang 1,000 bản ghi.
3. Webhook cũ còn fallback quét tối đa 2,000 đơn khi thiếu lookup field.
4. `src/App.jsx` gần 4 MB làm tăng parse/compile trên máy yếu.

Đây là rủi ro kiến trúc đã biết, không sửa trong Phase 3 vì người dùng cấm refactor lớn và thay đổi data flow.

## 5. Business Regression

| Phạm vi | Bằng chứng | Kết quả |
|---|---|---|
| Đơn hàng / AI Zalo | `test:ai-zalo-order` | PASS |
| Guardrail AI/Zalo | `test:ai-zalo` | PASS |
| Kho, công nợ, thanh toán | Stress suite 11,309 thao tác | PASS mô phỏng |
| SePay / QR / verify payment | Big stress API simulation 31-42 ms | PASS mô phỏng |
| Firebase / API / phân quyền | Không có thay đổi source trong Phase 3; màn hình theo quyền tải được | CONDITIONAL |
| Cloud Functions Node 22 | `node --check functions/index.js` | PASS |
| Webhook production thật | Không gửi giao dịch thật | PENDING |

Không có migration, ghi Firestore, thay đổi Rules, Firebase config, API contract hoặc business formula trong đợt QA.

## 6. Device và Browser QA

| Nền tảng | Trạng thái |
|---|---|
| Responsive desktop emulation 320-1920px | PASS |
| Chrome engine trong Browser QA | PASS |
| Edge thật | PENDING |
| Safari thật / iPhone | PENDING |
| Firefox thật | PENDING |
| Android RAM 3/4/6 GB | PENDING |
| iPhone Safe Area / gesture / keyboard | PENDING |

## 7. Các lệnh kiểm tra

- `npm run build`: PASS.
- `npm run test:all`: PASS.
- `npm run test:design-system`: PASS.
- `npm run test:kpi`: PASS, cảnh báo thiếu device log tùy chọn.
- `npm run test:performance`: hoàn thành, phát hiện 4 bottleneck kiến trúc.
- `npm run test:stress:big`: PASS, không crash/leak/freeze mô phỏng.
- `node --check functions/index.js`: PASS.
- `git diff --check`: PASS.
- Lint: **NOT AVAILABLE**, repository chưa có script lint; không tuyên bố PASS.

## 8. Lỗi đã sửa trong Phase 3

Không phát hiện lỗi UI/runtime xác nhận được cần sửa mã nguồn. Phase 3 chỉ thêm tài liệu nghiệm thu, không chỉnh Presentation Layer hoặc nghiệp vụ.

## 9. Quyết định cổng phát hành

**CHƯA ĐẠT đầy đủ Definition of Done.** Không push, merge, deploy VPS hoặc Foundation Freeze trong Phase 3 này vì còn thiếu lint và bằng chứng thiết bị/trình duyệt thật. Việc phát hành chỉ nên tiếp tục sau khi các cổng PENDING ở mục 6 được kiểm tra và không phát hiện lỗi nghiêm trọng.
