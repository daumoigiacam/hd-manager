# FINAL PAYROLL PRODUCTION STATUS

Ngày xác minh: 08/08/2026
Firebase project: `hd-manager-c5839`
Firestore database: `(default)`
App data scope: `hd-manager-production`
Git HEAD: `09d1b490d6a0db80ecf05d6befeb6b6892033765`

## Kết luận

**PRODUCTION: NO-GO**

Rules mới đã compile, deploy và khớp byte-for-byte với local, nhưng positive access review phát hiện Production vẫn có các phiên Firebase Anonymous hoạt động. Những phiên này không có `companyId`, `role` hoặc `appUserId` claim để vượt qua lớp bảo vệ payroll mới. Giữ ruleset mới sẽ có nguy cơ chặn người dùng hiện hành khỏi bảng lương.

Không nới lỏng Rules bằng fallback toàn quyền. Release Firestore đã được hoàn nguyên ngay về ruleset trước đó để tránh gián đoạn Production. Không có application, Functions, hosting hoặc dữ liệu payroll nào được deploy/ghi sửa.

## 1. Production Rules: FAIL / đã rollback an toàn

### Lần deploy kiểm chứng

| Thuộc tính | Kết quả |
| --- | --- |
| Ruleset mới đã kiểm chứng | `projects/hd-manager-c5839/rulesets/9051e7da-1c31-45a4-a7ff-6744fea8cc66` |
| Active lúc | `2026-08-08T13:57:18.753217Z` |
| SHA-256 Production lúc kiểm chứng | `91929499625248012cfe5f7fa838472f3ad9239c17a204d2200b4bb627bbd0d0` |
| SHA-256 local | `91929499625248012cfe5f7fa838472f3ad9239c17a204d2200b4bb627bbd0d0` |
| So sánh byte-for-byte | PASS |
| Marker `PAYROLL_FREEZE_RULES_V2` | Có |
| Đọc/ghi không xác thực | Bị chặn `403` |
| Emulator theo vai trò | `17/17 PASS` |

### Blocker tương thích Identity

Audit Firebase Auth Production chỉ đọc:

| Nhóm | Tổng | Đăng nhập 24 giờ gần nhất | Đăng nhập 7 ngày gần nhất |
| --- | ---: | ---: | ---: |
| UID `identity_*` dùng custom-token | 6 | 3 | 6 |
| UID legacy/anonymous | 471 | 19 | 60 |

Firebase Auth có tổng cộng 477 user record; không user record nào có custom claims lưu cố định. Identity Center có truyền claim khi tạo custom token, nhưng các phiên legacy Anonymous đang hoạt động không nhận các claim này.

Rules mới yêu cầu company/role claim cho protected payroll collections. Vì vậy positive read/write bằng toàn bộ loại phiên Production hiện hành chưa đạt. Đây là blocker thật, không được che bằng một fallback cho phép mọi user đã xác thực đọc/ghi chéo công ty.

### Trạng thái sau rollback

| Thuộc tính | Giá trị hiện tại |
| --- | --- |
| Release | `projects/hd-manager-c5839/releases/cloud.firestore` |
| Ruleset active | `projects/hd-manager-c5839/rulesets/8a2bd623-4797-4af9-849a-71f5bab3e62d` |
| Rollback lúc | `2026-08-08T14:05:10.299641Z` |
| SHA-256 active | `4e78d86fd9e266e0f9d97a529e3bf27de654c04314e2254ae61ae7d7100b62d7` |
| Marker `PAYROLL_FREEZE_RULES_V2` | Không |

Rules cũ không đạt yêu cầu bất biến payroll, nên blocker Production vẫn tồn tại. Rollback chỉ nhằm giữ tính liên tục của ứng dụng trong khi chờ triển khai Identity claims đồng bộ.

## 2. Trạng thái kỳ 2026-08: OPEN / STAGED

Đối chiếu Production chỉ đọc sau toàn bộ thao tác Rules:

| Collection | Số record |
| --- | ---: |
| `payrollAutoLockPlans` | 1 |
| `payrollAutoLockPlanSnapshots` | 13 |
| `payrollPeriods` chính thức | 0 |
| `payrollSnapshots` chính thức | 0 |
| `payrollAdjustments` | 0 |
| `payrollDebtCarryovers` | 0 |

Plan `payroll_auto_lock_comp_1777895277336_2026-08` có trạng thái raw `ready` theo schema cũ. Backend mới chuẩn hóa legacy `ready` thành `OPEN`, không phải `READY_FOR_LOCK`. Thời điểm dự kiến chốt là `2026-08-31T23:59:59+07:00`; ngày kiểm tra 08/08/2026 chưa được phép khóa.

Không có kỳ hoặc snapshot chính thức nào tồn tại. Object `period` lồng trong plan cũ không được coi là kỳ đã khóa.

## 3. 13 staging snapshot

13 record hiện tại là preview/staging của kỳ đang mở, không phải lịch sử đã chốt:

`1777897454286`, `1777901722520`, `1777902561432`, `1777902673190`, `1777977756008`, `1779938115247`, `1783407274204`, `1783407397230`, `1783407562782`, `1783593270854`, `1783667162443`, `1783667210338`, `1783667568708`.

