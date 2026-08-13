# HD Manager Performance Audit Report

Ngày kiểm tra: 13/08/2026
Branch: `main`
Commit nền: `aae4edead8d965c52555121fdee0dec7e3dccf19`
Trạng thái phát hành: **NO-GO - chưa commit, chưa push, chưa deploy**

## A. Tóm tắt vấn đề

Đợt audit quét toàn bộ source, build system, Firebase/Firestore, React render, cache, authentication bootstrap, Electron, Capacitor, Functions và các bộ test hiện có. Tổng cộng xác định 7 vấn đề hiệu năng có bằng chứng:

| Mức độ | Số lượng | Đã xử lý | Còn lại |
|---|---:|---:|---:|
| P0 - Critical | 0 | 0 | 0 |
| P1 - High | 3 | 1 | 2 |
| P2 - Medium | 3 | 2 | 1 |
| P3 - Minor | 1 | 1 | 0 |
| **Tổng** | **7** | **4** | **3** |

Các vấn đề đã xử lý an toàn, không thay đổi nghiệp vụ:

1. Snapshot Firestore chỉ thay đổi metadata vẫn cập nhật state collection và kéo theo render diện rộng.
2. Instrumentation realtime luôn gọi `docChanges()` kể cả khi performance monitor tắt.
3. Tailwind safelist tạo gần như toàn bộ palette/variant, làm CSS production phình lớn.
4. Stable collection cache bị ghi lặp trong cùng luồng cập nhật.

Các rủi ro chưa thể xử lý bằng một patch nhỏ mà không tăng nguy cơ hồi quy dữ liệu/nghiệp vụ:

1. Nhiều collection nghiệp vụ vẫn được nghe realtime toàn collection thay vì query theo màn hình, thời gian và pagination.
2. `src/App.jsx` là monolith khoảng 4,35 MB với 198 `useEffect`, hạn chế code splitting thật sự và tăng chi phí parse/compile.
3. Webhook legacy còn đường fallback quét tối đa khoảng 2.000 đơn cũ khi thiếu khóa tra cứu chuẩn hóa.

## B. Nguyên nhân gốc

### B1. Render lại do snapshot metadata

- **Triệu chứng:** dữ liệu không đổi nhưng listener vẫn chạy lại luồng parse, merge và set state.
- **Bằng chứng:** listener dùng snapshot server mà không phân biệt `docChanges({ includeMetadataChanges: false })` bằng 0.
- **Nguyên nhân:** metadata như `hasPendingWrites`/trạng thái server thay đổi vẫn đi qua `applyCollectionItems`.
- **Sửa:** bỏ qua snapshot metadata-only sau payload đầu tiên, nhưng vẫn giữ payload đầu, mutation local đang chờ và mọi thay đổi dữ liệu thật.
- **An toàn dữ liệu:** snapshot cache vẫn không được phép thay thế dữ liệu tài chính; không thêm stale cache.

### B2. Instrumentation gây chi phí khi không đo

- **Triệu chứng:** mọi snapshot đều tính change list dù chế độ performance không bật.
- **Nguyên nhân:** wrapper `onSnapshot` gọi instrumentation vô điều kiện.
- **Sửa:** chỉ ghi metric khi `isPerformanceMonitorEnabled()` trả về true.

### B3. CSS production quá lớn

- **Triệu chứng baseline:** CSS tổng 1.297,81 kB raw / 124,16 kB gzip.
- **Nguyên nhân:** safelist sinh toàn bộ màu, shade, state variant và grid variant dù phần lớn không dùng.
- **Sửa:** bỏ safelist tổng quát và để Tailwind scan toàn bộ `src/**/*.{js,jsx,ts,tsx}`.
- **Kiểm tra:** static scan không phát hiện cách dựng class màu/grid động cần safelist cũ; build và responsive smoke test PASS.

### B4. Full-collection realtime listeners - chưa xử lý

