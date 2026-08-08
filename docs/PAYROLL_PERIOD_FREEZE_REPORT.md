# Báo cáo đóng băng bảng lương theo từng kỳ

> Báo cáo Production Readiness mới nhất, gồm audit 13 staged snapshot, Rules đang active, dependency security và quyết định GO/NO-GO: `docs/FINAL_PRODUCTION_READINESS_REPORT.md`.

Ngày kiểm tra: 08/08/2026

## 1. Kiến trúc payroll sau nâng cấp

Module lương được tách thành bốn lớp dữ liệu độc lập:

1. **Cấu hình hiện hành của nhân viên**: dữ liệu dùng cho kỳ chưa khóa.
2. **Lịch sử chính sách lương**: mỗi phiên bản có `policyVersion`, `effectiveFrom`, `effectiveTo` và toàn bộ tham số lương tại thời điểm có hiệu lực.
3. **Snapshot kỳ lương**: bản ghi bất biến của từng nhân viên khi kỳ được khóa.
4. **Phiếu điều chỉnh sau khóa**: bản ghi riêng, nối tiếp theo thứ tự, không sửa snapshot gốc.

Trạng thái kỳ lương được chuẩn hóa thành:

- `DRAFT`: kỳ đang mở, được phép tính lại.
- `REVIEW`: kỳ đang kiểm tra.
- `LOCKED`: kỳ đã chốt, snapshot không được thay đổi.
- `ADJUSTED`: kỳ đã khóa và có phiếu điều chỉnh chính thức.

Để tương thích dữ liệu cũ, hệ thống vẫn nhận diện trạng thái chữ thường cũ (`locked`, `adjusted`, `auto_locked`).

## 2. Cách snapshot hoạt động

Khi khóa kỳ, hệ thống tạo một snapshot riêng cho từng nhân viên. Snapshot mới có `snapshotSchemaVersion = 2` và lưu:

- Danh tính nhân viên, bộ phận và kỳ lương.
- Toàn bộ chính sách áp dụng tại kỳ: lương cơ bản, lương hỗ trợ, lương trách nhiệm, hệ số, ngày công chuẩn, hoa hồng, chỉ tiêu, phụ cấp, thưởng, phạt, khấu trừ và các trường cấu hình tương thích dữ liệu cũ.
- `policyVersion`, `policyEffectiveFrom`, `policyEffectiveTo`.
- `formulaVersion` dùng tại lúc chốt.
- Dữ liệu đầu vào: ngày công, doanh thu, tăng ca, ứng lương, mua hàng nội bộ, thưởng, phạt, dư nợ đầu kỳ và dữ liệu đánh giá.
- Kết quả từng khoản cộng, từng khoản trừ, tổng lương, lương thực nhận và dư nợ cuối kỳ.
- Người chốt và thời điểm chốt.

Sau khi khóa, màn hình lịch sử lấy dữ liệu từ `payrollSnapshots`; không sử dụng lại `employees.currentSalary` hoặc cấu hình hiện hành để tính ngược lịch sử. Danh sách snapshot còn được giới hạn theo `snapshotIds` đã ghi trong kỳ khóa nhằm ngăn một bản ghi phát sinh về sau chen vào lịch sử chính thức.

## 3. Quản lý phiên bản chính sách

Mỗi nhân viên có lịch sử chính sách tại `payrollPolicies` (đồng thời đọc alias cũ `salaryPolicyHistory` nếu có). Một phiên bản chứa:

- `id`/`version`.
- `effectiveFrom`.
- `effectiveTo`.
- `formulaVersion`.
- `policy`: bản sao các trường cấu hình lương.
- Người tạo và thời điểm tạo.

Khi người quản lý thay đổi cấu hình lương, hệ thống đóng khoảng hiệu lực của phiên bản trước và tạo phiên bản mới. Kỳ chưa khóa dùng phiên bản có hiệu lực trong kỳ; kỳ đã khóa luôn dùng phiên bản nằm trong snapshot.

Ứng dụng hiện tính lương theo tháng. Vì vậy không bổ sung cách chia tỷ lệ theo ngày giữa hai chính sách trong cùng tháng, tránh tự ý thay đổi công thức nghiệp vụ đang vận hành. Nếu cần chia tỷ lệ giữa kỳ trong tương lai, phải tạo một `formulaVersion` mới được phê duyệt riêng.

