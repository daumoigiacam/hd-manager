> Cập nhật cuối hai blocker: xem `HD_MANAGER_FINAL_RELEASE_REPORT.md` và checkpoint. Báo cáo dưới đây giữ mốc kiểm tra trước thay đổi CORS; không dùng trạng thái CORS cũ làm trạng thái hiện tại.

# HD Manager — Release blocker closure

Cập nhật 14/11/2026: **RELEASE BLOCKED**.

Báo cáo đầy đủ hiện hành: [HD_MANAGER_FINAL_RELEASE_REPORT.md](HD_MANAGER_FINAL_RELEASE_REPORT.md).

Source Local: `25b1b22237a3f652a2aeaf7bc84ece21e1f58955`. GitHub main vẫn `226dfcd28cd0989d63514eeada46db576dc8fa53`; website vẫn `577d303144421b1c0e6e822ce03912ce42d5e1f4`.

Cập nhật đóng index: commit cấu hình Local `5287ff6e0aa0742101207ecebc597e404a3db884`. Chỉ thêm đúng bốn index đã được Owner duyệt; 94 runtime input hashes không đổi, không build lại hoặc đổi nhãn các APK/Web artifact cũ.

Backend chỉ sử dụng Firebase Auth/Firestore của HD Manager. Không tích hợp HD Platform hoặc tạo ledger song song. Giữ nguyên dev.83 và ngoại lệ dev.42; không chạy lại benchmark dài.

Đã sửa và kiểm chứng: scope Outbox, bootstrap gửi project/device từ grant, financial voucher lương nguyên tử, không cộng chi phí lần hai, package authority dùng chung module và journal Nhập kho cho người không có quyền Home. 61/61 targeted tests nền và 21/21 Rules Emulator cases PASS. Incremental gate/HTTP 14/14 và package/host 6/6 PASS (có overlap với nhóm nền, không cộng thành số bài độc lập).

Bằng chứng HTTPS QA: chuỗi công mới → chốt lương → chi/đối soát 915.385đ; manual bank/cash partial 400đ + 600đ; SQLite/Outbox reload/close/reconnect; conflict; current RBAC và tenant isolation; 2.525 giá trị số Home đối chiếu chênh lệch 0. Không coi component/API proof là APK Release UI acceptance.

| Chốt | Trạng thái hiện hành |
|---|---|
| Android signing | BLOCKED: thiếu `HD_RELEASE_STORE_PASSWORD`, `HD_RELEASE_KEY_PASSWORD`. Keystore gốc và alias giữ nguyên; chưa APK/AAB Release hoặc upgrade proof. |
| Imports page HTTPS | CLOSED lỗi thiếu index trong các ca đã chạy: bốn index mới READY; 12/12 truy vấn HTTPS PASS. Nhân viên trả 28 phiếu qua trang 25 + 3; kết hợp ngày/từ khóa trả 15/9/5. Trạng thái/khách hàng chỉ kiểm tra kết quả rỗng do nguồn thiếu trường; ca dương tính NOT VERIFIED. Cursor/retry/tenant đúng; fingerprint chứng từ giữ nguyên. |
| Issuer Production | PREPARED: secret `HD_OFFLINE_SIGNING_KEY_PEM` version 1 ENABLED, nonce và checksum PASS, public JWK đã chuẩn bị. Khóa riêng không lưu file/log/Git; chưa deploy. Provisioning nằm trong mức miễn phí đã kiểm tra, chưa đánh giá lưu lượng sau kích hoạt. |
| Full UI HTTPS QA | BLOCKED: giao diện App canonical đã mở nhưng Identity API live không trả CORS cho origin QA; OPTIONS với origin Production vẫn được phép. Không thay CORS, không bypass login. Component/API proof giữ đúng phạm vi. |
| Production activation | NOT PERFORMED: chỉ thực hiện sau readiness, Rules guard hẹp được áp dụng trong đợt phát hành được duyệt, signing và kiểm thử bắt buộc. |

Checkpoint: `.local-dev/final-blocker-20261114/release-checkpoint.json`.

Đã build ứng viên Web cấu hình public JWK Production và endpoint chính xác, SHA-256 ZIP `60975232fca8a5cac171fe30d133fa6fcceabbdaeb87f317295b6e16bec17183`; chưa phải bản đã deploy hoặc Production Offline PASS. Chi tiết trong `release-build-manifest.json` thuộc hồ sơ Local.

Không push, merge, deploy website/Functions/Rules hoặc phát hành Google Play trong lượt này. Đúng năm index (một cơ bản, bốn bộ lọc) và một Offline issuer secret đã được tạo theo các phê duyệt riêng; namespace QA giữ dữ liệu kiểm thử đã có. Lượt đóng bốn index không tạo hoặc sửa chứng từ; tenant thật giữ nguyên. Báo cáo ngày 13/11 và các lượt trước index giữ trong Git/hồ sơ Local để truy vết.
