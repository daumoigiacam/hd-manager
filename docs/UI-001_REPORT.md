# Sprint UI-001.1 - Final Validation & UI Stabilization

**Ngày kiểm tra:** 31/07/2026
**Phạm vi:** Chỉ ổn định UI/Layout và lỗi render; không thay đổi dữ liệu, nghiệp vụ, công thức, Firebase, API, Authentication, Permission, SePay, QR hoặc Webhook.

## 1. Phạm vi màn hình đã rà soát

Đã rà soát cấu trúc JSX/CSS và các lớp giao diện dùng chung cho:

- Đăng nhập, tạo công ty, quên mật khẩu.
- Trang chủ/Dashboard, doanh thu, tổng quan và các thẻ báo cáo.
- Khách hàng, nhà cung cấp, sản phẩm và bảng giá.
- Đơn hàng, đơn đặt hàng, nhập kho, xuất kho, nhập-xuất-tồn.
- Công nợ, thu-chi, ngân hàng/thanh toán và QR.
- Nhân sự, chấm công, bảng lương, ứng lương, đánh giá.
- Tài xế, báo cáo giao hàng, bản đồ và điều phối.
- Cài đặt, vai trò, sao lưu/khôi phục, thông báo và tin nhắn.
- Các lớp modal/dialog/form/overlay, bộ chọn, menu, drawer và màn hình chi tiết đơn.

Các màn hình nghiệp vụ sau đăng nhập được rà soát tĩnh qua component, class layout và CSS dùng chung. Chưa thể mở toàn bộ màn hình có dữ liệu thật trong trình duyệt kiểm thử vì môi trường hiện tại không có phiên đăng nhập của người dùng.

## 2. Lỗi phát hiện và đã sửa

### UI-001-01 - Nội dung cuộn có thể bị co hoặc bị footer che

- **Mức độ:** High
- **Nguyên nhân:** Vùng `main` trong flex shell chưa khóa `min-height: 0`; footer/modal có thể chiếm không gian nhưng vùng nội dung không tự co và chừa vùng cuộn.
- **Đã sửa:** Thêm quy tắc UI-only cho `.hd-app-shell > main`, `.customer-portal-main` và vùng nội dung detail: `min-height: 0`, `min-width: 0`, `scroll-padding`, `overflow-y` và khoảng đệm cuối theo footer/bàn phím.
- **Ảnh hưởng:** Giảm nguy cơ nút cuối form, danh sách và nội dung detail bị nằm dưới bottom navigation.
- **File:** `src/index.css` phần Sprint UI-001.

### UI-001-02 - Modal/dialog không có giới hạn viewport thống nhất

- **Mức độ:** High
- **Nguyên nhân:** Các overlay dùng nhiều kiểu panel khác nhau; một số panel có thể cao hơn vùng hiển thị khi bàn phím hoặc safe-area xuất hiện.
- **Đã sửa:** Giới hạn panel overlay theo `--hd-viewport-height`, bật overscroll containment và giữ footer dialog sticky khi dialog có footer chuẩn.
- **Ảnh hưởng:** Body dialog tiếp tục cuộn được, nút lưu/hủy dễ tiếp cận hơn trên màn hình nhỏ.
- **File:** `src/index.css` phần Sprint UI-001.

### UI-001-03 - Overlay detail toàn màn hình có nguy cơ cộng safe-area hai lần

- **Mức độ:** Medium
- **Nguyên nhân:** Lớp detail đã có header safe-area riêng nhưng overlay bao ngoài tiếp tục áp dụng padding.
- **Đã sửa:** Chỉ trong lớp trình bày, reset padding của `.hd-order-detail-layer`/`.hd-fullscreen-layer` và chuyển phần cuộn về vùng `main`/`section` bên trong.
- **Ảnh hưởng:** Giảm khoảng trắng bất thường và tránh header/nội dung bị đẩy quá thấp.
- **File:** `src/index.css` phần Sprint UI-001.

### UI-001-04 - React key trùng `detail_undefined` ở dữ liệu cũ

- **Mức độ:** High
- **Nguyên nhân:** Một số bản ghi cũ không có `order.id`, khiến nhiều card render cùng key `detail_undefined`; React có thể bỏ sót hoặc nhân đôi phần tử khi cập nhật.
- **Đã sửa:** Key render có fallback ổn định theo `_id`, `orderId`, loại bản ghi legacy và vị trí trong danh sách. Đây chỉ là nhận diện phần tử render, không sửa dữ liệu hay logic nghiệp vụ.
- **Ảnh hưởng:** Giảm lỗi render card trùng/mất và cảnh báo React.
- **File:** `src/App.jsx:61451`.

## 3. Thay đổi trong Sprint UI-001

- `src/index.css`: thêm lớp ổn định layout ở cuối file, không thay đổi selector nghiệp vụ hoặc dữ liệu.
- `src/App.jsx:61451`: sửa key React để xử lý bản ghi thiếu id.
- `docs/UI-001_REPORT.md`: báo cáo này.
- Không xóa file, không đổi package, không đổi schema, không đổi Firebase/API/SePay/QR/Webhook.

