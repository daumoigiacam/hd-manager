# PAYROLL PERIOD FREEZE - VERIFY & HARDEN REPORT

> Báo cáo Production Readiness mới nhất, có audit 13 staged snapshot, Rules đang active và dependency audit sau vá: `docs/FINAL_PRODUCTION_READINESS_REPORT.md`.

Ngày xác nhận: 08/08/2026
Phạm vi: kiểm tra và gia cố tính bất biến của kỳ lương đã chốt
Trạng thái triển khai: **chưa commit, chưa push, chưa deploy production**

## Kết luận kiểm soát

Một kỳ lương `LOCKED`/`ADJUSTED` chỉ hiển thị từ snapshot đã đóng băng. Màn hình không tính lại từ hồ sơ nhân viên, cấu hình lương, hoa hồng, phụ cấp, đánh giá, công thức hoặc dư nợ hiện hành. Snapshot gốc không được sửa; mọi thay đổi sau chốt phải tạo adjustment và audit log riêng.

Không có migration suy đoán. Dữ liệu cũ thiếu policy/calculation snapshot được phân loại `LEGACY_NEEDS_REVIEW` hoặc `INVALID_NEEDS_REVIEW`, không được tự động thay bằng policy hiện tại.

## A. Files changed

### Mã nguồn nghiệp vụ Payroll

- `src/App.jsx`: tách đường đọc kỳ đã khóa khỏi đường tính live; transaction khóa kỳ, adjustment và query theo công ty.
- `src/utils/payrollPeriodLock.js`: snapshot schema v2, trạng thái chuẩn và mapping hàng lịch sử chỉ từ snapshot.
- `src/utils/payrollDebtCarryover.js`: dư nợ đầu kỳ/cuối kỳ, ID carry-forward xác định và journal.
- `src/utils/payrollPolicyHistory.js`: chọn policy theo kỳ có hiệu lực.
- `src/utils/payrollAdjustment.js`: adjustment bất biến, audit và cập nhật carry-forward có liên kết.
- `src/utils/payrollSnapshotIntegrity.js`: phân loại `FULL`, `LEGACY_NEEDS_REVIEW`, `INVALID_NEEDS_REVIEW`.

### Backend và bảo mật

- `functions/index.js`: auto-lock trong transaction; snapshot cũ không đầy đủ chuyển kế hoạch sang `NEEDS_REVIEW`.
- `functions/payrollAutoLock.js`: kiểm tra snapshot hoàn chỉnh và tạo carry/journal xác định.
- `firestore.rules`: bảo vệ period, snapshot, adjustment, carry-forward, auto-lock plan và payroll audit.

### Test và quality tooling

- `tests/payroll-period-lock.test.mjs`
- `tests/payroll-period-freeze.test.mjs`
- `tests/payroll-period-hardening.test.mjs`
- `tests/payroll-auto-lock.test.cjs`
- `tests/firestore-payroll-rules.test.mjs`
- `eslint.config.js`
- `tsconfig.payroll.json`
- `package.json`
- `package-lock.json`
- `docs/PAYROLL_PERIOD_FREEZE_REPORT.md`
- `docs/PAYROLL_PERIOD_VERIFY_HARDEN_REPORT.md`

## B. Database/schema changed

- **Production chưa bị ghi hoặc migration trong lần kiểm tra này.** Audit production chỉ đọc bằng OAuth Firebase CLI.
- Không đổi Firebase Project, database hay cấu trúc đường dẫn collection hiện hữu.
- Source mới yêu cầu snapshot chính thức có `schemaVersion >= 2`, `formulaVersion`, `policyVersion`, `policySnapshot.values`, `calculationSnapshot.inputs/additions/deductions/results`, `salaryDetails.netSalary`, `salaryDetails.endingDebt` và metadata khóa.
- Không backfill snapshot thiếu dữ liệu bằng cấu hình lương hiện tại.
- Không tạo kỳ lương, snapshot, carry-forward hay adjustment trên production trong bước VERIFY.

## C. Firestore Rules result

Rules xác nhận:

