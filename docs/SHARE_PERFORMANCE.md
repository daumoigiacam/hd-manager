# Tối ưu chia sẻ hóa đơn

## Phạm vi

Luồng thanh toán SePay, webhook, đối soát công nợ và cấu trúc dữ liệu không thay đổi. Thay đổi chỉ tập trung vào việc chuẩn bị ảnh hóa đơn trước khi người dùng bấm chia sẻ.

## Nguyên nhân gây chậm trước đây

Khi bấm **Chia sẻ hóa đơn**, luồng cũ có thể thực hiện tuần tự nhiều bước ngay trên thao tác của người dùng:

1. Đọc lại dữ liệu đơn hàng.
2. Kiểm tra hoặc tạo payment request SePay nếu đơn chưa có mã thanh toán hợp lệ.
3. Ghi cập nhật payment request vào Firestore.
4. Tạo ảnh QR và tải ảnh QR dự phòng nếu cần.
5. Vẽ toàn bộ hóa đơn lên canvas.
6. Mở Web Share hoặc tạo file tải xuống.

Đặc biệt, bước gọi SePay và chờ ảnh QR bên ngoài mạng có thể làm giao diện chờ lâu. Luồng đối soát không phải nguyên nhân được thay đổi hoặc bỏ qua.

## Cách xử lý mới

- Sau khi tạo đơn thành công, `scheduleOrderShareWarmup` chạy ở nền bằng `requestIdleCallback` (hoặc `setTimeout` dự phòng).
- Sau khi sửa đơn thành công, ảnh hóa đơn được chuẩn bị lại ở nền theo dữ liệu mới.
- `warmOrderShareAssetCache` dùng cache trong bộ nhớ theo từng đơn, giới hạn 32 ảnh và thời hạn 10 phút. Khi đơn thay đổi, khóa cache cũ của đơn đó bị thay thế, không dùng ảnh cũ.
- Nếu đơn chưa có payment source SePay hoặc payment source không còn khớp hồ sơ nhận tiền, tác vụ nền gọi lại đúng luồng `onEnsureOrderPayosPayment` hiện có. Không tạo logic đối soát mới.
- Khi người dùng bấm chia sẻ, app đọc cache trước. Nếu có ảnh hợp lệ, app mở Web Share ngay và không gọi SePay trong thao tác bấm.
- Nếu cache thiếu/hết hạn hoặc tác vụ nền chưa xong, app chỉ chạy một tác vụ chuẩn bị có kiểm soát làm fallback; các lần bấm đồng thời dùng chung promise, không tạo QR trùng.
- Nếu fallback thất bại, thao tác chia sẻ báo lỗi thân thiện; không thay đổi dữ liệu thanh toán hay trạng thái công nợ.

## Các mốc đo hiệu năng

Khi bật Performance Monitor bằng `?perfMonitor=1`, `?perfCheck=1` hoặc `VITE_PERFORMANCE_MONITOR=true`, app ghi các span sau:

| Bước | Event/span |
| --- | --- |
| Đọc dữ liệu/cache | `share_invoice.read_data` và `share_invoice.cache_lookup` |
| Gọi SePay | `share_invoice.sepay_api` |
| Tạo/giải mã QR cục bộ | `share_invoice.qr_local` |
| Tải QR dự phòng | `share_invoice.qr_remote` |
| Vẽ ảnh hóa đơn | `share_invoice.render` |
| Chuẩn bị nền | `share_invoice.prepare` |
| Mở hộp chia sẻ | `share_invoice.native_share` |
| Tổng thời gian | `share_invoice.total` |

Mỗi span ghi `durationMs`, `status`, `orderId`; cache hit/miss ghi trong `share_invoice.cache_lookup`. Log có thể xem bằng Performance Monitor hoặc bật thêm `VITE_PERFORMANCE_CONSOLE=true` để in ra console khi đo thử.

## So sánh trước và sau

| Bước | Trước tối ưu | Sau tối ưu |
| --- | --- | --- |
| Đọc đơn hàng | Nằm trong thao tác chia sẻ | Đọc từ state/cache hiện tại |
| SePay | Có thể nằm trên đường bấm chia sẻ | Chạy nền sau lưu/sửa; chỉ fallback khi thiếu/hết hạn |
| QR | Tạo/tải khi bấm chia sẻ | Chuẩn bị nền và tái sử dụng ảnh hợp lệ |
| Render canvas | Chạy trước khi mở Share | Hoàn tất trước trong cache; fallback không chặn ngoài trường hợp cache thiếu |
| Mở Share | Chờ toàn bộ bước trên | Ưu tiên mở ngay khi cache hit |

Không ghi số mili-giây cố định trong tài liệu vì kết quả phụ thuộc thiết bị, trình duyệt, kích thước ảnh và mạng. Số đo thực tế được lấy từ các span ở trên; mục tiêu của luồng cache hit là không còn chờ API SePay/QR khi bấm chia sẻ.

## Kiểm soát an toàn

- Không thay đổi endpoint SePay, webhook, quy tắc đối soát, payment history hoặc cấu trúc Firestore.
- Không dùng QR cache nếu khóa đơn, thời điểm cập nhật, số tiền cần thu hoặc payment source đã thay đổi.
- Không retry vô hạn và không tạo thêm payment request khi một tác vụ cho cùng đơn đang chạy.
- Cache chỉ nằm trong bộ nhớ phiên hiện tại, không lưu bí mật thanh toán vào local storage.