> **Lưu ý working tree:** Trước Sprint UI-001, `src/App.jsx`, `src/index.css` đã có thay đổi chưa commit và `docs/UI-002_RESPONSIVE_REPORT.md` đã tồn tại trong working tree. Sprint này không hoàn tác hoặc sửa lại các thay đổi đó ngoài hai điểm UI-001 nêu trên.

## 4. Kiểm thử viewport

Kiểm thử bằng trình duyệt local với URL `http://localhost:5173/`, kiểm tra `documentElement.scrollWidth`, `body.scrollWidth` và trạng thái overflow ngang. Kết quả tất cả đều **PASS** ở màn hình đăng nhập chưa xác thực:

| Thiết bị đại diện | Viewport | Tràn ngang | Console mới |
|---|---:|---:|---:|
| Android nhỏ | 320x800 | PASS | PASS |
| Android | 360x800 | PASS | PASS |
| iPhone 13 | 390x844 | PASS | PASS |
| iPhone 15 Pro | 412x915 | PASS | PASS |
| Tablet | 768x1024 | PASS | PASS |
| Tablet landscape | 1024x768 | PASS | PASS |
| Desktop | 1366x768 | PASS | PASS |
| Desktop lớn | 1920x1080 | PASS | PASS |

Các kích thước được kiểm tra ở trên bao phủ nhóm kích thước bắt buộc 320, 360, 390, 412, 768, 1024, 1366 và 1920px. iPhone SE dùng nhóm 320px; iPhone 13 dùng nhóm 390px; iPhone 15 Pro dùng nhóm 412px.

**Giới hạn:** Đây là kiểm thử viewport bằng Chromium, không phải đo trên thiết bị Android/iPhone thật. Safe-area thật, Dynamic Island, bàn phím hệ điều hành, gesture navigation, camera hole và hiệu năng cuộn trên thiết bị thật cần QA thêm bằng APK/PWA thực tế.

## 5. Build và test (kết quả baseline UI-001; kết quả cuối ở §8.3)

- `npm run build`: **PASS**
  - Vite 7.3.6.
  - 2337 modules transformed.
  - Thời gian build lần kiểm tra: khoảng 11 giây.
- `npm run test:all`: **PASS**
  - AI Zalo Assistant guardrails: PASS.
  - AI Zalo order request: PASS.
  - HD Manager stress suite: PASS, 11.309 operations.
- `git diff --check`: **PASS**.
- Console của tab local mới sau bản sửa key: **không có error/warning**.
- `npm run lint`: **CHƯA CẤU HÌNH**; `package.json` không có script `lint` và repository không có ESLint script tương ứng. Không tự thêm package/lệnh vì ngoài phạm vi UI-001.

Ở bản baseline, build từng in một cảnh báo CSS minify từ bundle:

```text
[esbuild css minify] Expected identifier but found "-"
<stdin>:10344:2: -: •|;
```

Cảnh báo này đã được xử lý trong xác nhận UI-001.1 bằng cách viết lại biểu thức regex tương đương ở phần preview tin nhắn; không thay đổi kết quả hiển thị.

## 6. Các lỗi còn tồn tại / chưa thể nghiệm thu hoàn toàn

1. Chưa có script lint nên tiêu chí `Lint PASS` chưa đạt về mặt tự động hóa.
2. Chưa kiểm thử được các màn hình sau đăng nhập bằng dữ liệu thật trong phiên trình duyệt hiện tại.
3. Chưa chạy trên thiết bị Android/iPhone/tablet vật lý; chưa thể xác nhận tuyệt đối safe-area, bàn phím, GPU/FPS và crash native.
4. Không còn cảnh báo CSS minify ở bản build cuối; các giới hạn QA thiết bị thật vẫn còn.
5. Chưa có bộ screenshot tự động cho toàn bộ modal/form/drawer; cần QA trực quan bổ sung trước khi gọi Sprint hoàn tất tuyệt đối.

## 7. Kết luận Sprint UI-001 (baseline)

**Trạng thái baseline: ĐÃ SỬA VÀ KIỂM TRA PHẦN UI CÓ THỂ XÁC NHẬN TRONG MÔI TRƯỜNG HIỆN TẠI. Nghiệm thu cuối Sprint UI-001.1 được ghi tại §8.**

Các thay đổi Sprint UI-001 chỉ nằm ở lớp render/layout và không thay đổi nghiệp vụ, dữ liệu hay tích hợp. Các điều kiện lint, thiết bị thật và màn hình xác thực được nêu rõ trong phần rủi ro của báo cáo cuối.

---

## 8. Xác nhận Sprint UI-001.1

### 8.1 Phạm vi QA cuối