- Người dùng thường không thể tạo kỳ `LOCKED`.
- Snapshot và adjustment không thể update/delete sau khi tạo.
- Kỳ đã khóa không thể đổi về `DRAFT` hoặc tính lại trực tiếp.
- Carry-forward đã chốt không thể sửa trực tiếp.
- Adjustment chỉ hợp lệ khi cùng transaction cập nhật period, carry-forward liên quan và audit log.
- Audit payroll không thể update/delete.
- Snapshot/carry phải thuộc đúng `companyId`, period, employee và ID đã liệt kê trong period.
- Query lịch sử dùng đồng thời `companyId` và `periodId`, phù hợp với company isolation của Rules.

Kết quả: **PASS 12/12 integration cases**.

## D. Emulator result

- Java mặc định ban đầu không có trong `PATH`.
- Đã dùng OpenJDK `21.0.10` từ Android Studio tại `C:\Program Files\Android\Android Studio\jbr`.
- Do đường workspace có ký tự tiếng Việt, test chạy qua junction `C:\hd-manager-payroll-test` trỏ tới workspace thật; mã nguồn/dữ liệu không được sao chép.
- Firestore Emulator Standard Edition khởi động thành công và thoát code `0`.
- Các log `PERMISSION_DENIED` là phép thử âm có chủ đích để xác nhận thao tác trái phép bị chặn.
- Hai transaction khóa đồng thời: chính xác 1 thành công, 1 thất bại; chỉ tồn tại 1 period, 1 snapshot và 1 carry-forward.

## E. Unit / integration / regression tests

| Gate | Kết quả |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS |
| `npm run build` | PASS |
| `npm run test:functions` | PASS |
| Firestore Rules Emulator | PASS 12/12 |
| Payroll lock | PASS 11/11 |
| Payroll freeze | PASS 15/15 |
| Payroll hardening | PASS 13/13 |
| Payroll debt rollover | PASS 12/12 |
| Payroll auto-lock | PASS 7/7 |
| Payroll evaluation | PASS 10/10 |
| Full stress suite | PASS 11.309 thao tác |

`typecheck` áp dụng cho nhóm utility Payroll trong dự án JavaScript. ESLint áp dụng cho `App.jsx`, utility Payroll, Functions và test Payroll. Không có bước nào trong bảng trên được đánh PASS nếu chưa chạy thực tế.

Cloud Functions:

- Runtime khai báo: Node 22.
- Syntax đã kiểm tra bằng đúng Node `22.23.2`: PASS.
- Dependency tree đã cài đủ: `@payos/node`, `firebase-admin`, `firebase-functions`.

## F. Legacy data analysis

Audit production read-only lúc `2026-08-08T11:22:09.925Z`:

| Nhóm dữ liệu | Số lượng |
| --- | ---: |
| Tổng `payrollPeriods` | 0 |
| Kỳ lương đã khóa | 0 |
| Tổng `payrollSnapshots` chính thức | 0 |
| Snapshot chính thức đầy đủ | 0 |
| Snapshot chính thức thiếu dữ liệu | 0 |
| Carry-forward chính thức | 0 |
| Adjustment chính thức | 0 |
| Auto-lock plan | 1 |
| Staged snapshot | 13 |
| Staged snapshot đầy đủ | 0 |
| Staged snapshot cần review | 13 |

Phân loại bắt buộc:

- A - lịch sử đầy đủ: `0` snapshot.
- B - lịch sử thiếu snapshot: `0` snapshot chính thức.
- Có thể migrate metadata an toàn: `0`.
- Không thể migrate tự động: `13` staged snapshot của plan tháng `2026-08`.

Plan cần review:

- ID: `payroll_auto_lock_comp_1777895277336_2026-08`.
- Công ty: `comp_1777895277336`.
- Trạng thái production hiện tại: `ready` vì code hardening chưa deploy.
- 13/13 staged snapshot đều thiếu `schemaVersion`, `formulaVersion`, `policyVersion`, `policySnapshot.values` và bốn nhóm `calculationSnapshot`.
- Sau khi backend hardening được triển khai, plan cũ này phải được chuyển `NEEDS_REVIEW`; không được tự động tạo snapshot lịch sử bằng policy hiện tại.

Kết luận legacy: production hiện chưa có bảng lương lịch sử chính thức để migration. Các tháng cũ chỉ còn dữ liệu nguồn live nên không đủ chứng cứ để dựng lại snapshot; hệ thống không tự đoán.

