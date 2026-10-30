# Firebase Customer Product Auto-sync — 30/10/2026

Ghi chú phát hành: báo cáo dưới đây ghi trạng thái nghiệm thu Development trước chỉ thị phát hành tiếp theo. Sau đó owner đã yêu cầu push main, triển khai app.hdconnect.net và tạo APK. Kết quả phát hành được ghi riêng trong `customer-product-auto-sync-20261030-release.md`; chỉ thị phát hành không làm thay đổi các giới hạn bằng chứng hiệu năng nêu dưới đây.

## Kết luận nghiệm thu

**Triển khai Development/Emulator: đã thực hiện. Nghiệm thu toàn bộ: BLOCKED.**

Size, giá và ĐV đặt dùng chung cấu hình khách hàng; đơn và cấu hình được ghi trong một transaction. Kiểm tra nghiệp vụ, quyền, đồng thời, bản nháp và chống ghi lặp đã đạt trong phạm vi dưới đây. Chưa đủ bằng chứng để xác nhận hiệu năng trên Android cấu hình thấp/thiết bị đang sử dụng và độ trễ Firestore cloud.

Không push, deploy production, chạy migration hoặc sửa chứng từ production trong nhiệm vụ này. Không chuyển sang HD Platform/PostgreSQL. Không tạo project Firebase mới.

Baseline: `134bf6f2aff53116b8fcef9fa3b12bbbb9e72823`. Checkout: `codex/hdm-perf-recovery-001`. Thay đổi vẫn ở working tree để review.

## 1. Audit nguồn dữ liệu và build

Đã đối chiếu `src/App.jsx`, `vite.config.js`, `src/config/firebase-runtime.js`, `src/config/firebase-only-runtime.js`, `.firebaserc`, `firebase.json`, rules, các helper cấu hình/đơn vị và Functions liên quan. Audit này xác minh mã nguồn và cấu hình local; không khẳng định có inventory trực tiếp toàn bộ documents hoặc rules đang deploy trên production.

- `.firebaserc` chỉ có default project `hd-manager-c5839`; chưa có alias staging phù hợp.
- Build cloud giữ Firebase Auth/Firestore. Alias `firebase/firestore` sang mock chỉ bật trong build preview được cho phép. Chế độ `vps-staging` hiện hữu không được dùng hay thay đổi.
- Dữ liệu nghiệp vụ nằm dưới `artifacts/{appId}/public/data/{collection}/{documentId}`; `companyId` là ranh giới tenant. `appId` lấy từ cấu hình build/runtime.
- Khách hàng là nguồn mặc định: `priceOverrides[productId]`, hoặc alias cũ `customPrices`; `variants[]` lưu cấu hình từng biến thể. `customerProductIds` là danh sách sản phẩm cố định.
- Các chi nhánh ở `branches[]`/`customerBranches[]` có phạm vi cấu hình riêng. Lần tạo override đầu tiên giữ các sản phẩm kế thừa và không đổi khách gốc/chi nhánh khác.
- Sản phẩm chứa danh mục, đơn vị, giá gốc và thuộc tính. Đơn đặt ở `orderRequests`; `orders` là nghiệp vụ đơn hàng khác, không được dùng thay cho đơn đặt.
- Một dòng đơn giữ snapshot `configurationId`, Size/thuộc tính, giá, số lượng, `orderUnit`/`quantityUnit`, `billingUnit`/`pricingUnit`, khối lượng thực tế và số tiền.
- `src/services/customerProductBilling.js` tiếp tục là bộ tính tiền. Công thức tồn kho, xuất kho và giá vốn không được sửa.
- Firestore khởi tạo với `initializeFirestore`; không có cấu hình Firestore IndexedDB persistence trong đoạn khởi tạo hiện tại. Không nhầm Auth persistence với Firestore persistence. Ứng dụng có cache/state/listener và hàng chờ localStorage riêng; tính năng mới tái sử dụng chúng.
- Listener được quản lý sẵn theo collection/phạm vi màn hình. Không thêm listener theo sản phẩm, dòng đơn hoặc một bộ polling truy vấn mới.
- Functions hiện hữu có trigger trên khách hàng để đồng bộ phân công tin nhắn; trước thay đổi, trigger này truy vấn tin nhắn cả khi chỉ sửa giá/Size. Đã thêm guard cho trường hợp đó.

