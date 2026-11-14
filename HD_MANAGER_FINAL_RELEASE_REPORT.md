# HD Manager — Final release evidence, 14/11/2026

**RELEASE BLOCKED. Không phải RELEASE COMPLETE.**

Source ứng viên: `25b1b22237a3f652a2aeaf7bc84ece21e1f58955`, branch Local `codex/dev83-release-closure`. Ba mốc Local: `696a91318c0a3f876c632bb3cdb48cd19d0003fc`, `a2179c2169af417b211c61b2ec1752f2a5cd864d` và `25b1b22237a3f652a2aeaf7bc84ece21e1f58955`. GitHub main được đọc lại lúc 04:27 UTC và vẫn là `226dfcd28cd0989d63514eeada46db576dc8fa53`; chưa push.

Nguồn ứng dụng chuẩn là `development/hd-manager/application`. Backend nghiệp vụ là **Firebase Auth + Firestore của HD Manager**; SQLite/IndexedDB nằm ở client. Không tích hợp HD Platform, PostgreSQL hoặc một ledger tài chính khác. Giữ nguyên nghiệm thu dev.83, ngoại lệ dev.42 và các mẫu đo cũ; không chạy lại benchmark dài.

## Phạm vi kiểm thử thật

Owner đã cho phép namespace QA cách ly trong project hiện hữu `hd-manager-c5839`. App ID QA: `hd-manager-release-qa-20261114`; identity, employee và tenant đều dùng prefix `qa_release_20261114_`. Dữ liệu là **SYNTHETIC QA**, không phải dữ liệu tài chính của doanh nghiệp.

Các bằng chứng HTTPS bên dưới dùng Firebase Auth/Firestore thật và HTTPS tunnel có kiểm soát; không dùng Emulator để thay thế HTTPS. Chỉ cổng ứng dụng được expose. Không đọc/ghi tenant thật; không đổi website hoặc Rules; không tạo project hoặc liên kết Billing. Theo phê duyệt riêng của Owner, đã tạo đúng một index cơ bản và một secret khóa quyền Offline trên cloud. Các thay đổi này là metadata toàn project, không chỉ document QA. Các tunnel đã đóng và phiên QA được thu hồi sau kiểm thử.

Kiểm thử trình duyệt dùng các module canonical: bootstrap, authorizer, encrypted vault, SQLite worker, repository, Outbox, Sync Engine và Service Worker. Đây là **component integration trên trình duyệt thật**, không được đổi tên thành nghiệm thu toàn bộ giao diện ứng dụng hoặc APK Release.

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
| `warehouse-import-page` | **PASS** trang cơ bản, ngày, từ khóa và ngày + từ khóa; **BLOCKED** nhân viên/trạng thái/khách hàng vì cần thêm index | `real-firebase-https-import-final-package-partial.json` |

Owner đã duyệt và index `warehouseImports`, scope `COLLECTION`, `companyId ASC`, `date DESC`, `__name__ DESC` đã **READY** lúc 04:14:13 UTC. Resource: `projects/hd-manager-c5839/databases/(default)/collectionGroups/warehouseImports/indexes/CICAgJjFx5sK`.

Kiểm thử package qua HTTPS sau index: **28 phiếu QA**, 27 phiếu mới tạo bằng chính API nghiệp vụ, trang **25 + 3**, không thiếu/trùng; lọc ngày 15 phiếu, từ khóa 9 phiếu, ngày + từ khóa 5 phiếu. Retry trả cùng trang; cursor sai tenant bị 403; đổi bộ lọc với cursor cũ trả reset; tenant B không nhận phiếu của A. Không trực tiếp chèn dữ liệu SQLite để làm bằng chứng.

Firestore thực tế yêu cầu thêm **4 index**: `companyId + empId + date DESC + __name__ DESC`, `companyId + createdByEmpId + date DESC + __name__ DESC`, `companyId + status + date DESC + __name__ DESC`, `companyId + customerId + date DESC + __name__ DESC` (các trường trước date là ASC). Cấu hình cụ thể ở `requested-firestore-filter-indexes.json`; chưa tạo vì không nằm trong phê duyệt index cơ bản. Các bộ lọc này trả HTTP 503, không đánh dấu PASS. Các tổ hợp chưa chạy cũng không được coi là đã kiểm chứng.

## Miền ghi, quyền và đồng bộ

Mỗi PASS dưới đây chỉ là phạm vi case đã chạy, không có nghĩa mọi action/biến thể trên APK Release đã được nghiệm thu.

| Miền | Case HTTPS đã chạy |
|---|---|
| Khách hàng | Tạo, retry, sai tenant; trình duyệt Offline/receipt loss; update CAS/conflict riêng |
| Đơn hàng | Tạo hai dòng cùng sản phẩm khác ĐVT, receipt/retry và tenant denial |
| Thu chi | Tạo phiếu chi và retry; delta 100đ đến Home SQLite |
| Kiểm kê | Tạo kiểm kê theo planner hiện hữu, retry, tenant denial |
| Nhập kho | Tạo nghiệp vụ và chi phí theo planner, retry, tenant denial; đọc trang và bốn truy vấn đã PASS; ba bộ lọc phụ thuộc index còn BLOCKED như trên |
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
- Hash/path chính xác nằm trong `.local-dev/final-blocker-20261114/release-build-manifest.json`.
- Keystore, mật khẩu, token, profile browser và dữ liệu thật không nằm trong commit hoặc gói bàn giao. Một lỗi harness từng ghi header QA vào log Local; đã redact và thu hồi các phiên QA, giữ lại thông tin lỗi. Không có token QA đó trong artifact bàn giao.