- **Triệu chứng scale projection:** 100 người dùng ở mức WARN; 500 đến 200.000 người dùng đều FAIL.
- **Bằng chứng:** mô hình hiện tại ước tính 7.890 reads/session ở dataset 100 người dùng và tăng theo dữ liệu tenant.
- **Nguyên nhân:** nhiều màn hình chia sẻ dữ liệu được bootstrap bằng listener collection đầy đủ.
- **Hướng xử lý đúng:** query theo `companyId`, khoảng ngày, trạng thái, `orderBy + limit`, pagination, listener theo route và aggregate riêng cho dashboard.
- **Lý do chưa sửa:** đây là migration kiến trúc truy vấn cần rollout theo module, index Firestore và đối chiếu nghiệp vụ; không an toàn để thay đổi hàng loạt trong audit hiện tại.

### B5. App monolith - chưa xử lý

- **Bằng chứng:** `src/App.jsx` 4.349.797 bytes, 198 `useEffect`; main JS khoảng 2,31 MB raw.
- **Tác động:** parse/compile nặng hơn trên máy RAM thấp; route/module khó lazy-load độc lập.
- **Hướng xử lý:** tách AppShell, route modules, data hooks và domain services theo từng sprint có regression riêng.

### B6. Webhook legacy scan - chưa xử lý

- **Bằng chứng:** Functions còn fallback đọc tối đa khoảng 2.000 orders khi mã cũ thiếu field lookup.
- **Hướng xử lý:** migration bổ sung `paymentCode/orderCode/invoiceCode` chuẩn hóa và index, sau đó bỏ fallback scan.

## C. File và hàm thay đổi

| File | Vị trí/hàm | Thay đổi | Lý do |
|---|---|---|---|
| `src/App.jsx` | wrapper `onSnapshot` | Chỉ đo realtime khi monitor bật; đếm data changes không gồm metadata | Giảm CPU ở đường nóng |
| `src/App.jsx` | `startCollectionListener` | Bỏ qua snapshot metadata-only lặp lại, giữ payload đầu và local mutation | Giảm state update/render dư |
| `src/App.jsx` | collection state updater | Bỏ một lần ghi stable cache trùng | Giảm thao tác đồng bộ dư |
| `src/services/realtimeFreshness.js` | `getRealtimeDataChangeCount` | Helper đếm thay đổi dữ liệu thật, có fallback an toàn | Tách logic và kiểm thử độc lập |
| `tailwind.config.cjs` | `content`, `safelist` | Scan toàn source, bỏ safelist tổng quát | Giảm CSS bundle |
| `tests/cache-freshness.test.mjs` | realtime freshness tests | Test metadata-only, payload đầu, local mutation, monitor guard | Chống regression |

Lưu ý phạm vi: workspace còn thay đổi đồng thời ở `src/api/hdConnectStaging.js` và một phần writer guard trong `src/App.jsx`. Đây không phải tối ưu performance của báo cáo này; các thay đổi đó được giữ nguyên, không hoàn tác và không được nhận là kết quả audit.

## D. Performance Matrix

`NOT MEASURED` nghĩa là chưa có phiên đăng nhập thật hoặc thiết bị thật trong môi trường kiểm tra; không được suy luận thành PASS.

| Module | Load thực tế | API/Firestore thực tế | Render | Data size | Kết quả hiện tại |
|---|---:|---:|---:|---:|---|
| Login UI công khai | warm avg 81,7 ms | Không gọi dữ liệu nghiệp vụ | Không overflow 10 viewport | bundle chung | PASS, không regression |
| Login authenticated | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | Chưa nghiệm thu |
| Dashboard | NOT MEASURED | NOT MEASURED | Synthetic suite có coverage | NOT MEASURED | Functional PASS, perf thực tế chưa đo |
| Orders | NOT MEASURED | NOT MEASURED | 0,20 ms synthetic | dataset synthetic | Functional PASS, perf thực tế chưa đo |
| Customers | NOT MEASURED | NOT MEASURED | 0,51 ms synthetic | dataset synthetic | Functional PASS, perf thực tế chưa đo |
| Products | NOT MEASURED | NOT MEASURED | Search 10k: 6,7 ms synthetic | 10.000 products | Functional PASS, perf thực tế chưa đo |
| Inventory/Warehouse | NOT MEASURED | NOT MEASURED | 14,38 ms synthetic | 100.000 inventory rows | Functional PASS, perf thực tế chưa đo |
| Debt/Payment | NOT MEASURED | NOT MEASURED | 3,70 ms synthetic | 100.000 transactions | Functional PASS, perf thực tế chưa đo |
| HR | NOT MEASURED | NOT MEASURED | Synthetic coverage | 500 employees | Functional PASS, perf thực tế chưa đo |
| Payroll | NOT MEASURED | Rules emulator PASS | Automated calculations PASS | local fixtures | Functional PASS, perf thực tế chưa đo |
| Accounting | NOT MEASURED | NOT MEASURED | Synthetic coverage | local fixtures | Functional PASS, perf thực tế chưa đo |
| Reports | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | Functional coverage, perf thực tế chưa đo |
| Settings | NOT MEASURED | NOT MEASURED | NOT MEASURED | NOT MEASURED | Perf thực tế chưa đo |