## 2. Collections/documents sử dụng

| Dữ liệu | Đọc/ghi của luồng mới |
|---|---|
| `orderRequests/{requestId}` | Đọc revision, kiểm tra mã lệnh; ghi snapshot đơn |
| `customers/{customerId}` | Đọc cấu hình mới nhất; chỉ ghi khi mặc định thực sự đổi |
| `products/{productId}` | Kiểm tra sản phẩm cập nhật mặc định còn hợp lệ, cùng tenant |
| `companies/{companyId}`, `employees/{appUserId}` | Rules kiểm tra quyền; số đọc này tách khỏi bộ đếm client transaction |
| `messages` | Trigger phân công cũ bỏ qua config-only; vẫn xử lý khi phân công thực sự đổi |

Không thêm collection/index. Không sửa dữ liệu `warehouseDispatches`, nhập kho, tồn kho, giá vốn hay lịch sử đơn khác.

## 3. Thiết kế và luồng ghi

1. Chọn khách/sản phẩm lấy cấu hình từ cache/state hiện có. Ghi nhận fingerprint cấu hình khi bắt đầu nhập; mở editor cũng giữ revision đơn ban đầu.
2. Nhập từng ký tự chỉ sửa state. Form lưu nháp theo tenant và nhân viên trên thiết bị, debounce 250 ms, đồng thời lưu khi rời trang/ẩn ứng dụng. Listener của form được cleanup khi đóng/unmount.
3. Khi bấm lưu, chuẩn hóa snapshot, tạo SHA-256 nội dung nghiệp vụ và mã thao tác ổn định. Lưu lệnh bền vững trước khi gọi Firestore; chỉ hiển thị đơn tạm ở trạng thái chờ, chưa cập nhật mặc định khách.
4. Transaction đọc đơn và khách, kiểm tra tenant, archive, revision, fingerprint cấu hình và mã thao tác. Đọc các sản phẩm thực sự cần cập nhật. Sau đó ghi đơn và cấu hình cùng transaction.
5. ACK cập nhật đúng document trong cache/state. Không tải lại toàn bộ khách hàng. Lỗi quyền/xung đột không có commit một nửa; rollback phần hiển thị tạm và giữ lệnh/bản nhập để xử lý.
6. Retry đọc được mã lệnh đã hoàn tất sẽ trả dữ liệu hiện tại, không ghi lại mặc định cũ. Đơn giữ tối đa 20 hash lệnh gần nhất; lệnh đã rơi khỏi cửa sổ này vẫn bị revision cũ chặn, không được xem là replay thành công.
7. Khi sửa từ Khách hàng, lưu vào cùng map cấu hình bằng transaction có kiểm tra fingerprint. Không gửi lại tên/điện thoại cũ nếu người dùng chỉ sửa cấu hình. Nhập ĐV đặt mới cũng cập nhật ĐV đặt mặc định.

Firestore transaction không hoạt động offline. Luồng mới từ chối xác nhận thành công khi mất kết nối, giữ bản nháp và dùng hàng chờ retry hiện hữu: theo sự kiện online và nhịp 30 giây khi còn việc, backoff, tối đa 6 lần tự động trước khi yêu cầu xử lý. Không có truy vấn liên tục theo ký tự. Timeout giao diện 12 giây không mở khóa hay hủy giả transaction vẫn đang chạy.

Sau xung đột, chỉ cho thay lệnh bị chặn khi người dùng đã mở lại dữ liệu với baseline mới; không tự động lấy giá của người nhập sau để ghi đè.

