# HD Manager 1.0.11 — phát hành các bản sửa hiệu năng đã kiểm chứng

Phiên bản Android mục tiêu: com.hdmanager.app, versionName1.0.11, versionCode26110101.

## Phạm vi

- Khắc phục tương thích WebView74/Android10; xử lý snapshot Firebase bằng worker có kiểm tra phạm vi tài khoản và công ty, giữ đầy đủ dữ liệu, ACK và dữ liệu chỉnh sửa đồng thời.
- Chia nhỏ đối chiếu công nợ, báo cáo, tồn kho, lịch sử và tính lương; chỉ công bố kết quả hoàn chỉnh; giữ nháp khi tính lại, có thông báo tải/lỗi và thử lại.
- Sao lưu theo luồng và ghi file trong phạm vi ứng dụng, giảm cấp phát dữ liệu lớn trên Android.
- Bỏ tính đánh giá hàng loạt không dùng trên danh sách nhân viên; tính nhóm hoạt động Giá cả theo từng chặng, lưu cache theo nguồn bất biến/tài khoản/công ty/ngày; không lưu/chia sẻ bảng giá chưa hoàn chỉnh.
- Giảm cập nhật hình học bàn phím khi bấm điều hướng; giữ hành vi nhập liệu, xoay màn hình và khôi phục sau khi đóng bàn phím.
- Chế độ worker được bật rõ trong build production. Endpoint đăng nhập regional vẫn tắt; workflow này chỉ triển khai frontend, không tạo hoặc cập nhật Firebase Functions/rules.

## Kết quả kiểm thử và giới hạn

Local lint, typecheck (phạm vi payroll/dispatch) và npm run test:all đã đạt. Nhóm core/master cuối có598 kiểm thử,597pass,1skip,0fail; đây không phải tổng số của toàn bộ các nhóm npm. Preview App kiểm tra đăng xuất/chủ doanh nghiệp/nhân viên; module không có quyền được đánh dấu không kiểm tra. Gate React thật giữ nháp và node nhập liệu, tránh công bố dữ liệu tính dở, xử lý hủy và thử lại.

Đo APK Acceptance cùng mã nguồn trên máy ảo Android10/WebView74:115 lượt/23module/5vòng. Bộ đo V2 còn24/115 phản hồi đầu tiên trên100ms, median69.7/max203.3ms. Bộ đo V3 nhẹ hơn còn29/115 trên100ms, median66.1/max189.6ms. V3 dữ liệu sẵn sàng median453.4/max4970.8ms,99/115 vượt100ms. Không có lỗi điều hướng; tiến trình ổn định và không có dòng crash trong các cửa sổ đã ghi. Không suy diễn thành không rò bộ nhớ, ổn định mọi thiết bị hoặc nghiệm thu lâu dài.

Khôi phục phiên sau JS reload: màn hình chính588.8ms, tín hiệu lõi1049.56ms, làm mới nền hết khoảng13286.9ms. Đây là tiến trình/bộ đệm đã khởi động, không phải đăng nhập mật khẩu hoặc cold boot phần cứng. Phiên native đã lưu được xác nhận còn qua cập nhật APK và force-stop/relaunch, không lưu mật khẩu.

**Mục tiêu mọi điện thoại và mọi thao tác/dữ liệu dưới100ms vẫn FAIL. Bản phát hành này không tuyên bố nghiệm thu mục tiêu đó.** Các báo cáo chứa dữ liệu công ty và profiler thô được giữ local.

## Xác minh phát hành

Push main, chạy các gate workflow và kích hoạt manual confirm_production_release=true. Xác minh version.json đúng commit, index/JS/CSS đúng byte build, chế độ worker đúng và nén HTTP hoạt động trên https://app.hdconnect.net. Bằng chứng cuối được lưu cùng artifact phát hành local. APK cài đè chỉ được bàn giao sau khi ký bằng khóa phát hành cũ và kiểm tra chứng thư; thiếu mật khẩu ký không được thay bằng khóa khác rồi gọi là APK cập nhật.


## APK cài song song theo quyết định được ủy quyền

Do mật khẩu khóa cũ chưa được khôi phục và owner yêu cầu tự quyết định để có bản cài được, phát hành thêm biến thể release com.hdmanager.app.next, tên HD Manager Mới, ký bằng khóa riêng được lưu bảo vệ ngoài source control. Bản cũ được giữ, không yêu cầu gỡ/xóa dữ liệu. Người dùng đăng nhập tài khoản hiện có trên bản mới; dữ liệu Firebase vẫn theo cùng công ty/tài khoản. Biến thể này không phải bản cập nhật cài đè cho com.hdmanager.app.

APK là release không debuggable, dùng đúng web artifact production; không đóng gói Acceptance/preview, không nhúng phiên đăng nhập. Native Google Services/Crashlytics/Performance bị bỏ ở biến thể package mới vì chưa có Android client Firebase tương ứng; Firebase Auth/Firestore JavaScript vẫn dùng cấu hình cloud đã kiểm thử. Nếu sau này có khóa cũ, có thể build lại gói com.hdmanager.app theo signing guard gốc.