Số liệu synthetic chỉ đo thuật toán local bằng Node trên dataset in-memory, không phải thời gian React/Firestore hoặc FPS GPU thực tế.

## E. So sánh trước và sau

### Production bundle

| Chỉ số | Trước | Sau | Thay đổi |
|---|---:|---:|---:|
| CSS raw | 1.297,81 kB | 205,13 kB | **-84,2%** |
| CSS gzip | 124,16 kB | 33,69 kB | **-72,9%** |
| Main JS raw | 2.309,87 kB | 2.311,54 kB | +0,07% |
| Main JS gzip | 605,61 kB | 606,18 kB | +0,09% |
| Vite build | 14,27 s | 13,87 s | -2,8% |
| Build wall time | 15,378 s | 14,791 s | -3,8% |

### Public login shell

| Chỉ số | Baseline | Sau | Kết luận |
|---|---:|---:|---|
| Warm meaningful UI | 79,6 ms | 81,7 ms | Tương đương, không regression có ý nghĩa |
| Responsive widths | 10 viewport | 10 viewport | Không horizontal overflow |

### Realtime render

- Trước: snapshot metadata-only tiếp tục đi qua parse/merge/set state.
- Sau: snapshot metadata-only lặp lại dừng trước `applyCollectionItems`; payload đầu và dữ liệu thật vẫn chạy.
- Render count React thực tế authenticated: **NOT MEASURED**.
- Firestore network reads: **không đổi bởi patch này**; tối ưu giảm xử lý client, không tuyên bố giảm reads.

## F. Firebase / Firestore

### Đã xác nhận

- Cached snapshot không được thay dữ liệu nghiệp vụ server-confirmed.
- Pending write không được xác nhận sớm.
- Snapshot cũ không ghi đè amount vừa chỉnh sửa.
- Tenant isolation emulator: 14/14 PASS.
- Payroll rules emulator: 19/19 PASS.
- Identity recovery emulator: PASS.
- Không thay rules, schema, authentication, authorization hay tenant scope trong tối ưu performance.

### Chưa đạt mục tiêu scale

| Synthetic users | Current projection | Initial reads/session | Trạng thái |
|---:|---:|---:|---|
| 100 | 1.263,1 ms | 7.890 | WARN |
| 500 | 5.781,6 ms | 36.120 | FAIL |
| 1.000 | 11.545,0 ms | 72.120 | FAIL |
| 5.000+ | tăng tuyến tính | 360.400+ | FAIL |

Đây là projection kiến trúc dựa trên số document/listener, không phải phép đo latency production. Tuy vậy, nó đủ để chặn kết luận “toàn bộ PASS”.

## G. Bundle / Render / Memory

- 2.384 modules được build thành công.
- CSS đã giảm mạnh; main JS gần như không đổi và vẫn là rủi ro.
- Lazy import đã tồn tại cho QR, Excel, OCR, PDF/image và barcode scanner.
- Big stress local: 515.500 records, tổng 320 ms, peak RSS 226,6 MB.
- Heap trước 4.198.320 bytes; sau GC 4.320.856 bytes; không phát hiện leak trong test Node.
- Event-loop max 25,59 ms; không crash, không freeze/ANR trong mô phỏng.
- FPS 7,7 trong báo cáo stress là ước tính từ workload Node, **không phải FPS thiết bị** và không được dùng để nghiệm thu Android/iOS.
- Android, iOS và Electron memory/FPS thực tế: **NOT MEASURED**.