Phạm vi gốc là tenant + khách + sản phẩm + biến thể. Chi nhánh thêm một phạm vi riêng theo cấu trúc hiện hữu. Nếu có nhiều dòng không phân biệt được biến thể duy nhất, lưu snapshot đơn nhưng giữ nguyên mặc định của sản phẩm đó và hiển thị cảnh báo. Việc xác định mơ hồ xét cả các dòng không sửa, tránh lấy riêng dòng vừa chỉnh làm mặc định.

**ĐV đặt và ĐV tính giá độc lập:** 121 Con, giá 64.000 đ/Kg, chưa cân thực tế thì số tiền vẫn chờ Kg; không tính 121 × 64.000. Form mới ưu tiên ĐV đặt trong cấu hình khách; không tự lấy đơn vị sản phẩm để thay thế.

## 4. Files thay đổi

| File | Vai trò |
|---|---|
| `src/utils/customerProductAutoSync.js` | Planner, fingerprint, revision, chống ghi lặp, transaction nguyên tử |
| `src/App.jsx` | Tích hợp queue/ACK, editor, mặc định đơn mới, lưu cấu hình và nháp |
| `firestore.rules` | Bảo vệ các trường cấu hình khách theo tenant và quyền |
| `functions/customerMessaging.js` | Phát hiện thay đổi phân công thực sự |
| `functions/index.js` | Bỏ qua truy vấn routing khi chỉ đổi cấu hình sản phẩm |
| `package.json` | Các lệnh kiểm thử mới |
| `tests/customer-product-auto-sync.test.mjs` | 14 kiểm tra logic/guard Functions |
| `tests/customer-product-auto-sync.emulator.mjs` | 11 nhóm kiểm tra Firestore thật trong Emulator |
| `tests/visual/customer-product-auto-sync.visual.mjs` | 5 luồng UI với preview cô lập, build từ source hiện tại |
| `tests/order-request-ux.test.mjs` | Đổi contract opt-in cũ sang tự động, chờ ACK |
| `tests/phase1-hidden-report.test.mjs` | Bỏ khóa byte cho ba handler chủ động thay đổi; giữ các guard khác |
| `scripts/audit-interactions.mjs` | Cặp baseline cố định, WebView CDP, Size/ĐV đặt, tách dữ liệu Acceptance |

Không thêm thư viện. Không đổi Authentication, Functions thanh toán, migration hay schema tồn kho.

## 5. Security Rules và Functions

Rules mới áp dụng khi update cấu hình khách: người dùng employee hợp lệ, tenant không đổi, quyền module Khách hàng và các quyền sản phẩm cố định/Size/giá phải được cho phép. Owner/admin có quyền theo claim sẵn có. Quyền cá nhân được ưu tiên như mô hình quyền hiện hành.

Khi `view_all_customers=false`, guard mới chỉ cho khách được gán trực tiếp qua `empId`, với quyền xem khách được giao. Đã kiểm chứng trường hợp được phép và bị từ chối. **Chưa nghiệm thu vai trò trưởng nhóm quản lý khách của cấp dưới nhiều tầng.** Nếu công ty dùng phạm vi đó, phải đối chiếu chính sách hierarchy trước khi deploy; không khẳng định guard mới đã bao phủ cây cấp dưới.

Customer portal không được sửa mặc định. Rules không được nới cho tenant khác. Nếu transaction bị từ chối cập nhật khách thì đơn cũng không tồn tại sau commit thất bại.

Không tạo Function mới. Trigger `syncCustomerMessageAssignment` hiện hữu được thêm kiểm tra before/after. Config-only không gọi hàm truy vấn routing; đổi nhân viên hoặc tạo khách vẫn giữ luồng cũ. Đã kiểm tra helper, callback thực tế trích từ source, các kiểm tra routing hiện có và cú pháp Functions. Chưa chạy trigger trên một Firebase staging cloud.

## 6. Kết quả kiểm thử

