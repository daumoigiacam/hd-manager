# Chính sách quyền riêng tư HD Manager

Cập nhật: 13/07/2026

HD Manager là ứng dụng quản lý bán hàng, kho, công nợ, nhân sự, giao hàng, bản đồ và thanh toán dành cho doanh nghiệp. Chính sách này giải thích dữ liệu ứng dụng thu thập, lý do sử dụng và cách người dùng kiểm soát dữ liệu.

## 1. Dữ liệu được thu thập

Tùy theo tính năng được bật, HD Manager có thể xử lý các nhóm dữ liệu sau:

- Thông tin tài khoản: tên, số điện thoại, vai trò, công ty, bộ phận, trạng thái đăng nhập.
- Thông tin khách hàng: tên, số điện thoại, địa chỉ, vị trí giao hàng, chi nhánh, nhóm khách, nhân viên phụ trách, lịch sử mua hàng.
- Dữ liệu bán hàng: đơn đặt hàng, hóa đơn, phiếu xuất kho, báo cáo giao hàng, thu chi, công nợ, thanh toán.
- Dữ liệu kho và sản phẩm: nhập kho, xuất kho, tồn kho, giá vốn, báo giá, định mức hao hụt.
- Dữ liệu nhân sự: chấm công, lương, ứng lương, đánh giá, tài sản bàn giao.
- Dữ liệu vị trí: vị trí GPS để chấm công, vị trí khách hàng, chỉ đường giao hàng, vị trí tài xế trong phiên giao hàng khi người dùng cho phép.
- Ảnh và tài liệu: ảnh hóa đơn, chứng từ, tài sản, giấy tờ nhân sự hoặc ảnh tải lên do người dùng chọn.
- Danh bạ: chỉ đọc liên hệ khi người dùng bấm chức năng lấy từ danh bạ để thêm khách hàng.
- Camera: dùng để chụp ảnh, quét mã QR hoặc tải chứng từ khi người dùng chủ động mở camera.
- Microphone: dùng cho chức năng ghi âm/nhập nhanh bằng giọng nói nếu doanh nghiệp bật tính năng này.
- Thông báo: thông báo đơn hàng, thanh toán, công nợ, tin nhắn, chấm công, giao hàng.
- Dữ liệu kỹ thuật: lỗi ứng dụng, trạng thái đồng bộ, nhật ký thao tác và thông tin cần thiết để bảo mật, chống gian lận, khôi phục dữ liệu.

## 2. Mục đích sử dụng

HD Manager sử dụng dữ liệu để:

- Vận hành nghiệp vụ bán hàng, giao hàng, kho, công nợ, thu chi, nhân sự và bảng lương.
- Đồng bộ dữ liệu giữa tài khoản chủ doanh nghiệp, nhân viên, tài xế và khách hàng.
- Tự động đối soát thanh toán, cập nhật công nợ và gửi thông báo.
- Bảo vệ dữ liệu công ty, kiểm soát phân quyền, ghi nhật ký thao tác.
- Cải thiện hiệu năng, sửa lỗi và ổn định ứng dụng.

## 3. Chia sẻ dữ liệu

HD Manager không bán dữ liệu cá nhân. Dữ liệu có thể được xử lý bởi các dịch vụ cần thiết để ứng dụng hoạt động:

- Firebase/Google Cloud để xác thực, lưu trữ, đồng bộ realtime, hosting, storage và thông báo.
- Dịch vụ thanh toán/đối soát như SePay hoặc nhà cung cấp được doanh nghiệp cấu hình.
- Dịch vụ bản đồ hoặc chỉ đường khi doanh nghiệp bật tính năng bản đồ.
- Ứng dụng bên ngoài như Zalo, ngân hàng hoặc bản đồ khi người dùng chủ động bấm chia sẻ, mở thanh toán hoặc chỉ đường.

## 4. Vị trí và background location

Ứng dụng chỉ sử dụng vị trí khi cần cho chấm công, cập nhật GPS khách hàng, bản đồ giao hàng hoặc dẫn đường. Bản Android hiện không khai báo quyền `ACCESS_BACKGROUND_LOCATION`. Nếu sau này doanh nghiệp cần theo dõi tài xế nền liên tục, ứng dụng sẽ phải bổ sung màn hình giải thích rõ ràng và khai báo riêng trên Google Play trước khi phát hành.

## 5. Bảo mật

- Dữ liệu truyền qua mạng bằng HTTPS.
- Mỗi công ty được phân quyền và tách dữ liệu theo tài khoản công ty.
- Dữ liệu nhạy cảm như webhook secret, API key máy chủ và khóa thanh toán không được lưu công khai trong source hoặc trên thiết bị người dùng.
- Ứng dụng ghi nhật ký thao tác quan trọng để truy vết chỉnh sửa, xóa hoặc đối soát.

## 6. Lưu trữ và xóa dữ liệu

Dữ liệu được lưu trong thời gian doanh nghiệp còn sử dụng dịch vụ hoặc theo yêu cầu kế toán, pháp lý và vận hành. Chủ doanh nghiệp hoặc quản trị viên có thể yêu cầu xuất, chỉnh sửa hoặc xóa dữ liệu phù hợp với quyền quản trị và quy định hiện hành.

## 7. Quyền của người dùng

Người dùng có thể:

- Yêu cầu xem hoặc cập nhật thông tin cá nhân.
- Thu hồi quyền camera, vị trí, danh bạ, thông báo trong cài đặt điện thoại.
- Yêu cầu công ty quản lý tài khoản xóa hoặc khóa tài khoản khi không còn sử dụng.

## 8. Liên hệ

Nếu có câu hỏi về quyền riêng tư hoặc yêu cầu xóa dữ liệu, vui lòng liên hệ chủ doanh nghiệp đang vận hành HD Manager hoặc email hỗ trợ: `support@hdmanager.app`.
