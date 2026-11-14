# HD Manager — Final release evidence, 14/11/2026

**RELEASE BLOCKED. Không phải RELEASE COMPLETE.**

Source runtime ứng viên: `25b1b22237a3f652a2aeaf7bc84ece21e1f58955`, branch Local `codex/dev83-release-closure`. Ba mốc sửa runtime Local: `696a91318c0a3f876c632bb3cdb48cd19d0003fc`, `a2179c2169af417b211c61b2ec1752f2a5cd864d` và `25b1b22237a3f652a2aeaf7bc84ece21e1f58955`. Cấu hình bốn index được Owner duyệt nằm trong commit Local `5287ff6e0aa0742101207ecebc597e404a3db884`; 94 đầu vào package API và mã ứng dụng Web không đổi. Mốc remote trước đợt đóng hai blocker là `226dfcd28cd0989d63514eeada46db576dc8fa53`. Owner đã cho phép kiểm tra diff/secret, commit và fast-forward main an toàn; SHA remote và CI cuối cùng được lưu trong checkpoint. Push source không có nghĩa được deploy Production.

Nguồn ứng dụng chuẩn là `development/hd-manager/application`. Backend nghiệp vụ là **Firebase Auth + Firestore của HD Manager**; SQLite/IndexedDB nằm ở client. Không tích hợp HD Platform, PostgreSQL hoặc một ledger tài chính khác. Giữ nguyên nghiệm thu dev.83, ngoại lệ dev.42 và các mẫu đo cũ; không chạy lại benchmark dài.

## Phạm vi kiểm thử thật

Owner đã cho phép namespace QA cách ly trong project hiện hữu `hd-manager-c5839`. App ID QA: `hd-manager-release-qa-20261114`; identity, employee và tenant đều dùng prefix `qa_release_20261114_`. Dữ liệu là **SYNTHETIC QA**, không phải dữ liệu tài chính của doanh nghiệp.

Các bằng chứng HTTPS bên dưới dùng Firebase Auth/Firestore thật và HTTPS tunnel có kiểm soát; không dùng Emulator để thay thế HTTPS. Chỉ cổng ứng dụng được expose. Không đọc/ghi tenant thật; không đổi website hoặc Rules; không tạo project hoặc liên kết Billing. Theo các phê duyệt riêng của Owner, đã tạo đúng năm index (một cơ bản, bốn bộ lọc) và một secret khóa quyền Offline trên cloud. Các thay đổi này là metadata toàn project, không chỉ document QA. Các tunnel cũ đã đóng và các phiên QA cũ được thu hồi. Trạng thái đóng tunnel/phiên của lượt cuối nằm trong checkpoint; preview QA không được coi là dịch vụ API Production thường trực.

Kiểm thử trình duyệt dùng các module canonical: bootstrap, authorizer, encrypted vault, SQLite worker, repository, Outbox, Sync Engine và Service Worker. Đây là **component integration trên trình duyệt thật**, không được đổi tên thành nghiệm thu toàn bộ giao diện ứng dụng hoặc APK Release.

## Đóng CORS và đăng nhập giao diện HTTPS QA

Được Owner phê duyệt riêng, chỉ thêm origin `https://hd-manager-c5839--hd-manager-release-qa-20261114-c88u482x.web.app` vào `HD_MANAGER_ALLOWED_ORIGINS` của ba Functions `identityLogin`, `identityCompleteSetup`, `identityLogout` (us-central1). Không wildcard; giữ nguyên source, runtime/entry point, service account, biến khác và mọi origin Production/native hiện có. Bảy tệp source của deployment trước/sau có cùng digest `fca1f5c06c82e9f51b6df01741e71bbc936a046a9c6bc8220505bf8136bc8355`. GCP tạo generation source archive mới khi cập nhật config; đã đối chiếu nội dung, không suy source đổi từ tên generation.

