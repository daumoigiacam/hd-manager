# Báo cáo tích hợp Lương đánh giá vào Bảng lương

## Phạm vi

- Module Bảng lương chỉ đọc kết quả cuối cùng của Module Đánh giá.
- Không tạo công thức sao hoặc công thức thưởng mới trong Bảng lương.
- Không thay đổi dữ liệu, cấu trúc Firestore, API, quyền, SePay hoặc các khoản lương hiện có.
- Dữ liệu được đối chiếu theo đúng `employeeId` và `monthKey` của kỳ lương.

## Luồng dữ liệu

```text
employeeReviews + attendance + orders + deliveryReports
                         |
                         v
buildEmployeeReviewSummary (logic hiện có của Module Đánh giá)
                         |
                         v
projectEvaluationSummaryToPayroll (read-only, không tính lại)
                         |
                         v
applyEvaluationBonusToSalaryDetails
                         |
                         v
Bảng lương: grossSalary + evaluationBonus, netSalary + evaluationBonus
```

Module Bảng lương sử dụng dữ liệu realtime đã được tải sẵn của công ty, lọc đúng tháng trước khi tổng hợp và không tạo thêm listener hoặc truy vấn Firestore riêng.

## Thay đổi

- `src/App.jsx`
  - Truyền dữ liệu đánh giá và báo cáo giao hàng vào Bảng lương.
  - Lọc dữ liệu đúng kỳ lương bằng `useMemo`.
  - Gọi hàm tổng hợp chính thức của Module Đánh giá rồi chuyển kết quả sang Bảng lương bằng adapter chỉ đọc.
  - Cộng `Lương đánh giá` đúng một lần vào tổng trước khấu trừ và thực nhận.
  - Hiển thị tổng Lương đánh giá, dòng chi tiết cho từng nhân viên và popup chỉ đọc.
  - Nhân viên chưa có dữ liệu hiển thị `0 đ` và `Chưa có dữ liệu đánh giá`.
- `src/utils/payrollEvaluationBonus.js`
  - Adapter chỉ đọc, kiểm tra đúng nhân viên và đúng kỳ.
  - Không chứa bảng quy đổi sao hoặc tiền thưởng.
  - Không sửa đổi đối tượng nguồn của Đánh giá hay Bảng lương.
- `tests/payroll-evaluation-integration.test.mjs`
  - Bộ kiểm thử 10 trường hợp đối chiếu.
- `package.json`
  - Thêm lệnh `test:payroll-evaluation` và nối vào `test:all`.

## Đối chiếu 10 trường hợp

| # | Trường hợp | Kết quả |
|---|---|---|
| 1 | Không có đánh giá | PASS - 0 đ |
| 2 | Sai nhân viên | PASS - từ chối dữ liệu |
| 3 | Sai tháng | PASS - từ chối dữ liệu |
| 4 | Không có nguồn đánh giá thực tế | PASS - ghi chú chưa có dữ liệu |
| 5 | Sao, điểm và thưởng cuối được sao chép nguyên trạng | PASS |
| 6 | Đánh giá tự động từ chấm công | PASS |
| 7 | Đánh giá từ phản hồi khách hàng | PASS |
| 8 | Thưởng được cộng đúng một lần vào gross/net | PASS |
| 9 | Không có đánh giá không làm đổi khoản lương cũ | PASS |
| 10 | Không sửa đổi dữ liệu nguồn | PASS |

## Kiểm thử và hiệu năng

- `npm run test:payroll-evaluation`: PASS 10/10.
- `npm run test:all`: PASS.
- `npm run test:design-system`: PASS.
- `npm run test:kpi`: PASS; log thiết bị vật lý là cảnh báo tùy chọn.
- `npm run build`: PASS, Vite 7.3.6, 2.351 module, 9,79 giây.
- Benchmark adapter: 100.000 lượt trong 31,126 ms, trung bình 0,3113 micro-giây/lượt trên máy kiểm thử.
- Kiểm thử giao diện thực tế:
  - Có dữ liệu: Đặng Thị Khánh Linh, tháng 08/2026, 3 sao, 3,72/5, 468.000 đ.
  - Không có dữ liệu: Lê Bảo Thoa, tháng 08/2026, 0 đ và ghi chú đúng.
  - Tải sạch ứng dụng: không có console error/warning mới trong cửa sổ kiểm tra.

## Ảnh hưởng nghiệp vụ

- Không thay đổi logic hoặc công thức của Module Đánh giá.
- Không thay đổi lương cơ bản, hoa hồng, phụ cấp, tăng ca, thưởng khác, khấu trừ hoặc công nợ.
- Tổng thực nhận chỉ tăng đúng bằng `bonus` cuối cùng do Module Đánh giá trả về.
- Dữ liệu đánh giá realtime làm Bảng lương cập nhật khi nguồn thay đổi.

## Giới hạn hiện có

Source hiện tại chưa có cơ chế chốt/khóa kỳ lương hoặc snapshot bảng lương để tích hợp. Sprint không tự tạo trường khóa hay cấu trúc dữ liệu mới nhằm tránh thay đổi nghiệp vụ và Firestore. Khi cơ chế khóa kỳ chính thức được bổ sung, adapter hiện tại có thể nhận snapshot đã khóa mà không cần thay đổi công thức Đánh giá.