## H. Kiểm thử hồi quy

| Gate | Kết quả |
|---|---|
| `npm test` | PASS toàn bộ chuỗi test chức năng |
| Stress nghiệp vụ | PASS 11.309 thao tác |
| Focused freshness/realtime/tenant/readiness/resilience | PASS 33/33 |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| Production dependency audit | PASS, 0 vulnerability production |
| Firestore payroll rules emulator | PASS 19/19 |
| Firestore tenant rules emulator | PASS 14/14 |
| Identity recovery emulator | PASS |
| KPI gate | PASS với warning vì thiếu physical-device perf log |
| Responsive public Login | PASS 10 viewport, portrait + landscape |
| Authenticated module smoke test | **NOT MEASURED** |
| Android physical-device performance | **NOT MEASURED** |
| iOS physical-device performance | **NOT MEASURED** |
| Electron packaged performance | **NOT MEASURED** |
| Architecture scale projection | **FAIL 7/8 mức tải** |

## I. Rủi ro còn lại và quyết định

### Rủi ro bắt buộc xử lý trước khi gọi là tối ưu toàn bộ

1. Tách full-collection listeners thành query/listener theo route, tenant, thời gian và pagination.
2. Tạo aggregate/index cho dashboard và webhook; migration khóa tra cứu đơn cũ trước khi bỏ legacy scan.
3. Tách `App.jsx` theo module để giảm initial parse và cho phép lazy-load thật sự.
4. Đo authenticated login, navigation, Firestore reads, render count và network trên một tài khoản test thật.
5. Đo Android/iOS/Electron bằng profiler thiết bị thật; xác nhận FPS, RAM, CPU, cold/warm startup và listener cleanup.

### Quyết định phát hành

**NO-GO / KHÔNG PUSH.**

Lý do:

- Điều kiện của người dùng là chỉ push khi toàn bộ test thực tế PASS.
- Authenticated navigation và thiết bị thật chưa được đo.
- KPI physical-device log còn thiếu.
- Scale projection đang WARN ở 100 và FAIL ở 7 mức còn lại.
- Ba rủi ro kiến trúc lớn chưa được xử lý an toàn.

Không có dữ liệu production nào được tạo, sửa hoặc migration trong đợt audit này.

## J. Tiếp tục xử lý các performance blocker (13/08/2026)

### Phạm vi đợt này

- Chỉ xử lý các blocker còn lại: scale projection, vòng đời listener realtime, JavaScript initial bundle, khả năng đo navigation đã xác thực và nền tảng native.
- Không chạy lại các gate đã PASS trước đó trừ các kiểm thử trực tiếp liên quan đến thay đổi mới.
- Không commit, push, deploy, reset workspace, migration hoặc thao tác dữ liệu production.

### 1. Scale projection và realtime lifecycle

Đã thay startup mở listener cho tất cả collection bằng mô hình hai tầng:

- Bộ nền luôn realtime: `companies`, `employees`, `notifications`.
- Bộ nghiệp vụ chỉ realtime khi tab tương ứng đang mở; web tối đa 12 listener foreground, native tối đa 8 listener foreground.
- Khi đổi tab, listener foreground cũ được unsubscribe trước khi listener mới được giữ lại.
- Collection vượt giới hạn chỉ được đọc fallback có trì hoãn, không mở thêm listener realtime.
- REST refresh không chạy cạnh listener đang khỏe, tránh đọc trùng và tránh race trong Firestore WebChannel.

| Quy mô mô phỏng | Trước: reads/session | Sau route-scoped: reads/session | Kết quả sau |
|---:|---:|---:|---|
| 100 users | 7.970 | 4.380 | PASS |
| 500 users | 36.270 | 19.945 | WARN |
| 1.000 users | 72.420 | 39.770 | FAIL |
| 5.000 users trở lên | tăng tuyến tính | vượt ngưỡng | FAIL |

Kết quả focused test: `npm run test:realtime-tenant-sync` = **PASS 4/4**. Test scale `npm run test:performance` thực thi thành công, nhưng projection còn **6/8 FAIL và 1/8 WARN**, nên đây vẫn là blocker phát hành.

### 2. Full-collection Firestore listeners