Managed revisions: `identitylogin-00002-hub`, `identitycompletesetup-00002-kah`, `identitylogout-00002-ves`. Backup chỉ lưu trường CORS, hash các biến khác và metadata nguồn; không lưu các giá trị bí mật. Rollback chỉ khôi phục đúng trường CORS từ baseline trước cả ba cập nhật, có kiểm tra drift; script `apply-managed-identity-qa-cors.mjs --rollback`. Chưa kích hoạt rollback.

| Nội dung | Kết quả thực tế |
|---|---|
| Exact QA / Production / Android origin | PASS, 9/9 OPTIONS trả 204 và đúng ACAO |
| 3 origin giả mạo đối chứng | PASS, OPTIONS không có ACAO; không gọi nhầm đây là HTTP 403 |
| Origin HTTPS ngoài allowlist trong browser | PASS, browser chặn fetch qua CORS |
| Đăng nhập bằng giao diện App canonical | PASS, identityLogin POST 200, không chèn token vào UI |
| Firebase ID token của phiên UI | PASS_REAL_UI_TOKEN_VERIFIED, xác minh server uid/tenant/audience/issuer |
| Permission/JWK của phiên UI | PASS_UI_JWK_SIGNATURE_AND_OWNER, chữ ký và thời hạn hợp lệ |
| Refresh token từ chính phiên UI | PASS_REAL_GOOGLE_REFRESH_FROM_UI_SESSION; Google HTTPS 200 và protected API 200 |
| API thiếu token | HTTP 401; không được cấp grant |
| Scope A gửi bằng tài khoản B | HTTP 403; không có dữ liệu A |
| Cùng tenant, scope đúng nhưng thiếu quyền kế toán | PASS, Server 403; không tạo phiếu chi |
| Home và tìm kiếm | PASS |
| Reload khi Offline | PASS |
| Đóng/mở browser khi Offline | PASS |
| Lỗi JavaScript runtime | 0 |

Refresh proof kiểm chứng giao thức thực bằng refresh token UI, không mô phỏng thời gian một giờ hoặc sửa token local. Không tuyên bố đã kiểm thử hết hạn thực tế một giờ trong lượt này. Ca RBAC cùng tenant được kiểm tra lại qua HTTPS với origin QA cố định: scope/principal đúng nhưng không có quyền thanh toán vẫn bị Server từ chối 403, không phải từ chối do sai tenant. Bằng chứng `real-firebase-https-fixed-origin-rbac-final.json`. Outbox/idempotency kế thừa bằng chứng HTTPS cùng source ở các mục dưới; không dùng OPTIONS để thay thế đăng nhập UI.

Hai lượt UI thất bại sau khi CORS được sửa được giữ nguyên: IndexedDB không mở được backing store của profile Edge có đường dẫn dài trên Windows. Đối chứng cùng build/origin: profile mới ngắn 99 ký tự mở vault thành công; không đổi mã hóa, không reset/xóa profile cũ. Đã đổi riêng đường dẫn profile của harness và chạy lại UI đầu-cuối. Đây là sửa môi trường kiểm thử, không tự nhận là sửa lỗi nghiệp vụ. Bằng chứng: `browser-idb-profile-path-control.json`, hai file `real-firebase-https-fixed-origin-*-ui-failure.json`, và `real-firebase-https-fixed-qa-ui-final.json`.

Preview chỉ là kênh QA riêng, live channel trước/sau không đổi; không phải rollout app.hdconnect.net. JWK/API của lượt QA dùng HTTPS tunnel tạm và issuer QA RAM, không thay thế issuer Production. Component integration, UI QA và APK Release là ba phạm vi khác nhau.

## Những lỗi source đã sửa