| Nhóm | Kết quả / phạm vi |
|---|---|
| Planner + fingerprint + guard trigger | **14/14 PASS** |
| Firebase Emulator | **11/11 PASS** |
| Tenant isolation rules hiện có | **14/14 PASS** ở lượt rules riêng |
| UI browser preview | **5/5 PASS**, không có page error |
| Android APK Acceptance baseline | **60 mẫu, 0 failure, 0 page error** |
| Android APK Acceptance bản v2 | **60 mẫu, 0 failure, 0 page error** |
| Regression `npm run test:all` | PASS; suite master cuối có 482 pass, 1 skip (`master-rest-emulator`, yêu cầu opt-in `MASTER_REST_EMULATOR=1`); không phải toàn bộ lệnh chỉ có 482 kiểm tra |
| Lint cấu hình repo + files tính năng | PASS |
| `npm run typecheck` | PASS cho các project TypeScript đã cấu hình (payroll/dispatch); không khẳng định App.jsx đã strict typing toàn bộ |
| `npm run build` | PASS |

Emulator kiểm tra: lưu nguyên tử; chỉ đổi số lượng; replay không phục hồi mặc định cũ; stale config; hai editor cạnh tranh chỉ một commit; permission-denied rollback toàn bộ; tenant khác; giới hạn khách được phân công; offline/reconnect/replay; sửa cấu hình rồi mở đơn tiếp, giữ đơn trước; chi nhánh và sibling.

UI kiểm tra: sửa giá/Size/ĐV đặt trong bảng đơn; hiển thị ở khách; sửa từ khách; đơn mới lấy Size/giá/Con đúng, Kg tính tiền giữ nguyên; offline lưu lệnh và nháp; reload rồi bấm lưu lại chỉ có một đơn. UI dùng mock storage, không thay thế bằng chứng rules/transaction SDK từ Emulator.

Hồi quy bao gồm Đặt hàng, Khách hàng, Sản phẩm, Đơn hàng, Xuất kho, tồn kho và Dashboard trong các bộ test repo hiện có. Không đánh đồng coverage tự động này với thao tác thủ công mọi màn hình trên điện thoại thật.

## 7. Firestore reads/writes

Số dưới đây là lời gọi transaction client trên đường thành công không retry, **không phải số hóa đơn Firebase**; chưa cộng reads rules, listener, ACK/rollback bổ sung hoặc Functions khác.

| Thao tác | Trước | Sau |
|---|---|---|
| Lưu đơn staff thông thường | Ghi đơn riêng; không bảo đảm mặc định được cập nhật | Một transaction đơn + mặc định |
| Đơn có 1 sản phẩm đổi mặc định | Không có một đường ghi chung tương đương | 3 reads + 2 writes |
| Chỉ đổi số lượng | Ghi đơn | 2 reads + 1 write, không ghi khách |
| Replay lệnh đã commit | Chưa có idempotency chung đơn + mặc định | 2 reads + 0 writes |
| Sửa cấu hình tại Khách hàng | Ghi khách qua luồng cũ | 1 read + 1 write, kiểm tra version/fingerprint |
| Gõ ký tự | State local | 0 reads/writes Firestore |
| Trigger khách khi chỉ đổi mặc định | Có truy vấn các tin nhắn hỗ trợ của khách | Guard trả về trước truy vấn routing |

Mỗi sản phẩm thực sự đổi mặc định thêm tối đa một read sản phẩm trên mỗi attempt. SDK có thể retry khi tranh chấp. Tổng instrumented của lượt Emulator cuối: 32 reads, 14 write calls, 13 attempts, gồm cả attempt bị từ chối/retry; không dùng tổng này làm định mức production.

Update map/root hoặc array chi nhánh vẫn theo schema document hiện hữu; dữ liệu sibling được giữ nguyên nhưng payload có thể chứa toàn map/phạm vi. Chưa đo chi phí mạng với document khách sát giới hạn kích thước. Không thêm index hay collection để xử lý riêng từng dòng.

## 8. Android và hiệu năng trước/sau

