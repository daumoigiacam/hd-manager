# Khóa kỳ lương và chuyển dư nợ sang kỳ mới

## Phạm vi

Sprint này bổ sung lớp chuyển công nợ nhân sự sau khi chốt kỳ lương. Không thay đổi cách tính lương cơ bản, hỗ trợ, trách nhiệm, hoa hồng, tăng ca, đánh giá, ứng lương hoặc các dữ liệu lịch sử hiện có.

## Luồng xử lý

1. Bảng lương tháng đang mở tính như trước.
2. Nếu có dư nợ từ kỳ trước, bảng lương hiển thị `Dư nợ đầu kỳ`.
3. Hệ thống chỉ khấu trừ tối đa phần lương dương có thể chi trả trong kỳ.
4. Khi chốt kỳ, hệ thống lưu snapshot bất biến của từng nhân sự.
5. Phần dư nợ cuối kỳ lớn hơn 0 được tạo thành một bản ghi `payrollDebtCarryovers` cho tháng kế tiếp, cùng nhật ký hệ thống.
6. Kỳ sau tự đọc đúng bản ghi của nhân sự và tháng đó để hiển thị `Dư nợ đầu kỳ`.

## Công thức chuyển nợ

```text
Du no dau ky = max(0, du no cuoi ky truoc)
Luong co the tra = max(0, thuc nhan truoc khi tru no dau ky)
Da khau tru no dau ky = min(du no dau ky, luong co the tra)
No phat sinh trong ky = max(0, -thuc nhan truoc khi tru no dau ky)
Du no cuoi ky = (du no dau ky - da khau tru) + no phat sinh trong ky
Thuc nhan = max(0, luong co the tra - da khau tru)
```

Không có trường hợp thực nhận âm. Số còn lại sẽ tiếp tục thành dư nợ đầu kỳ của kỳ sau.

## Tính bất biến và chống ghi đúp

- Snapshot kỳ đã khóa được ghi với mã cố định theo công ty, tháng và nhân sự.
- Bản chuyển nợ dùng mã `payroll_debt_{company}_{targetMonth}_{employee}`.
- Nhật ký chuyển nợ và nhật ký khóa kỳ cũng dùng mã cố định.
- Transaction Firestore ghi snapshot, chuyển nợ, nhật ký và trạng thái kỳ cùng lúc; nếu một bước lỗi, không có bước nào được ghi.
- Chạy lại scheduler hoặc thao tác chốt kỳ sau lỗi mạng không tạo thêm công nợ lần thứ hai.

## Khóa tự động

- Client chuẩn bị ảnh chụp kỳ lương hiện hành cho tài khoản có quyền Chủ doanh nghiệp/Kế toán.
- Cloud Function `autoLockPayrollPeriods` chạy mỗi phút theo múi giờ `Asia/Ho_Chi_Minh`.
- Khi tới 23:59:59 ngày cuối tháng, function khóa đúng bản snapshot đã chuẩn bị, chuyển nợ và ghi nhật ký hệ thống.
- Nếu Cloud Scheduler bị trễ sang ngày kế tiếp, plan vẫn được xử lý khi function chạy lại; việc chốt vẫn idempotent.
- Snapshot được chuẩn bị riêng từng nhân sự để không vượt giới hạn dung lượng một tài liệu Firestore.

## Nhật ký hệ thống

Mỗi lần khóa kỳ có một nhật ký `payroll_period_lock`. Mỗi nhân sự có dư nợ có một nhật ký `payroll_debt_rollover`, ví dụ:

```text
31/07 23:59 - Hệ thống đã khóa kỳ lương 2026-07 và chuyển dư nợ 10.000.000 sang 2026-08.
```

## Dữ liệu mới

- `payrollDebtCarryovers`: dư nợ đầu kỳ theo nhân sự và kỳ nhận nợ.
- `payrollAutoLockPlans`: kế hoạch khóa tự động.
- `payrollAutoLockPlanSnapshots`: snapshot đã chuẩn bị, chỉ được Cloud Function dùng để chốt.
- `activityLogs`: nhật ký khóa kỳ và chuyển nợ.

Các collection trên vẫn nằm trong cùng cấu trúc Firestore `artifacts/{appId}/public/data/*`; không thay đổi dữ liệu cũ, schema cũ hoặc Firebase project.

## Kiểm thử đã chạy

| Hạng mục | Kết quả |
| --- | --- |
| `npm run test:payroll-auto-lock` | PASS, 6/6 |
| `npm run test:payroll-debt-rollover` | PASS, 12/12 |
| `npm run test:payroll-lock` | PASS, 11/11 |
| `npm run test:payroll-evaluation` | PASS, 10/10 |
| `npm run test:all` | PASS, gồm stress test 11.309 thao tác |
| `node --check functions/index.js` | PASS |
| `npm run build` | PASS |

Các trường hợp đã bao phủ: không nợ, nợ nhỏ hơn lương, nợ lớn hơn lương, nợ phát sinh trong kỳ, chuyển nợ liên tiếp qua nhiều tháng, năm mới, snapshot bất biến, chạy lại không ghi đúp và thời điểm cuối tháng.

## Điều kiện kích hoạt production

Để khóa tự động hoạt động ngoài production, cần deploy Cloud Function mới và bảo đảm Cloud Scheduler của Firebase Functions v2 đang được bật cho project. Không deploy trong sprint này.

Việc chuẩn bị snapshot hiện được thực hiện khi Chủ doanh nghiệp hoặc Kế toán mở Bảng lương trong tháng. Đây là biện pháp an toàn để Cloud Function không tự tính lại công thức lương ở backend. Nếu doanh nghiệp cần tự khóa cả các tháng không ai từng mở Bảng lương, bước tiếp theo cần được phê duyệt riêng: đưa công thức lương vào một service dùng chung có kiểm thử đối chiếu, rồi mới để backend tự tạo snapshot.

## Giới hạn an toàn

Một transaction chốt kỳ giới hạn ở 450 lượt ghi để chừa biên cho giới hạn Firestore 500 lượt ghi. Kỳ có số nhân sự vượt giới hạn này dừng trước khi thay đổi dữ liệu và yêu cầu xử lý theo lô được thiết kế riêng.