1. Lệnh Outbox thiếu scope có thể bị diễn giải theo token của phiên khác. Client gửi scope; Server yêu cầu đầy đủ project/principal/tenant/permission revision/session/device, từ chối sai chủ trước khi dispatch. Bootstrap bổ sung project/device từ grant đã xác minh vì shared React session chỉ giữ identity vòng đời.
2. Thanh toán lương trusted chưa nối nguồn tài chính. Adapter mới dùng `artifacts/{appId}/public/data/expenses`, tạo phiếu chi, reference, lịch sử và receipt trong cùng Firestore transaction. Số đã trả được đọc từ phiếu chi được xác nhận; head chỉ giữ revision/audit. Không ghi thêm payment vào Local subledger. Khoản cũ cần đối soát bị chặn, không tự repost 420.000đ.
3. Phiếu thanh toán khoản lương đã ghi nhận không được tính thành chi phí lần hai. Chỉ voucher có marker và liên kết payroll tường minh được loại khỏi chi phí P&L; vẫn là dòng tiền chi. Dữ liệu lịch sử không có liên kết giữ nguyên cách tính.
4. Package có thể nạp hai bản module authority qua `createRequire`, làm route hợp lệ bị 403. Đã chuyển import nội bộ sang static import và thêm regression chạy **artifact build**, không chỉ source.
5. Tài khoản chỉ có quyền Nhập kho từng phụ thuộc việc người có Home đã khởi tạo journal. Route nay khởi tạo/reuse chính journal có lease/fence hiện hữu sau kiểm tra quyền Nhập kho; response vẫn chỉ có dữ liệu Nhập kho.
6. Tenant denial trả sai loại lỗi và Firestore thiếu index bị coi là input sai. Đã trả 403 cho tenant denial và 503 cho cả thông báo `requires an index` và `requires multiple indexes`; không trả 200 giả.
7. Release gate trước đây từ chối mọi kiểm thử trên project hiện hữu dù Owner đã duyệt namespace QA cụ thể. Gate chỉ nhận ngoại lệ đúng app ID QA, prefix và hai tenant QA, có bằng chứng namespace boundary; vẫn từ chối tenant thật, thiếu bài test, sai source hoặc artifact không đúng provenance. Chưa có artifact full readiness được đánh dấu READY.

Đã chuẩn bị export Firebase Functions `offlineApi`, public JWK endpoint, build/predeploy package và hosting rewrite trong source. Không deploy các cấu hình này. Khóa issuer Production đã được tạo theo phê duyệt riêng và lưu an toàn như mục bên dưới; không có fallback sang khóa QA/Local.

## Sáu routes còn thiếu trước đây

Các path nằm dưới `/api/offline/`; host Functions cũng nhận cùng action qua base URL riêng.

| Route | Kết quả thực tế | Bằng chứng |
|---|---|---|
| `business-source` | PASS HTTPS QA, truy vấn thật theo quyền/tenant | `real-firebase-https-packaged-readiness-final.json` |
| `attendance-period` | PASS HTTPS QA, đọc fingerprint/kỳ công thật | Cùng file |
| `payroll-settlement` | PASS HTTPS QA, đọc chứng từ chi liên kết | Cùng file và báo cáo HR bên dưới |
| `attendance-adjustment` | PASS package HTTPS QA, trả yêu cầu đã lưu | `real-firebase-https-auth-revocation-pass.json` |
| `warehouse-import-head` | PASS package HTTPS QA; tài khoản thiếu Home cũng đọc được đúng phạm vi | `real-firebase-https-packaged-readiness-final.json` |
| `warehouse-import-page` | **PASS** 12 truy vấn liên quan sau bốn index; nhân viên có kết quả thật, trạng thái/khách hàng mới kiểm tra kết quả rỗng | `real-firebase-https-approved-import-filters.json`; kết quả trước index vẫn giữ riêng |

Owner đã duyệt và index `warehouseImports`, scope `COLLECTION`, `companyId ASC`, `date DESC`, `__name__ DESC` đã **READY** lúc 04:14:13 UTC. Resource: `projects/hd-manager-c5839/databases/(default)/collectionGroups/warehouseImports/indexes/CICAgJjFx5sK`.

Kiểm thử package qua HTTPS sau index: **28 phiếu QA**, 27 phiếu mới tạo bằng chính API nghiệp vụ, trang **25 + 3**, không thiếu/trùng; lọc ngày 15 phiếu, từ khóa 9 phiếu, ngày + từ khóa 5 phiếu. Retry trả cùng trang; cursor sai tenant bị 403; đổi bộ lọc với cursor cũ trả reset; tenant B không nhận phiếu của A. Không trực tiếp chèn dữ liệu SQLite để làm bằng chứng.

