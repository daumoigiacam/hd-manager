# HD Manager 1.0.10 — chuẩn bị phát hành ngày 30/10/2026

Owner đã yêu cầu push main, triển khai `https://app.hdconnect.net` và tạo APK sau báo cáo Development. Chỉ thị này cho phép phát hành production; không phải tuyên bố tất cả mục tiêu hiệu năng đã PASS.

## Phạm vi

- Đồng bộ Size, giá và ĐV đặt giữa đơn đặt với cấu hình khách bằng một transaction.
- Giữ snapshot, tách Con/Kg, chống replay, kiểm tra đồng thời và giữ nháp offline.
- Rules bảo vệ cấu hình khách và guard trigger tránh đọc lại tin nhắn khi chỉ đổi cấu hình sản phẩm.
- APK `com.hdmanager.app`, versionName `1.0.10`, versionCode `26103001`, dùng khóa ký đã có; không dùng gói Acceptance/preview.
- Thêm kiểm thử Emulator của tính năng vào workflow phát hành.

## Kiểm tra và cách phát hành

Giữ các bước audit, lint, typecheck, functional tests, rules, performance/stress/KPI và xác minh bundle Firebase trong workflow. Chỉ phát hành web qua workflow manual với `confirm_production_release=true`; xác minh SHA của index và commit trong version.json do workflow phục vụ trên production.

Rules production đã được sao lưu local trước thay đổi. Chỉ cập nhật rules Firestore và mã của trigger `syncCustomerMessageAssignment`, không deploy lại các Function thanh toán hoặc sửa chứng từ doanh nghiệp. CLI báo nhầm xung đột HTTPS/background; API Google xác nhận tài nguyên đang hoạt động là Gen2 Firestore. Đã cập nhật source/runtime của đúng tài nguyên Gen2 qua API với updateMask giới hạn, giữ nguyên event filters/IAM/service environment. Trigger tên riêng tạo trong lúc xử lý chẩn đoán đã được gỡ; source cuối cũng chỉ giữ một export phân công khách hàng để tránh xử lý trùng ở các lần deploy sau.

Audit phát hành phát hiện rules đang deploy khác bản repository từ trước. Dùng `scripts/prepare-customer-product-rules-release.mjs` để bổ sung đúng guard mới vào bản sao rules đang hoạt động; không đưa hàng trăm dòng thay đổi khác của repository lên Firebase trong lần này. Bộ rules hợp nhất đã qua kiểm thử Emulator riêng; hash base/output và source được lưu trong `test-results/customer-release-backup/`. File `firestore.rules` trên main vẫn là bản chính sách đầy đủ để CI kiểm thử; artifact targeted ghi lại chính xác bộ rules đã deploy và phần chênh lệch còn có từ trước.

Chỉ đưa source/tests/report của tính năng vào commit. Các báo cáo audit chứa dữ liệu doanh nghiệp từ những nhiệm vụ khác vẫn ở local.

## Giới hạn còn giữ nguyên

Xem [báo cáo nghiệm thu Development](customer-product-auto-sync-20261030.md). Chưa tuyên bố đạt toàn bộ hiệu năng Android: WebView 83 của Pixel 5 không chạy được baseline, Pixel 6 bị emulator tăng RAM lên 4 GB, tỷ lệ jank VM cao và startup còn thiếu mẫu. Guard khách được giao hiện áp dụng gán trực tiếp khi không có quyền xem toàn bộ; phạm vi cây cấp dưới nhiều tầng chưa nghiệm thu.

Kết quả thực tế gồm commit, URL workflow, xác minh production, hash APK và chứng thư ký được ghi vào `release/20261030-<commit>/VERIFICATION.md` sau khi các bước kết thúc. Các artifact build không được commit vào source repository.