Tất cả thiếu một hoặc nhiều bằng chứng bắt buộc để trở thành official snapshot: `schemaVersion`, `formulaVersion`, `policyVersion`, `policySnapshot.values`, cùng `calculationSnapshot.inputs/additions/deductions/results`.

Xử lý đúng nghiệp vụ:

- Giữ nguyên staging, không backfill bằng policy hiện tại.
- Staging được thay đổi trong kỳ OPEN và không được coi là lịch sử.
- Không tự tạo dữ liệu còn thiếu, không auto-lock.
- Khi closing, phải tạo/đối chiếu đủ dữ liệu đúng kỳ.
- Chỉ một nhân viên thiếu dữ liệu cũng khiến cả kỳ vào `NEEDS_REVIEW` và không khóa.

Production có `0` official payroll period/snapshot, nên không có lịch sử đã khóa chưa xác định. Tuy nhiên 13 staging chưa sẵn sàng để chốt.

## 4. Auto-lock gate: PASS local / chưa active Production

State machine local:

```text
OPEN
  -> CLOSING
  -> SNAPSHOT_VALIDATED
  -> READY_FOR_LOCK
  -> LOCKED
```

- Chỉ `READY_FOR_LOCK` mới được finalize.
- Finalize yêu cầu đủ employee, policy/calculation/schema/formula, không `NEEDS_REVIEW`, không adjustment pending, digest không đổi và transaction thành công.
- Chưa đến hạn giữ `OPEN`; thiếu dữ liệu lúc closing chuyển `NEEDS_REVIEW`.
- Retry và scheduler đồng thời không tạo duplicate.
- Production không có function `autoLockPayrollPeriods`; scheduler mới chưa được deploy.

## 5. Payroll freeze: PASS local

- Official snapshot bất biến sau LOCK.
- Render kỳ LOCKED chỉ đọc snapshot, không dùng lại employee configuration hiện tại.
- Đổi salary, commission, allowance, deduction hoặc formula sau chốt không làm đổi kỳ đã khóa.
- Kỳ OPEN dùng policy có hiệu lực và có thể tính lại.

## 6. Negative salary carry: PASS local

- Net âm `-2.000.000` tạo carry `2.000.000`.
- Kỳ sau có `12.000.000` trước carry còn `10.000.000`.
- Kỳ sau chỉ có `1.000.000` thì còn carry tiếp `1.000.000`.
- ID deterministic và transaction ngăn duplicate khi refresh/retry/multiple tabs.

## 7. Adjustment: PASS local

- Không sửa official snapshot gốc.
- Adjustment là document riêng và cập nhật period/carry/audit trong transaction.
- Có sequence, previous adjustment và audit log.
- Rules mới chặn client không đủ quyền tạo adjustment hoặc xóa audit.

## 8. Concurrency: PASS local

- Auto-lock và carry-forward dùng ID xác định cùng Firestore transaction.
- Retry không tạo duplicate snapshot, carry hoặc audit.
- Emulator xác nhận hai yêu cầu lock đồng thời chỉ có một finalize thành công.

## 9. Tests

| Gate | Kết quả |
| --- | --- |
| Payroll unit/regression | `82/82 PASS` |
| Firestore Rules Emulator | `17/17 PASS` |
| Tổng Payroll + Rules | `99/99 PASS` |
| Stress | `11.309` thao tác PASS |
| `npm test` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| Cloud Functions syntax | PASS |

## 10. Build

- `npm run build`: PASS.
- Vite xử lý `2.363` module trong khoảng `10,05s` ở lần xác minh cuối.
- Không có lỗi compile, import hoặc bundle.

## 11. Security

- Root runtime `npm audit --omit=dev`: `0` vulnerability.
- Functions runtime `npm audit`: `0` vulnerability.
- Rules mới đạt static/emulator gate nhưng chưa thể active an toàn với các phiên legacy Anonymous.
- Rules cũ đang active để tránh outage nhưng chưa bảo vệ bất biến payroll; đây là release blocker.
- Không có payroll data write, migration, backfill hoặc auto-lock trong lần kiểm tra.

## 12. Hướng xử lý bắt buộc trước GO

1. Triển khai Identity Center/session flow để mọi phiên payroll hợp lệ nhận `companyId`, `role` và `appUserId` claim.
2. Chặn anonymous bootstrap ghi đè user identity thật và buộc refresh ID token sau khi nhận custom token.
3. Xác minh positive read/write Production bằng ít nhất owner/accountant và negative access bằng employee/customer khác công ty.
4. Sau khi compatibility PASS, deploy lại đúng ruleset `9051e7da-1c31-45a4-a7ff-6744fea8cc66` hoặc ruleset mới tương đương đã test.
5. Chỉ sau đó mới xem xét deploy application/Functions; vẫn không được khóa kỳ 2026-08 trước hạn hoặc khi staging chưa đủ.

## 13. Production: NO-GO

Payroll source, state machine, tests và build đều PASS local. Production vẫn `NO-GO` vì Rules bảo vệ payroll chưa thể active đồng thời với toàn bộ session model hiện hành. Workspace giữ nguyên chưa commit/push; app, hosting và Functions chưa deploy.