Owner tiếp tục duyệt đúng **4 index**: `companyId + empId + date DESC + __name__ DESC`, `companyId + createdByEmpId + date DESC + __name__ DESC`, `companyId + status + date DESC + __name__ DESC`, `companyId + customerId + date DESC + __name__ DESC` (các trường trước date là ASC). Cả bốn đã **READY lúc 14:57:54 ngày 14/11/2026, giờ Việt Nam**, định nghĩa khớp hoàn toàn bản đã duyệt. Không tạo index nào khác, không sửa/xóa index cũ. Source `firestore.indexes.json` chỉ thêm bốn mục; 15 mục cũ và field overrides giữ nguyên.

`real-firebase-https-approved-import-filters.json`: **12/12 truy vấn HTTPS PASS**, không có lỗi index trong lượt chạy mới. Chỉ đọc lại 28 phiếu QA đã có, không tạo thêm phiếu:

| Truy vấn | Kết quả đối chiếu |
|---|---:|
| Nhân viên | 28 phiếu, trang 25 + 3, không trùng |
| Nhân viên + ngày | 15 phiếu |
| Nhân viên + từ khóa | 9 phiếu |
| Nhân viên + ngày + từ khóa | 5 phiếu |
| Trạng thái, trạng thái + ngày | 0 và 0, đúng tập nguồn |
| Khách hàng, khách hàng + ngày | 0 và 0, đúng tập nguồn |
| Nhân viên + trạng thái; nhân viên + khách hàng; khách hàng + trạng thái; tất cả điều kiện | Mỗi truy vấn 0, đúng tập nguồn |

Retry trả cùng trang; cursor sai scope/tenant bị 403; dùng scope B hợp lệ với cursor A chỉ trả reset và metadata B, không có dữ liệu A; đổi bộ lọc trả reset. Fingerprint chứng từ trước và sau cùng là `d4bb658686467610ffc92cf4c14852515f8bc0d7a1ecc1e907d728a364929c35`. **Không có giao dịch nghiệp vụ mới hoặc thay đổi số tiền trong lượt đóng index này.**

Giới hạn bằng chứng: 28 phiếu QA không có giá trị ở `status` hoặc `customerId`. Tám ca có các điều kiện này chỉ chứng minh truy vấn hợp lệ và kết quả rỗng đúng, **chưa kiểm chứng trường hợp có bản ghi phù hợp**. Không chèn trường giả vào SQLite/Firestore hoặc đổi công thức để làm PASS. Bốn ca nhân viên là kết quả không rỗng được đối chiếu ID đầy đủ. Các lỗi 503 và lỗi pagination metadata của harness trước đó được giữ nguyên trong hồ sơ, không đổi trạng thái lịch sử.

Resources bốn index: `CICAgJjFx5sJ`, `CICAgNi4o4sK`, `CICAgNiav4AK`, `CICAgJil0IYK`, cùng thuộc `projects/hd-manager-c5839/databases/(default)/collectionGroups/warehouseImports/indexes/`. Bằng chứng triển khai và cấu hình: `approved-filter-indexes-operations.json`, `approved-filter-indexes-status.json`, `approved-filter-index-config-verification.json`.

## Miền ghi, quyền và đồng bộ

Mỗi PASS dưới đây chỉ là phạm vi case đã chạy, không có nghĩa mọi action/biến thể trên APK Release đã được nghiệm thu.