Dùng AVD người dùng đã có. Gói riêng `com.hdmanager.app.acceptance`, debug assets/fixture cục bộ; không thay APK công ty, không dùng tài khoản/dữ liệu thật. Tắt máy ảo do lượt này khởi chạy sau khi thu số liệu.

- Pixel 5/API 30 có WebView 83.0.4103.106: **baseline đã lỗi cú pháp `Unexpected token '='`**, chưa tới nghiệp vụ. Không quy lỗi này cho thay đổi mới; không coi đó là lượt nghiệm thu thành công.
- Pixel 6 Pro/API 37.2, Android 17, WebView 149.0.7827.5, SwiftShader. Yêu cầu khởi chạy 1.536 MB/2 core nhưng emulator tự tăng RAM lên 4.096 MB; `/proc/meminfo` báo 4.007.044 KB. Vì vậy **không gọi đây là thiết bị RAM thấp 1,5 GB**.
- Fixture: 600 sản phẩm, 361 khách trong fixture bổ sung, 1.800 orders, 900 payments, một đơn mẫu; preview còn có seed chuẩn của ứng dụng.
- Mỗi thao tác có 5 mẫu. Dùng sự kiện CDP trong Capacitor WebView, không dùng tọa độ tap ADB cho cặp đo này. Thời gian từ input đến điều kiện DOM và hai cơ hội frame; không phải phép đo compositor/độ trễ chạm vật lý hay cloud ACK.

| Thao tác | Trước p50 / p95 (ms) | Sau v2 p50 / p95 (ms) |
|---|---:|---:|
| Mở Đặt hàng | 35,5 / 49,9 | 41,0 / 53,4 |
| Mở Khách hàng | 66,6 / 96,7 | 65,4 / 94,8 |
| Nhập ký tự tìm sản phẩm | 27,0 / 29,7 | 16,9 / 22,4 |
| Nhập Size | 25,5 / 28,9 | 21,0 / 28,9 |
| Nhập giá | 24,2 / 27,6 | 23,5 / 31,8 |
| Đổi ĐV đặt | 25,4 / 30,5 | 25,3 / 28,5 |
| Lưu giá, ACK preview | 24,2 / 34,3 | 33,1 / 41,3 |
| Lưu đơn, ACK preview | 30,6 / 36,0 | 28,0 / 47,9 |

Các mẫu tương tác trên đều dưới 100 ms. Các thao tác chọn/mở sản phẩm không được đánh đồng với phép đo thời gian tìm sản phẩm có kết quả chính xác trên cloud.

| Chỉ số | Trước | Sau v2 | Giới hạn diễn giải |
|---|---:|---:|---|
| Shell + 3 mock subscriptions sẵn sàng | 573,3 ms | 903,7 ms | Một mẫu mỗi bản sau navigation; chưa đủ kết luận startup regression hay PASS |
| Process PSS | 136.624 KB | 134.685 KB | Một mẫu sau workload; không phải peak RAM |
| Process RSS | 300.312 KB | 297.552 KB | Không thay thế profile toàn hệ thống/renderer |
| CPU từ `top` | 4,0% | 4,0% | Mẫu tại thời điểm idle sau workload, không phải CPU trung bình khi tương tác |
| Janky frames / total | 434/728 (59,62%) | 435/740 (58,78%) | Cao ở cả hai bản trong VM SwiftShader; chưa đạt bằng chứng “không giật” |
| JS heap post-GC, Khách hàng lượt 5 | 17.829.436 B | 17.828.992 B | Chỉ 5 vòng, không kết luận không leak dài hạn |
| Mock Firestore listeners tối đa | 11 | 11 | Không thêm listener mỗi dòng |
| DOM listeners, Khách hàng mounted lượt 5 | 402 | 402 | Hai listener form mới có cleanup; chưa phải soak test |

Cặp Android v2 đo luồng khách gốc. Sau đó chỉ bổ sung bảo toàn sibling khi tạo override chi nhánh và guard Functions; hai nhánh này có test riêng, chưa có cặp hiệu năng Android riêng.