## 4. Chuyển lương âm và công nợ nhân viên

Khi kỳ khóa có lương thực nhận âm:

```text
Dư nợ cuối kỳ = max(0, -lương thực nhận)
```

Hệ thống tạo `payrollDebtCarryovers` cho kỳ kế tiếp bằng khóa định danh cố định theo công ty, nhân viên và kỳ nguồn. Cách này bảo đảm chạy lại không cộng hai lần.

Kỳ kế tiếp đọc dư nợ đầu kỳ từ chứng từ chuyển nợ đã khóa, không tính lại từ cấu hình lương hiện tại. Nếu dư nợ chưa được khấu trừ hết, số còn lại tiếp tục được chuyển sang kỳ sau theo cùng quy tắc.

## 5. Thay đổi lương sau khi chốt

- Tăng hoặc giảm lương, hoa hồng, phụ cấp, thưởng, phạt hay hệ số chỉ tạo/chọn chính sách mới cho kỳ có hiệu lực.
- Snapshot của kỳ cũ không đổi.
- Báo cáo lịch sử hiển thị đúng chính sách và kết quả tại thời điểm chốt.
- Kỳ chưa khóa vẫn được tính lại theo chính sách có hiệu lực.

## 6. Điều chỉnh bảng lương đã khóa

Không cho sửa trực tiếp snapshot. Người có quyền quản lý/kế toán phải dùng chức năng **Điều chỉnh bảng lương đã chốt** và nhập lý do.

Mỗi phiếu điều chỉnh lưu:

- Snapshot nguồn và kỳ lương.
- Giá trị trước điều chỉnh.
- Giá trị sau điều chỉnh.
- Phần chênh lệch.
- Lý do.
- Người thực hiện.
- Thời gian thực hiện.
- Số thứ tự trong chuỗi điều chỉnh.
- Audit log bất biến.

Màn hình ghép snapshot gốc với phiếu điều chỉnh mới nhất để hiển thị kết quả hiệu lực, nhưng không ghi đè `salaryDetails` gốc. Nếu điều chỉnh làm đổi dư nợ, chứng từ chuyển nợ kỳ kế tiếp được cập nhật bằng tham chiếu đến phiếu điều chỉnh. Hệ thống chặn điều chỉnh nếu kỳ kế tiếp đã khóa để không làm thay đổi dây chuyền lịch sử đã chốt.

## 7. File đã sửa hoặc bổ sung

- `src/utils/payrollPolicyHistory.js`: lịch sử và bộ chọn chính sách theo hiệu lực.
- `src/utils/payrollAdjustment.js`: phiếu điều chỉnh, audit và điều chỉnh dư nợ.
- `src/utils/payrollPeriodLock.js`: trạng thái, snapshot schema v2 và dữ liệu tính chi tiết.
- `src/App.jsx`: áp dụng chính sách theo kỳ, khóa kỳ, đọc snapshot, điều chỉnh sau khóa và giao diện kiểm soát.
- `functions/payrollAutoLock.js`: chuẩn hóa trạng thái khóa tự động.
- `functions/index.js`: khóa tự động và nhận diện trạng thái mới/cũ.
- `firestore.rules`: bảo vệ snapshot, điều chỉnh, audit, kỳ khóa và chứng từ chuyển nợ.
- `tests/payroll-period-freeze.test.mjs`: 15 tình huống đóng băng bắt buộc.
- `tests/payroll-period-lock.test.mjs`: cập nhật trạng thái khóa chuẩn.
- `tests/payroll-auto-lock.test.cjs`: xác nhận khóa tự động tạo trạng thái `LOCKED`.
- `package.json`: bổ sung script kiểm thử đóng băng kỳ lương.

## 8. Database/schema

Giữ nguyên kiến trúc collection phẳng hiện có, không đổi Firebase Project và không di chuyển dữ liệu nghiệp vụ:

- `payrollPeriods`: trạng thái, danh sách snapshot chính thức, phiên bản chính sách/công thức và metadata điều chỉnh.
- `payrollSnapshots`: snapshot bất biến theo nhân viên/kỳ.
- `payrollAdjustments`: phiếu điều chỉnh bất biến sau khóa.
- `payrollDebtCarryovers`: dư nợ chuyển kỳ có nguồn gốc rõ ràng.
- `activityLogs`: nhật ký khóa kỳ, điều chỉnh và chuyển nợ.
- `employees.payrollPolicies`: lịch sử chính sách có hiệu lực.