| Miền | Case HTTPS đã chạy |
|---|---|
| Khách hàng | Tạo, retry, sai tenant; trình duyệt Offline/receipt loss; update CAS/conflict riêng |
| Đơn hàng | Tạo hai dòng cùng sản phẩm khác ĐVT, receipt/retry và tenant denial |
| Thu chi | Tạo phiếu chi và retry; delta 100đ đến Home SQLite |
| Kiểm kê | Tạo kiểm kê theo planner hiện hữu, retry, tenant denial |
| Nhập kho | Tạo nghiệp vụ và chi phí theo planner, retry, tenant denial; đọc trang và 12 truy vấn sau index PASS đúng phạm vi trong bảng trên; trạng thái/khách hàng chưa có case dương tính |
| Xuất kho | Tạo theo planner/stock fence, retry, tenant denial |
| Giao hàng | Tạo chứng từ compound, retry, tenant denial |
| Hồ sơ nhân viên | Tạo theo whitelist, retry, tenant denial |
| Tạm ứng | Tạo 100đ và duyệt; advance/financial/reference theo quy tắc gốc, retry và tenant denial |
| Chốt lương | Từ công được duyệt, xác nhận hai bên; lưu liên kết fingerprint và chốt mới |
| Vào/ra ca | Đăng ký thiết bị qua Identity Center HTTPS gốc; WiFi lấy từ AVD API 29, verifier gốc, retry; sai secret bị từ chối |
| Điều chỉnh công | Tạo yêu cầu, duyệt structured correction; case từ chối giữ nguyên nguồn |
| Xác nhận công | Nhân viên và quản lý xác nhận theo fingerprint, history và receipt riêng |
| Thanh toán/đối soát | Phiếu chi Firestore thật, nhận tiền, đối soát; cash và manual bank/partial cases |

Provenance của tám nhóm ghi đầu: từng case PASS trong `real-firebase-https-missing-index-and-browser-config.json`. Tổng lượt chạy cũ đó FAIL vì index/harness ở bước sau; không đổi trạng thái cũ thành PASS. Các nhóm HR có báo cáo riêng `real-firebase-https-payroll-chain-pass.json`. Các lần lỗi fixture, package và runtime đều giữ lại trong hồ sơ Local.

- JWK công khai/RS256 grant, Auth thật, Android origin `https://localhost`, preflight 204; thiếu token 401, origin không hợp lệ 403: PASS HTTPS QA.
- Thu hồi Firebase refresh sessions thật: token ID cũ bị API từ chối 401. Thu hồi quyền tài chính: replay receipt không vượt qua quyền hiện thời.
- Tài khoản Sản xuất cùng tenant, scope hợp lệ nhưng thiếu quyền thanh toán: API 403. Kiểm tra theo action hiện thời, không dựa tên vai trò.
- Tài khoản có Nhập kho nhưng không có `home.read`: imports head 200, chỉ source `warehouseImports`; Home và bảng lương của người khác 403 sau cấu hình quyền tường minh. Không suy deny từ chức danh.
- Conflict: một sửa mới được chấp nhận; sửa dựa bản cũ trả receipt conflict bất biến, retry giữ receipt và không ghi đè note mới.

## Web Offline và đối chiếu

`real-firebase-https-browser-pass.json`: lưu khách hàng + Outbox trong transaction SQLite; reload và đóng/mở browser khi Offline giữ nguyên payload/command/idempotency key. Cố ý làm mất response sau khi Server ghi; Local giữ `PENDING_SYNC`, sau retry mới `SYNCED`. Server có một receipt, hai replay bổ sung không tạo chứng từ trùng. A không đọc được bản ghi của B; quay lại B vẫn có dữ liệu.

`real-firebase-https-home-delta-pass.json`: Home repository/worker thật, SQLite mã hóa và Firestore cùng generation/checkpoint. **2.525 giá trị số** trước/sau delta có chênh lệch tuyệt đối lớn nhất **0**; không gọi đây là 2.525 KPI độc lập. Reload Offline khôi phục báo cáo. Phiếu chi QA 100đ tạo khi browser Offline làm checkpoint **12 → 13**, generation giữ nguyên, số expenses **1 → 2**, chi phí ngày **1.500.000 → 1.500.100đ**, đối chiếu sau delta tiếp tục bằng 0. Retry không tăng số chứng từ.