Một lượt “paired-after” đầu bị nhiễm preview journal từ lượt trước, không dùng làm kết quả so sánh. Harness nay xóa dữ liệu **chỉ gói Acceptance riêng** trước cặp đo. Các log lỗi/partial vẫn được giữ.

## 9. Evidence và chạy lại

Các file trong `test-results/` là artifact local, không chứa dữ liệu công ty:

- `customer-config-unit.log`
- `customer-product-auto-sync-emulator.log`
- `customer-config-tenant-rules.log`
- `customer-config-ui.log`, `customer-config-ui/completed.png`
- `customer-config-routing.log`
- `customer-config-all-tests-final.log`
- `customer-config-lint-final.log`, `customer-config-feature-lint.log`
- `customer-config-typecheck-final.log`, `customer-config-build-final.log`
- `full-interaction/customer-config-final-before/{samples,summary,observations}.json`
- `full-interaction/customer-config-final-after-v2/{samples,summary,observations}.json`
- `customer-config-final-before-{memory,frames,top}.txt`
- `customer-config-final-after-v2-{memory,frames,top}.txt`
- `customer-sync-avd-modern.log` (bằng chứng emulator tăng RAM)
- `customer-config-final-crash.log`: có crash service UWB của emulator; không thấy package Acceptance là process crash trong log đã thu. Không gọi đây là “log toàn thiết bị không crash”.

Lệnh kiểm thử:

```powershell
npm run test:customer-order-memory
npm run test:customer-product-auto-sync:emulator
npm run test:customer-product-auto-sync:ui
npm run test:all
npm run lint
npm run typecheck
npm run build
```

UI test tự build preview cô lập. Emulator runner dùng project `demo-customer-product-sync` và localhost; không sử dụng production. Android harness cần AVD đã boot và biến `HD_MANAGER_ANDROID_SERIAL`, các cờ `HD_AUDIT_NATIVE`, `HD_AUDIT_CUSTOMER_CONFIG_ACTIONS`, `HD_AUDIT_CUSTOMER_CONFIG_FIELDS`; baseline source cố định qua `HD_AUDIT_CUSTOMER_CONFIG_BASELINE=1`.

## 10. Staging, phần còn chặn và rollback

Không có staging alias được xác minh; bỏ qua Phase 6 và không dùng production để thay thế. Chưa có owner nghiệm thu Phase 7.

Trước khi phát hành cần:

1. Chốt kiểm tra vai trò trưởng nhóm/cây cấp dưới nếu dùng quyền chỉ xem khách được phân công; guard hiện tại bảo thủ ở phạm vi gán trực tiếp.
2. Kiểm tra Android cấu hình thấp có WebView tương thích và thiết bị thực tế được owner chấp nhận. Pixel 5 hiện chưa chạy baseline; Pixel 6 hiện có RAM 4 GB.
3. Đo startup lặp đủ mẫu, CPU tương tác/peak RAM và khung hình trên môi trường phần cứng phù hợp; chưa dùng một mẫu idle hoặc số DOM dưới 100 ms để bỏ qua jank.
4. Nếu có staging, kiểm tra ACK/timeout và trigger cloud với dữ liệu test, rules mới và quyền thật. Chưa có số đo latency/billing Firebase production.

**Rollback:** hiện chưa có cloud/data mutation cần hoàn tác. Khi review không chấp nhận, revert đồng bộ các thay đổi App/helper, rules và guard Functions của tính năng, giữ các thay đổi người dùng khác. Không reset Firebase, không xóa khách/đơn, không xóa cache máy người dùng hàng loạt. Khi đã triển khai ở một môi trường test trong tương lai, giữ bản sao rules/source cũ để phát hành lại; metadata `syncVersion`, `syncCommands`, `productConfigVersion` là bổ sung, không cần migration xóa trường. Giữ snapshot và hàng chờ để đối soát trước khi thay phiên bản ứng dụng.