## G. Payroll freeze verification

Dependency graph kỳ đã khóa:

```text
LOCKED period
  -> query payrollSnapshots theo companyId + periodId
  -> kiểm tra integrity
  -> mapPayrollSnapshotsToRows
  -> hiển thị salaryDetails/policySnapshot/calculationSnapshot đã đóng băng
```

Khi `isPayrollLocked`:

- `payrollPolicyEmployees = []`.
- `visibleSalaryEmployees = []`.
- evaluation context không đọc dữ liệu live.
- evaluation result map rỗng.
- opening debt map rỗng.
- `buildPayrollSalaryDetails()` trả `null` ngay.
- `liveSalaryRows = []`.
- `salaryRows = lockedSnapshotRows`.

Các test policy đều PASS:

- T1: tháng 7 chốt lương 12M; đổi hồ sơ thành 14M không đổi tháng 7.
- T2: đổi commission 1% thành 2% không đổi tháng 7.
- T3: đổi formula version không đổi tháng 7.
- T4: đổi allowance không đổi tháng 7.
- T5: tháng 8 chưa khóa dùng đúng policy mới có hiệu lực.

## H. Negative salary carry-forward verification

Các tình huống bắt buộc đã PASS:

1. Tháng 7 `net = -2.000.000` -> snapshot hiển thị thực nhận `0`, ending debt và carry tháng 8 là `2.000.000`.
2. Tháng 8 trước carry `12.000.000` - opening debt `2.000.000` -> thực nhận `10.000.000`, ending debt `0`.
3. Tháng 8 trước carry `1.000.000` - opening debt `2.000.000` -> thực nhận `0`, carry tháng 9 `1.000.000`.
4. Refresh/reopen/recalculate/retry đều sinh cùng ID xác định theo công ty + tháng đích + nhân viên.
5. Lock dùng transaction và kiểm tra trước period/snapshot/carry; hai tab không tạo bản ghi trùng.
6. Adjustment không sửa snapshot gốc; period, adjustment, audit và carry liên quan được commit cùng transaction.

Không có cơ chế unlock trực tiếp. Điều chỉnh sau chốt phải qua adjustment; kỳ kế tiếp đã khóa thì adjustment làm thay đổi chuỗi carry bị từ chối.

## I. Build result

- Vite `7.3.6`.
- 2.363 modules transformed.
- Production build: **PASS**.
- Thời gian build xác nhận cuối: `10,23s`.
- Không có lỗi import, compile hoặc bundle.
- `git diff --check`: PASS; chỉ có cảnh báo chuyển LF/CRLF của Git trên Windows.

## J. Remaining risks

1. **Chưa deploy:** Rules, Functions và app hardening vẫn chỉ nằm trong worktree; production plan cũ vẫn đang `ready`. Phải review/tạo lại 13 staged snapshot đầy đủ trước cuối tháng, sau đó mới cân nhắc deploy theo phê duyệt riêng.
2. **Không có lịch sử chính thức:** production có 0 payroll period/snapshot đã khóa. Không thể khôi phục policy lịch sử chưa từng được lưu; cần chứng từ gốc nếu muốn nhập thủ công.
3. **Scheduled Function chưa chạy end-to-end trên production:** logic helper, transaction source, Node 22 syntax và Rules integration đã PASS; trigger thời gian thật chưa được phép deploy/test production trong yêu cầu này.
4. **Dependency hiện hữu:** app có 1 cảnh báo moderate ở `dompurify@3.4.12` qua `jspdf@4.2.1`; phiên bản này giống hệt `HEAD`, không do Payroll. Functions có 1 low (`body-parser`) và 1 critical (`websocket-driver`) transitive hiện hữu. Không chạy `audit fix --force`; cần một sprint dependency riêng kèm regression Firebase/PayOS.
5. **Concurrency production:** đã PASS trên Firestore Emulator, chưa tạo dữ liệu thử trên production vì yêu cầu tuyệt đối không ghi dữ liệu.

## Trạng thái cuối

VERIFY + HARDEN cục bộ: **PASS với các rủi ro còn lại đã nêu**.
Production data changed: **NO**.
Commit: **NO**.
Push: **NO**.
Deploy: **NO**.