Browser headless không cấp persistent-storage mode (`persistent: false`); đóng/mở và reload đã kiểm chứng trên IndexedDB hiện có. Không tuyên bố đã thử eviction/storage exhaustion hoặc mọi loại trình duyệt.

## Liên kết HR → tài chính thực tế

Nguồn: `real-firebase-https-payroll-chain-pass.json` và `financial-record-links.json`.

- Attendance: `2026-10-30_qa_release_20261114_1794626400001_employee_a`.
- Timesheet: `6b0b445085d3ff30c100624096bb09b510691f292e9e9b07031ee4f1021b82ea`.
- Period: `payroll_qa_release_20261114_1794626400001_tenant_a_2026-10`.
- Snapshot: `payroll_qa_release_20261114_1794626400001_tenant_a_2026-10_qa_release_20261114_1794626400001_employee_a`.
- Payment: `qa_release_20261114_1794626400001_payment`.
- Expense: `payroll_payment_5db7580d185ebcb8fefea3d8ba7ebf5378e5119bec502dec6c8bf570365bfdf6`.
- Audit chốt hiện hữu: `payroll_period_lock_payroll_qa_release_20261114_1794626400001_tenant_a_2026-10`. Đây là audit, không phải bút toán General Ledger mới.

| Thời điểm | Phải trả | Đã trả | Còn lại |
|---|---:|---:|---:|
| Chốt từ nguồn công mới đã xác nhận | 915.385đ | 0đ | 915.385đ |
| Chi, xác nhận nhận tiền và đối soát | 915.385đ | 915.385đ | 0đ |

Một phiếu chi sau retry; snapshot giữ nguyên. Chứng từ có `approvalStatus=approved`, `handoverStatus=confirmed`, người thực hiện, principal và nguồn chi. Server cần `payroll.view_all_payroll`, `finance.create_expense` và `finance.approve_driver_cashflow`. Không cho trả vượt dư.

`real-firebase-https-bank-partial-pass.json`: case riêng 1.000đ, phiếu chi thủ công Chuyển khoản 400đ từ account công ty QA đã cấu hình, sau đó tiền mặt 600đ. Dư 1.000 → 600 → 0đ, hai phiếu hợp lệ sau retry, nguồn lương giữ nguyên; tài khoản ngoài danh mục bị từ chối. **Không gọi ngân hàng thật, không tạo số dư ngân hàng, không tuyên bố đối soát sao kê ngân hàng.**

Kỳ khóa vẫn khóa; không tự hạch toán điều chỉnh công sau khóa kỳ. Quy tắc đó tiếp tục chờ Owner như quyết định trước.

## Build và kiểm thử liên quan

- Targeted regression nền **61/61 PASS**, không skip, gồm artifact boundary, current RBAC, scope, transaction/idempotency, financial projection và release gate. Sau sửa gate/HTTP có **14/14** targeted cases PASS và **6/6** package/host cases PASS. Các nhóm có overlap, không cộng thành số bài độc lập.
- Firestore Rules integration **21/21 PASS trên Emulator**. Guard mới chặn client giả/sửa/xóa voucher lương; chưa áp dụng Rules lên cloud. Trước khi bật thanh toán Production phải đưa guard đã kiểm chứng này vào đợt phát hành được duyệt.
- Functions export load PASS. Artifact build/factory load PASS; JWK/auth và business reads đã kiểm tra trên chính package HTTPS.
- Web build PASS từ source chuẩn; `buildId=25b1b22237a3f652a2aeaf7bc84ece21e1f58955`; validator kiểm tra 163 tệp HTML/JS/JSON, 0 Platform runtime markers; manifest chứa tổng 179 tệp build.
- Web ZIP đã cấu hình `trusted-v1`, public JWK Production đã xác minh và endpoint `https://app.hdconnect.net/api/offline/`. Đây là **compile candidate chưa deploy**; endpoint live còn 404, không được xem build thành công là Production Offline PASS. Bản compile trước không bật Offline được giữ lại để truy vết.
- Lượt duyệt bốn index chỉ thay metadata và cấu hình index trong source. Đã xác minh 94 runtime input hashes không đổi và không có diff mã Web/Android/Functions; không tạo lại APK/Web build hoặc chạy lại benchmark đã PASS. Runtime artifact vẫn truy vết tới `25b1b222`, cấu hình index tới `5287ff6e`; đây là hai mốc khác nhau, không tự đổi build ID cũ thành commit mới.
- Hash/path chính xác nằm trong `.local-dev/final-blocker-20261114/release-build-manifest.json`.
- Keystore, mật khẩu, token, profile browser và dữ liệu thật không nằm trong commit hoặc gói bàn giao. Một lỗi harness từng ghi header QA vào log Local; đã redact và thu hồi các phiên QA, giữ lại thông tin lỗi. Không có token QA đó trong artifact bàn giao.