## Android Release — BLOCKED

- Package từ source/Capacitor: `com.hdmanager.app`; cấu hình gốc `versionName=1.0.12`, `versionCode=26110401`. Bản thực xuất và code nâng cấp phải xác minh sau khi ký; chưa có APK mới để khẳng định metadata đầu ra.
- Giữ `hdmanager-upload-key.jks`, alias `hdmanager-upload`, SHA-256 tệp mã hóa `d5d616282282ea86ac1a99247b785fdedec9b93a399a6e3f03037693b236a43d`.
- Metadata PKCS12 đọc được alias nhưng chưa xác minh integrity/private key/certificate khi thiếu mật khẩu.
- `HD_RELEASE_KEYSTORE_BASE64` có trên GitHub. **`HD_RELEASE_STORE_PASSWORD` và `HD_RELEASE_KEY_PASSWORD` vẫn thiếu**; kiểm tra metadata GitHub HTTP 200, Secret Manager cũng không thấy tên secret Android/release/keystore. Không đọc giá trị secret.
- Certificate SHA-256 của APK Production giữ đối chứng: `d5c0d0187e27d7909b9024e83287c7a2d3823252dd66a5617351a737261ccb35`; chưa khẳng định keystore hiện tại khớp certificate này khi chưa mở khóa/ký thử.
- Chưa có APK/AAB Release, chưa có SHA của chúng, chưa cài mới/nâng cấp hoặc smoke test APK Release. Không lấy dev.83/debug làm bằng chứng Release.

Người giữ khóa phải cung cấp hai secret hiện hữu qua GitHub Actions Secrets hoặc secret manager được cấp quyền. Không gửi mật khẩu vào chat, không đoán hoặc tạo mật khẩu/khóa mới.

## Blocker và trạng thái triển khai

1. **Android:** hai mật khẩu ký chính thức thiếu, nên signing/upgrade/Release APK-AAB chưa thể chạy.
2. **Bộ lọc nhập kho:** index cơ bản đã READY và phân trang đã PASS. Cần Owner duyệt đúng bốn index bổ sung đã chuẩn bị, sau đó kiểm thử lại ba bộ lọc đang trả 503 và các tổ hợp liên quan. Không mở rộng thay đổi metadata khi chưa có quyền.
3. **Issuer Production — đã chuẩn bị:** `HD_OFFLINE_SIGNING_KEY_PEM`, version 1 **ENABLED**; public key SPKI SHA-256 `7be5bd3ec53770959551a69d181b767bfb78beedf6c4b703ed8f8fa9269a3f6b`. Kiểm tra nonce và checksum upload PASS. Private PEM chỉ tồn tại trong RAM và Secret Manager, không lưu ra file/log/Git. Public config `HD_OFFLINE_VERIFYING_JWK` đã được chuẩn bị nhưng chưa áp dụng lên service live. Đây không phải khóa Android.
4. **Các bước phát hành phụ thuộc:** Rules guard hẹp, host/issuer live, signing và smoke/upgrade APK, readiness artifact cùng commit và smoke sau deploy chưa được thực hiện. Component/API proof không thay thế APK Release UI hoặc smoke ứng dụng sau triển khai. Chỉ làm sau khi các chốt trên được giải quyết; không bỏ gate.

Trước khi tạo secret, đã kiểm tra một billing account chỉ liên kết project này, một active location-version toàn cục, 43 vùng không có secret bổ sung, không có destroy/delete trong tháng. Sau tạo có 2/6 active versions trong mức miễn phí. Provisioning không gọi `AccessSecretVersion`; management operation miễn phí theo [Google Cloud Secret Manager pricing](https://cloud.google.com/secret-manager/pricing). Điều kiện không phát sinh phí được kiểm tra cho thao tác provisioning này; không cam kết lưu lượng truy cập sau deploy luôn miễn phí. Chưa kích hoạt hoặc liên kết Billing mới. Bằng chứng: `production-offline-issuer-verification.json` và các báo cáo `offline-issuer-*`.

Website `https://app.hdconnect.net` đọc lại lúc 04:26 UTC vẫn có build `577d303144421b1c0e6e822ce03912ce42d5e1f4`; API grant/JWK public còn 404. Không push main, không tạo tag, không deploy website/Functions/Rules, không phát hành Google Play. Đã tạo riêng index và Offline secret được Owner phê duyệt; dữ liệu tenant thật không thay đổi. Backup/rollback cũ được giữ nguyên; rollout chưa bắt đầu nên không có rollback activation trong lượt này.

Checkpoint tiếp tục: `.local-dev/final-blocker-20261114/release-checkpoint.json`. Không chạy lại các phần PASS khi xử lý secret/index/issuer, trừ kiểm thử bị ảnh hưởng.