Đã xử lý phần startup và duplicate listener:

- Không còn khởi động bằng cách subscribe toàn bộ `collectionBindings`.
- Không còn REST read song song trên collection đang có listener khỏe.
- Có unsubscribe khi tab/tenant/session thay đổi.

Còn tồn tại theo thiết kế dữ liệu hiện tại:

- Các query theo `companyId` vẫn là query toàn collection của tenant, chưa có `dateKey`, cursor hoặc aggregate cho Dashboard.
- Dashboard và Executive Dashboard vẫn tính số liệu lịch sử từ nhiều collection ở client. Không thể thêm `limit()` tùy tiện vì sẽ làm sai doanh thu, công nợ, kho và báo cáo.
- Legacy webhook fallback vẫn có khả năng quét tới 2.000 đơn cũ khi thiếu trường lookup chuẩn hóa.

Muốn đạt scale cao hơn cần một migration nghiệp vụ riêng, có kiểm thử dữ liệu: aggregate theo ngày/tháng phía server, endpoint/query theo kỳ cho Dashboard, index/cursor phân trang cho danh sách và backfill lookup cho đơn cũ. Đợt này không thực hiện vì có nguy cơ thay đổi kết quả nghiệp vụ.

### 3. JavaScript bundle và App.jsx

Đã tách giao diện Trung tâm bảo mật/thiết bị tin cậy khỏi `App.jsx` bằng lazy import. Module này chỉ tải khi mở hồ sơ bảo mật, không còn thuộc initial bundle.

| Artifact | Trước | Sau | Thay đổi |
|---|---:|---:|---:|
| Main JavaScript | 2.312,71 kB | 2.306,11 kB | -6,60 kB (-0,29%) |
| Main JavaScript gzip | 605,61 kB | 604,46 kB | -1,15 kB (-0,19%) |
| IdentitySecurityCenter lazy chunk | chưa tách | 8,83 kB raw / 2,63 kB gzip | chỉ tải theo nhu cầu |

`npm run test:identity` = **PASS** và `npm run build` = **PASS** (15,28 giây).

`src/App.jsx` vẫn khoảng 4,34 MB nguồn và chứa các module Dashboard, Orders, Customers, Inventory, Accounting, HR và Reports trong cùng một file. Vì vậy bundle blocker **giảm nhưng chưa được giải quyết triệt để**. Việc tách tiếp từng route cần một đợt refactor có regression theo từng module, không thể coi là an toàn nếu làm nhanh trong đợt audit này.

### 4. Authenticated navigation

Không đo được thực tế các flow Login -> Dashboard, Dashboard -> Orders/Inventory/Accounting/HR/Reports và Customer Detail vì browser automation hiện không có phiên đăng nhập test được cấp quyền. Không nhập, lưu hoặc kiểm tra mật khẩu/cookie của người dùng.

Trạng thái: **NOT TESTED**. Không có số liệu trước/sau hợp lệ để báo cáo.

### 5. Android, iOS và Electron

| Nền tảng | Trạng thái | Lý do |
|---|---|---|
| Android | NOT TESTED | Có mã dự án Android nhưng không có ADB, emulator hoặc thiết bị kết nối trong môi trường hiện tại. |
| iOS | NOT TESTED | Có cấu hình Expo/iOS nhưng môi trường Windows không có simulator hay thiết bị iOS. |
| Electron | NOT TESTED | Có mã Electron nhưng không có ứng dụng Electron/installer đang chạy để đo cold start, navigation, RAM và FPS. |

### Kết luận đợt tiếp tục

**NOT READY TO PUSH.**

Các cải thiện listener và lazy bundle đã được build/test focused thành công, nhưng chưa thể công bố toàn bộ performance PASS vì:

1. Scale projection vẫn WARN từ 500 users và FAIL từ 1.000 users trở lên.
2. Query toàn collection theo tenant vẫn tồn tại ở các màn hình cần lịch sử đầy đủ.
3. `App.jsx` vẫn là monolith lớn; mới tách được một phần UI ít rủi ro.
4. Authenticated navigation và Android/iOS/Electron chưa được đo thực tế.

Không có commit, push, deploy, reset hoặc thay đổi dữ liệu production trong đợt này.