## Android Release — BLOCKED

- Package từ source/Capacitor: `com.hdmanager.app`; cấu hình gốc `versionName=1.0.12`, `versionCode=26110401`. Bản thực xuất và code nâng cấp phải xác minh sau khi ký; chưa có APK mới để khẳng định metadata đầu ra.
- Giữ `hdmanager-upload-key.jks`, alias `hdmanager-upload`, SHA-256 tệp mã hóa `d5d616282282ea86ac1a99247b785fdedec9b93a399a6e3f03037693b236a43d`.
- Keystore identity **PASS_BYTE_HASH_ONLY**; metadata PKCS12 đọc được alias nhưng integrity/private key/certificate vẫn BLOCKED khi thiếu mật khẩu. Không ghi PASS toàn bộ signing identity.
- `HD_RELEASE_KEYSTORE_BASE64` có trên GitHub. **`HD_RELEASE_STORE_PASSWORD` và `HD_RELEASE_KEY_PASSWORD` vẫn thiếu**; kiểm tra metadata GitHub HTTP 200, Secret Manager cũng không thấy tên secret Android/release/keystore. Không đọc giá trị secret.
- Certificate SHA-256 của APK Production giữ đối chứng: `d5c0d0187e27d7909b9024e83287c7a2d3823252dd66a5617351a737261ccb35`; chưa khẳng định keystore hiện tại khớp certificate này khi chưa mở khóa/ký thử.
- Chưa có APK/AAB Release, chưa có SHA của chúng, chưa cài mới/nâng cấp hoặc smoke test APK Release. Không lấy dev.83/debug làm bằng chứng Release.

Đã kiểm tra có chọn lọc 156 file config/env HD Manager, đúng các target Credential Manager liên quan, tên secret Cloud được cấp quyền, đúng bốn source backup Owner cho phép và hai mốc Git chứa cấu hình Android liên quan. Không tìm được literal mật khẩu ký chính thức có thể xác minh; không mở rộng tìm dữ liệu cá nhân, không đoán/brute-force. Một lỗi parser nhận biểu thức chương trình làm candidate đã được phân loại lại và giữ riêng; kết quả cuối không có cặp literal chính thức. Hai GitHub password secret vẫn MISSING. Signing preflight và APK/AAB **BLOCKED**, không chạy workflow biết chắc thiếu secret hoặc tạo khóa thay thế.

Người giữ khóa phải cung cấp hai secret hiện hữu qua GitHub Actions Secrets hoặc secret manager được cấp quyền. Không gửi mật khẩu vào chat, không đoán hoặc tạo mật khẩu/khóa mới.

## Blocker và trạng thái triển khai