Các trường mới có fallback nên dữ liệu cũ vẫn đọc được.

## 9. Migration

Không cần migration phá hủy hoặc ghi lại toàn bộ dữ liệu.

- Nhân viên cũ chưa có lịch sử chính sách được tạo phiên bản `legacy-v1` khi cấu hình lương được chỉnh hoặc khi hệ thống cần chuẩn hóa chính sách.
- Snapshot cũ vẫn được đọc bằng fallback tương thích.
- Snapshot mới từ thời điểm triển khai sẽ có đầy đủ policy/input/result snapshot.

Giới hạn: snapshot lịch sử được tạo trước nâng cấp có thể chỉ lưu kết quả cũ, không đủ dữ liệu để tái dựng toàn bộ tham số đã dùng. Hệ thống không tự suy đoán hoặc ghi lại lịch sử đó để tránh làm sai dữ liệu; cần đối chiếu chứng từ gốc nếu muốn bổ sung thủ công.

## 10. Kiểm thử đã chạy

| Kiểm thử | Kết quả |
| --- | --- |
| `npm.cmd run test:payroll-lock` | PASS, 11/11 |
| `npm.cmd run test:payroll-freeze` | PASS, 15/15 |
| `npm.cmd run test:payroll-debt-rollover` | PASS, 12/12 |
| `npm.cmd run test:payroll-auto-lock` | PASS, 6/6 |
| `npm.cmd run test:payroll-evaluation` | PASS, 10/10 |
| `npm.cmd test` | PASS, gồm regression và stress 11.309 thao tác |
| `node --check functions/index.js` | PASS |
| `node --check functions/payrollAutoLock.js` | PASS |
| `git diff --check` | PASS, chỉ có cảnh báo CRLF của Git trên Windows |

File `tests/payroll-period-freeze.test.mjs` bao phủ đủ 15 trường hợp bắt buộc: bất biến lương/hoa hồng/công thức/phụ cấp, chính sách tháng mới, lương âm nhiều kỳ, refresh, kỳ chưa khóa, bảo vệ kỳ khóa, audit điều chỉnh, nhiều nhân viên và báo cáo lịch sử.

Project hiện không có script `lint` hoặc `typecheck` và không dùng TypeScript, nên hai lệnh này không có để chạy. Toàn bộ kiểm thử JavaScript và build production đã chạy thành công.

## 11. Kết quả build

`npm.cmd run build`: **PASS**.

- Vite xử lý 2.362 modules.
- Thời gian build lần xác nhận cuối khoảng 9,87 giây.
- Không có lỗi import, compile hoặc bundle liên quan đến thay đổi payroll.

## 12. Rủi ro và giới hạn còn lại

1. Máy hiện tại chưa cài Java nên chưa thể chạy Firestore Emulator để kiểm tra rules bằng môi trường giả lập. Rules đã được kiểm tra tĩnh và toàn bộ test/build đã PASS, nhưng cần chạy emulator hoặc staging trước khi deploy production.
2. Quyền quản lý/kế toán hiện vẫn dựa một phần vào lớp phân quyền ứng dụng vì kiến trúc hiện tại chưa có đầy đủ role custom claims trong Firebase Auth. Rules bảo vệ tính bất biến và phạm vi công ty, nhưng nên bổ sung custom claims/backend authorization trong một sprint bảo mật riêng nếu cần chống client tùy biến ở mức cao nhất.
3. Snapshot cũ trước schema v2 không thể tự có lại toàn bộ tham số lịch sử nếu trước đây chưa lưu; không thực hiện backfill suy đoán để tránh sai số.
4. Chưa deploy Firestore Rules, Cloud Functions hoặc ứng dụng production trong phạm vi thay đổi này.
5. Chưa commit hoặc push; workspace được giữ để chủ dự án kiểm tra trước.

## Kết luận

Kỳ lương mới sau khi khóa đã độc lập với cấu hình hiện tại, có snapshot bất biến, phiên bản chính sách, chuyển dư nợ idempotent và audit trail cho điều chỉnh chính thức. Việc thay đổi chính sách hiện hành không làm thay đổi lịch sử kỳ đã chốt.
