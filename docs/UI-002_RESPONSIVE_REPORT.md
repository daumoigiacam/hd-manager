# Sprint UI-002 - Global Responsive Design System

**Ngày kiểm tra:** 31/07/2026
**Phạm vi:** React + Vite + Capacitor + Electron của HD Manager
**Nguyên tắc bảo toàn:** Không thay đổi Firestore, Firebase Authentication, SePay, webhook, API contract, dữ liệu hoặc logic nghiệp vụ.

## 1. Tóm tắt

Đã bổ sung một lớp Design System responsive dùng chung trên lớp vỏ ứng dụng hiện có. Cách triển khai giữ nguyên các selector nghiệp vụ và các cơ chế safe-area đã có, chỉ thêm token và hook CSS/JSX để chuẩn hóa shell, header, navigation, dialog, card, form, button và table.

## 2. Các màn hình/lớp đã chuẩn hóa

- App shell dùng chung: vùng nội dung, safe-area, chiều cao viewport động và giới hạn chiều rộng.
- Header nghiệp vụ: màn hình đơn hàng, nhập xuất tồn, bảng lương, báo cáo và các màn hình dùng `renderHeader()`.
- Bottom navigation trên mobile/tablet và sidebar trên desktop.
- Sidebar desktop: chiều rộng dùng token, nội dung chính tự chừa vùng sidebar, không bị che.
- Ba surface dialog chính: đăng nhập, tạo lệnh ứng và trung tâm thông báo.
- Fallback dialog toàn cục cho các overlay `fixed inset-0`: giới hạn chiều cao theo vùng hiển thị và cuộn độc lập.
- Card, button, form control và data table: bán kính, vùng bấm, chuyển động, đường viền và căn chỉnh dùng token chung.
- Layout nội dung: `minmax(0, 1fr)`, padding responsive và không tràn ngang.

## 3. Design Tokens

Các token được thêm trong `src/index.css`:

- Spacing: `--hd-space-1` đến `--hd-space-7`.
- Radius: `--hd-radius-sm`, `md`, `lg`, `xl`, `pill`.
- Elevation: `--hd-elevation-1` đến `--hd-elevation-3`.
- Typography/interaction: vùng bấm tối thiểu `44px`, chuyển động `150-250ms`.
- Breakpoint: mobile `<600px`, tablet `600-1099px`, desktop `>=1100px`.
- Header: mobile `56px`, tablet `60px`, desktop `64px`.
- Bottom navigation: mobile `56px` cơ sở, tablet `64px` cơ sở, cộng safe-area khi hệ điều hành yêu cầu.
- Sidebar desktop: `18rem` và được dùng đồng nhất cho grid nội dung, modal và navigation.
- Dialog: tối đa `90dvh`, header/footer cố định theo cấu trúc surface, body cuộn độc lập.

## 4. Safe Area và nền tảng

- Giữ nguyên `installResponsiveViewportVars()` trong `src/main.jsx`.
- Giữ nguyên việc đọc `env(safe-area-inset-*)`, `visualViewport`, `dvh/dvw` và fallback native đã có.
- Header và bottom navigation sử dụng safe-area thay vì ghi đè status bar, camera/Dynamic Island hoặc navigation gesture area.
- Không thay đổi thanh trạng thái, thanh điều hướng hoặc UI hệ điều hành.

## 5. Kiểm thử responsive

Đã chạy smoke test trên browser local với các kích thước:

`320x800`, `360x800`, `375x800`, `390x844`, `412x915`, `430x932`, `600x800`, `768x1024`, `1024x768`, `1280x800`, `1440x900`, `1920x1080`.

Đã kiểm tra thêm landscape: `390x844`, `768x600`, `1280x720`.

Kết quả:

- Không phát hiện `body` hoặc `document` bị tràn ngang trong ma trận trên.
- Mobile/tablet dùng bottom navigation; desktop từ `1100px` dùng sidebar.
- Desktop đo được vùng nội dung bắt đầu sau sidebar: tại viewport `1280px`, content bắt đầu khoảng `305px`, không bị sidebar che.
- Header trên màn hình nghiệp vụ tại viewport `390x844` đo được `56px` đúng token.
- Shell giữ chiều cao theo viewport động, không dùng `100vh` cứng cho vùng hiển thị chính.
- Dialog/overlay có giới hạn chiều cao theo vùng safe-area và có vùng cuộn.

## 6. Build và kiểm tra kỹ thuật

Lệnh đã chạy:

```text
git diff --check
npm run build
```

Kết quả:

- `git diff --check`: PASS.
- `npm run build`: PASS.
- Vite: `2337 modules transformed`.
- Thời gian build lần audit đầu: khoảng `48.99s`; build xác nhận cuối sau khi hoàn thiện dialog: khoảng `9.14s`.
- Build không phát hiện lỗi import/runtime compile mới.
- `npm run test:all`: PASS; AI/Zalo guardrails, AI/Zalo order request và stress suite đều đạt.
- Stress suite đã thực hiện `11.309` thao tác và PASS.

Build vẫn in một cảnh báo CSS legacy từ bundle minifier (`Expected identifier but found "-"` tại generated stdin). Cảnh báo này không làm build fail và không thuộc phần token responsive mới; cần xử lý riêng nếu muốn đạt mục tiêu cảnh báo bằng 0.

## 7. Các file thay đổi

- `src/App.jsx`: gắn hook class dùng chung cho app shell, header, content, navigation, sidebar và các dialog chính; không thay đổi dữ liệu hay hàm nghiệp vụ.
- `src/index.css`: bổ sung token và lớp responsive UI-002; giữ nguyên lớp safe-area/viewport hiện có.
- `docs/UI-002_RESPONSIVE_REPORT.md`: báo cáo này.

## 8. Ngoại lệ còn lại

1. `src/App.jsx` vẫn là file nghiệp vụ rất lớn và còn nhiều class Tailwind/kích thước inline legacy. Chưa chuyển toàn bộ sang token vì việc đó có thể làm thay đổi bố cục nghiệp vụ ngoài phạm vi Sprint.
2. Một số dialog nghiệp vụ cũ chưa gắn class `hd-dialog-surface`; chúng vẫn được bảo vệ bởi fallback overlay toàn cục nhưng chưa có cấu trúc semantic header/body/footer hoàn toàn đồng nhất.
3. Chưa thể xác nhận FPS, RAM, GPU, ANR hoặc safe-area thực tế trên mọi mẫu Android/iPhone/iPad chỉ bằng browser local.
4. Cần chạy thêm QA trên thiết bị thật ở chế độ dọc/ngang, bàn phím mở, notch/Dynamic Island, PWA standalone và Electron.
5. Cảnh báo CSS legacy nêu ở mục 6 vẫn còn.

## 9. Kết luận nghiệm thu Sprint

Phần responsive shell và Design System dùng chung đã được triển khai, build production PASS và không phát hiện tràn ngang trong ma trận browser đã nêu. Các chức năng dữ liệu, thanh toán, Firebase, webhook, phân quyền và nghiệp vụ không bị thay đổi trong Sprint này.

Trạng thái: **PASS trong phạm vi kiểm thử browser local; cần QA thiết bị thật trước khi phát hành production chính thức.**