1. **Android:** hai mật khẩu ký chính thức thiếu, nên signing/upgrade/Release APK-AAB chưa thể chạy.
2. **Index nhập kho — đã đóng trong phạm vi xác minh:** cả năm index đã READY; 12 ca liên quan PASS, không còn 503 do thiếu index trong các ca này. Ca có bản ghi khớp trạng thái/khách hàng vẫn NOT VERIFIED vì tập nguồn không có các trường đó; không biến giới hạn dữ liệu thành PASS toàn nghiệp vụ.
3. **Issuer Production — đã chuẩn bị:** `HD_OFFLINE_SIGNING_KEY_PEM`, version 1 **ENABLED**; public key SPKI SHA-256 `7be5bd3ec53770959551a69d181b767bfb78beedf6c4b703ed8f8fa9269a3f6b`. Kiểm tra nonce và checksum upload PASS. Private PEM chỉ tồn tại trong RAM và Secret Manager, không lưu ra file/log/Git. Public config `HD_OFFLINE_VERIFYING_JWK` đã được chuẩn bị nhưng chưa áp dụng lên service live. Đây không phải khóa Android.
4. **Các bước phát hành phụ thuộc:** Rules guard hẹp, host/issuer live, signing và smoke/upgrade APK, readiness artifact cùng commit và smoke sau deploy chưa được thực hiện. Component/API proof không thay thế APK Release UI hoặc smoke ứng dụng sau triển khai. Chỉ làm sau khi các chốt trên được giải quyết; không bỏ gate.
5. **Full UI HTTPS QA — READY trong phạm vi smoke:** managed CORS và đăng nhập UI thực đã đóng theo bảng trên. API/issuer vẫn là QA tạm; readiness và rollout Production không được suy từ QA UI PASS.

Trước khi tạo secret, đã kiểm tra một billing account chỉ liên kết project này, một active location-version toàn cục, 43 vùng không có secret bổ sung, không có destroy/delete trong tháng. Sau tạo có 2/6 active versions trong mức miễn phí. Provisioning không gọi `AccessSecretVersion`; management operation miễn phí theo [Google Cloud Secret Manager pricing](https://cloud.google.com/secret-manager/pricing). Điều kiện không phát sinh phí được kiểm tra cho thao tác provisioning này; không cam kết lưu lượng truy cập sau deploy luôn miễn phí. Chưa kích hoạt hoặc liên kết Billing mới. Bằng chứng: `production-offline-issuer-verification.json` và các báo cáo `offline-issuer-*`.

Website `https://app.hdconnect.net` đọc lại lúc 16:08 ngày 14/11/2026 (giờ Việt Nam) vẫn có build `577d303144421b1c0e6e822ce03912ce42d5e1f4`; API grant/JWK public còn 404. Không tạo tag, không deploy website/Rules hoặc phát hành Google Play. Chỉ thay CORS managed config của đúng ba Identity Functions theo phê duyệt riêng; source Functions và dữ liệu tenant thật không đổi. Năm index và Offline secret được Owner phê duyệt trước đó được giữ nguyên. Source được chuẩn bị fast-forward main theo yêu cầu mới, không tự kích hoạt deploy; kết quả remote/CI nằm trong checkpoint. Backup/rollback cũ được giữ nguyên; rollout chưa bắt đầu nên không có rollback activation trong lượt này.

Đợt đóng hai blocker chạy thêm **13/13 kiểm thử liên quan PASS**, không skip: host/API, signing configuration và workflow/readiness guards. Đây là regression chọn lọc, không chạy lại benchmark dev.83/dev.42.

CI #245 của main `11634cb0` dừng ở test source-contract công nợ cũ, vì regex yêu cầu guard công nợ đứng ngay sau xác thực. Guard lương được thêm trước bằng AND nên không khớp regex, trong khi bảo vệ vẫn còn. Đã sửa test để kiểm tra các điều kiện AND cấp ngoài bắt buộc và chặn OR bypass; không sửa Rules/runtime để chiều test. Bổ sung 9 thao tác tạo/sửa/xóa bị từ chối trên ba collection server-managed. Test công nợ PASS và **22/22 Rules integration cases PASS trên Emulator**. Giữ lỗi CI #245, không đổi kết quả cũ thành PASS; kết quả pipeline sau sửa nằm trong checkpoint.

Checkpoint tiếp tục: `.local-dev/final-blocker-20261114/release-checkpoint.json`. Không chạy lại các phần PASS khi xử lý secret/index/issuer, trừ kiểm thử bị ảnh hưởng.
