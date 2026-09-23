# Cân gia cầm - Google Play release checklist

Các trang công khai dành riêng cho ứng dụng:

- Privacy policy: `https://hdconnect.net/apps/can-gia-cam/privacy`
- Terms of use: `https://hdconnect.net/apps/can-gia-cam/terms`
- Data deletion: `https://hdconnect.net/apps/can-gia-cam/delete-data`

Trước mỗi lần gửi AAB/APK lên Google Play Console, người phát hành phải đối chiếu bản build thực tế với các trang trên. Website không thể thay thế việc rà soát mã ứng dụng, Android manifest và SDK của bản phát hành.

## Đối chiếu bắt buộc

1. Xác nhận tên ứng dụng, application ID/package name và email hỗ trợ trong Play Console đúng với bản phát hành.
2. Liệt kê mọi quyền có trong `AndroidManifest.xml`, bao gồm Bluetooth/Nearby devices, vị trí, camera, bộ nhớ, thông báo và Internet. Xóa quyền không dùng; mô tả đúng mục đích của mọi quyền còn lại.
3. Rà soát mã nguồn và toàn bộ SDK bên thứ ba để xác định chính xác dữ liệu được thu thập, chia sẻ, truyền ra ngoài thiết bị, mã hóa khi truyền và khả năng người dùng yêu cầu xóa.
4. Khai báo Data safety trong Google Play Console khớp chính xác với bản build. Nếu ứng dụng thu thập hoặc chia sẻ thêm dữ liệu so với chính sách hiện tại, phải cập nhật chính sách trước khi phát hành.
5. Gắn URL xóa dữ liệu riêng của Cân gia cầm trong mục Data deletion của Play Console. Không dùng URL xóa dữ liệu của HD Manager.
6. Mở cả ba URL bằng thiết bị không đăng nhập, kiểm tra HTTPS, điều hướng và email liên hệ hoạt động.
7. Kiểm tra biểu mẫu Content rating, Target audience, Ads, App access, Financial features và các tờ khai khác theo đúng chức năng thực tế của ứng dụng.

## Quy tắc cập nhật chính sách

Khi bổ sung tính năng hoặc SDK, phải cập nhật đồng thời: chính sách bảo mật, mục Data safety, khai báo quyền, điều khoản nếu phạm vi dịch vụ thay đổi, và trang xóa dữ liệu nếu quy trình xóa thay đổi. Không đưa một bản build có phạm vi thu thập dữ liệu rộng hơn nội dung đã công bố.