Đã rà soát lại các nhóm màn hình và lớp giao diện sau: đăng nhập/tạo công ty/quên mật khẩu; Dashboard; khách hàng/nhà cung cấp/sản phẩm; đơn hàng/đơn đặt/nhập kho/xuất kho/nhập-xuất-tồn; công nợ/thu-chi/ngân hàng-thanh toán; nhân sự/chấm công/bảng lương/ứng lương/đánh giá; tài xế/báo cáo giao hàng/bản đồ; cài đặt/vai trò/sao lưu-khôi phục; hồ sơ; thông báo/tin nhắn; AI; cùng các modal, dialog, bottom sheet, drawer, menu, form và màn hình chi tiết dùng chung.

Kết quả rà soát tĩnh: không phát hiện thêm lỗi UI cần sửa ngoài các lỗi UI-001-01 đến UI-001-04. Không thay đổi logic nghiệp vụ, dữ liệu, công thức hoặc tích hợp.

### 8.2 Responsive validation cuối

Kiểm tra bằng Chromium local tại `http://localhost:5173/` với kiểm tra `scrollWidth`, phần tử vượt viewport và console:

| Viewport | Hướng | Tràn ngang | Console error/warning mới | Kết quả |
|---:|---|---|---|---|
| 320x800 | Dọc | Không | Không | PASS |
| 800x320 | Ngang | Không | Không | PASS; nội dung cuộn theo chiều dọc |
| 390x844 | Dọc | Không | Không | PASS |
| 844x390 | Ngang | Không | Không | PASS; nội dung cuộn theo chiều dọc |
| 768x1024 | Dọc | Không | Không | PASS |
| 1024x768 | Ngang | Không | Không | PASS |
| 1366x768 | Ngang | Không | Không | PASS |
| 1920x1080 | Ngang | Không | Không | PASS |

Ở các viewport landscape có chiều cao thấp, một số control của trang đăng nhập nằm ngoài vùng nhìn đầu tiên nhưng vẫn nằm trong luồng cuộn, không bị tràn ngang hoặc bị khóa thao tác. Đây không được coi là lỗi overlay/layout; cần xác nhận thêm trên thiết bị thật khi kiểm tra bàn phím và safe-area.

### 8.3 Build, test và chất lượng mã nguồn

- `npm run build`: **PASS**; 2.337 modules transformed, build cuối khoảng 10,25 giây.
- `npm run test:all`: **PASS**; AI Zalo Assistant, AI Zalo order request và stress suite 11.309 thao tác đều PASS.
- `npm run test:kpi`: **PASS**; các KPI mô phỏng API, screen open, memory leak, crash local, UI freeze và cold start đều PASS. Thiếu log thiết bị thật chỉ tạo **WARNING** theo đúng thiết kế KPI gate, không chặn deploy.
- `git diff --check`: **PASS**.
- Build không còn cảnh báo CSS minify `Expected identifier but found "-"`; đã sửa biểu thức làm sạch dấu phân cách trong phần preview tin nhắn theo cách tương đương, không đổi hành vi.
- Lint: **CHƯA CẤU HÌNH**. Repository chưa có script/config ESLint; không thêm dependency mới trong sprint kiểm định để tránh mở rộng phạm vi và thay đổi source legacy ngoài UI.
- Console tab local mới chỉ có log kết nối Vite và gợi ý React DevTools; không có error/warning mới.

### 8.4 Regression và rủi ro

- Không có thay đổi trong Firebase, Firestore, Authentication, Permission, API, SePay, QR, Webhook, Dashboard, dữ liệu hoặc công thức.
- Regression tự động hiện có PASS; chưa thể xác nhận các luồng cần dữ liệu thật sau đăng nhập vì môi trường kiểm thử hiện tại không có phiên đăng nhập.
- Chưa có kiểm thử APK/PWA trên Android/iPhone/tablet vật lý; chưa thể chứng nhận tuyệt đối cho safe-area, bàn phím hệ điều hành, GPU/FPS hoặc crash native.
- Chưa có screenshot tự động cho mọi modal/form/drawer; nên thực hiện QA thiết bị thật trước khi phát hành store.

### 8.5 Đề xuất trước UI-003

1. Bổ sung phiên QA có tài khoản test và dữ liệu seed để mở từng module sau đăng nhập.
2. Bổ sung ESLint/CI lint trong một sprint riêng, sau khi thống nhất phạm vi cảnh báo của source legacy.
3. Kiểm thử APK/PWA trên Android/iPhone/tablet thật với bàn phím, notch, Dynamic Island, gesture navigation và xoay màn hình.
4. Chỉ bắt đầu UI-003 sau khi nghiệm thu báo cáo UI-001.1 này.

**Trạng thái UI-001.1:** Đã hoàn tất kiểm tra và sửa trong phạm vi môi trường hiện tại; còn các giới hạn QA thiết bị thật, phiên đăng nhập và lint chưa cấu hình như đã nêu ở trên. Chưa triển khai UI-003.
