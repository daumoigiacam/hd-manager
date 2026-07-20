# Báo cáo hiệu năng HD Manager

- Thời gian chạy: 2026-07-13T12:11:39.972Z
- Máy kiểm thử: Windows_NT 10.0.26300 • CPU 13th Gen Intel(R) Core(TM) i9-13980HX • RAM 32387 MB
- Ghi chú: Đây là kiểm thử mô phỏng cục bộ và phân tích tĩnh, không bắn tải thật vào Firebase production để tránh phát sinh chi phí hoặc ảnh hưởng dữ liệu thật.

## Kết quả theo quy mô user

| User đồng thời | Trạng thái hiện tại | Mở màn hình hiện tại | RAM/session hiện tại | Firestore reads/session | Realtime channels | Trạng thái mục tiêu sau tối ưu | Reads/session mục tiêu |
|---:|---|---:|---:|---:|---:|---|---:|
| 100 | WARN | 1263 ms | 7 MB | 7.890 | 4.100 | PASS | 192 |
| 500 | FAIL | 5781 ms | 34 MB | 36.120 | 20.500 | PASS | 240 |
| 1.000 | FAIL | 11543 ms | 67 MB | 72.120 | 41.000 | PASS | 300 |
| 5.000 | FAIL | 57681 ms | 337 MB | 360.400 | 205.000 | PASS | 780 |
| 10.000 | FAIL | 115357 ms | 674 MB | 720.800 | 410.000 | PASS | 1.380 |
| 50.000 | FAIL | 576819 ms | 3368 MB | 3.604.000 | 2.050.000 | PASS | 1.600 |
| 100.000 | FAIL | 1153577 ms | 6737 MB | 7.208.000 | 4.100.000 | PASS | 1.600 |
| 200.000 | FAIL | 2307122 ms | 13473 MB | 14.416.000 | 8.200.000 | PASS | 1.600 |

## CPU / RAM / API / Storage

| User | CPU gom nhóm dữ liệu | RAM benchmark | API webhook worst-case hiện tại | API webhook mục tiêu | Upload/ngày | Download/ngày hiện tại | Download/ngày mục tiêu |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1 ms | 1 MB | 2.006 reads | 3 reads | 6 MB | 947 MB | 320 MB |
| 500 | 3 ms | 1 MB | 2.006 reads | 3 reads | 31 MB | 21.672 MB | 1.600 MB |
| 1.000 | 6 ms | 1 MB | 2.006 reads | 3 reads | 63 MB | 86.544 MB | 3.200 MB |
| 5.000 | 31 ms | 11 MB | 2.006 reads | 3 reads | 315 MB | 2.162.400 MB | 16.000 MB |
| 10.000 | 53 ms | 8 MB | 2.006 reads | 3 reads | 630 MB | 8.649.600 MB | 32.000 MB |
| 50.000 | 326 ms | 16 MB | 2.006 reads | 3 reads | 3.150 MB | 216.240.000 MB | 160.000 MB |
| 100.000 | 540 ms | 16 MB | 2.006 reads | 3 reads | 6.300 MB | 864.960.000 MB | 320.000 MB |
| 200.000 | 1021 ms | 16 MB | 2.006 reads | 3 reads | 12.600 MB | 3.459.840.000 MB | 640.000 MB |

## Bottleneck phát hiện

- **OK** Realtime full-collection listeners: Không phát hiện listener toàn collection trong App.jsx. Khuyến nghị: Tách listener theo màn hình, where(companyId/dateKey), orderBy + limit, pagination và tổng hợp dashboard.
- **OK** REST fallback full pagination: Có REST fallback đọc theo pageSize=1000 cho từng collection. Khuyến nghị: Chỉ fallback collection quan trọng khi app foreground; tránh đọc nền và tránh refresh toàn bộ nếu listener đang khỏe.
- **HIGH** Webhook legacy scan: functions/index.js có fallback quét 2000 orders nếu mã thanh toán cũ thiếu field lookup. Khuyến nghị: Bắt buộc lưu paymentCode/orderCode/invoiceCode đã chuẩn hóa và index; migration bổ sung field lookup cho đơn cũ.
- **MEDIUM** Large single React file: App.jsx hiện khoảng 3.592.790 ký tự. Khuyến nghị: Tách module theo route/service để lazy loading thật sự, giảm parse/compile trên máy RAM 3GB.

## Kết luận

- 100-1.000 user: có thể vận hành nếu dữ liệu mỗi công ty chưa quá lớn, nhưng vẫn cần theo dõi RAM và số listener.
- 5.000 user trở lên: kiến trúc hiện tại bắt đầu nghẽn vì full realtime listeners và tải nhiều collection cùng lúc.
- 50.000-200.000 user: cần bắt buộc chuyển sang query theo màn hình, phân trang, collection group/index chuẩn, dashboard aggregate và cache ảnh/dữ liệu. Không nên dùng full collection listener ở quy mô này.
- Tối ưu an toàn đã áp dụng trong app: REST fallback không tự refresh khi app đang ở nền hoặc offline, giảm read/CPU nền mà không làm mất dữ liệu.

