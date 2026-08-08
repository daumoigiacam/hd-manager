# FINAL PRODUCTION READINESS REPORT - PAYROLL PERIOD FREEZE

Ngày kiểm tra: 08/08/2026
Firebase project: `hd-manager-c5839`
App data scope: `hd-manager-production`
Git HEAD khi kiểm tra: `09d1b490d6a0db80ecf05d6befeb6b6892033765`
Phạm vi: VERIFY + HARDEN, audit Production chỉ đọc
Cam kết: **không commit, không push, không deploy, không migrate, không auto-lock dữ liệu thật**

## Kết luận điều hành

**PRODUCTION: NO-GO**

Mã nguồn local đã đạt toàn bộ quality gate, bao gồm 90/90 ca Payroll/Rules, lint, typecheck, test tổng, Cloud Functions syntax và production build. Tuy nhiên Production chưa thể phát hành vì còn hai blocker độc lập:

1. Cả 13/13 staged payroll snapshot tháng `2026-08` đều thiếu bằng chứng chính sách/công thức lịch sử và phải giữ `NEEDS_REVIEW`.
2. Firestore Rules đang active trên Production là bộ rules cũ, cho phép mọi tài khoản đã xác thực đọc/ghi toàn bộ `public/data`; chưa có bảo vệ bất biến cho Payroll.

Không có cách hợp lệ để biến 13 record thành snapshot lịch sử đầy đủ chỉ từ policy hiện tại. Vì vậy không migration, không backfill và không khóa kỳ trước khi người có thẩm quyền đối chiếu chứng từ gốc.

## Bằng chứng audit Production chỉ đọc

Audit được thực hiện qua Google/Firebase REST API bằng các lệnh `GET`; không có request ghi dữ liệu.

| Collection | Số record |
| --- | ---: |
| `payrollAutoLockPlans` | 1 |
| `payrollAutoLockPlanSnapshots` | 13 |
| `payrollPeriods` chính thức | 0 |
| `payrollSnapshots` chính thức | 0 |
| `payrollAdjustments` | 0 |
| `payrollDebtCarryovers` | 0 |
| `employees` | 27 |

Rules release đang active:

- Release: `projects/hd-manager-c5839/releases/cloud.firestore`
- Ruleset: `projects/hd-manager-c5839/rulesets/8a2bd623-4797-4af9-849a-71f5bab3e62d`
- Cập nhật lần cuối: `2026-05-04T11:40:43.129104Z`
- Có marker `PAYROLL_FREEZE_RULES_V2`: **không**
- Có rule chung `allow read, write: if request.auth != null`: **có**

## A. 13 snapshot - NEEDS_REVIEW

### Plan hiện tại

| Thuộc tính | Giá trị |
| --- | --- |
| Plan ID | `payroll_auto_lock_comp_1777895277336_2026-08` |
| Company | `comp_1777895277336` |
| Kỳ | `2026-08` |
| Trạng thái hiện tại | `ready` (schema cũ) |
| Thời điểm chuẩn bị | `2026-08-08T09:25:03.064Z` |
| Thời điểm dự kiến khóa | `2026-08-31T23:59:59+07:00` |
| Staged snapshot | 13 |
| `rulesVersion` | thiếu |
| `closingSchedule` | thiếu |
| `expectedEmployeeIds` | thiếu |
| Official `payrollPeriods` | 0 |

Plan cũ có một object `period` lồng bên trong mang `status: locked` và `lockedAt: 2026-08-08T09:25:03.062Z`. Đây chỉ là payload dự kiến trong plan, **không phải kỳ lương chính thức**: collection `payrollPeriods` hiện có 0 record. Backend mới không được coi object lồng này là bằng chứng kỳ đã khóa.

### Mã các trường thiếu

- `F1`: `schemaVersion`/`snapshotSchemaVersion >= 2`
- `F2`: `formulaVersion`
- `F3`: `policyVersion`
- `F4`: `policySnapshot.values`
- `F5`: `calculationSnapshot.inputs`
- `F6`: `calculationSnapshot.additions`
- `F7`: `calculationSnapshot.deductions`
- `F8`: `calculationSnapshot.results`

### Chi tiết từng record

Tất cả 13 employee profile đều có `0` policy history, không có `salaryPolicyVersion` và không có `formulaVersion`. Dữ liệu staged có danh tính và kết quả `salaryDetails`, nhưng kết quả cuối không chứng minh được chính sách/công thức nào đã tạo ra nó.

| # | Employee | employeeId | Trạng thái | Dữ liệu gốc đang có | Trường thiếu | Có thể hoàn thiện tự động an toàn? | Cần review? |
| ---: | --- | --- | --- | --- | --- | --- | --- |
| 1 | Lê Thị Hồng | `1777897454286` | `STAGED / NEEDS_REVIEW` | Net `0 đ`; ending debt `119.078.669 đ`; sales `220.358.100 đ` | F1-F8 | Không | Có |
| 2 | Đặng Thị Khánh Linh | `1777901722520` | `STAGED / NEEDS_REVIEW` | Net `4.810.307 đ`; ending debt `0 đ` | F1-F8 | Không | Có |
| 3 | Hoàng Văn Cương | `1777902561432` | `STAGED / NEEDS_REVIEW` | Net `0 đ`; ending debt `84.206.109 đ`; sales `110.192.700 đ` | F1-F8 | Không | Có |
| 4 | Phan Lê Thành Nam | `1777902673190` | `STAGED / NEEDS_REVIEW` | Net `0 đ`; ending debt `10.115.194 đ`; sales `64.893.700 đ` | F1-F8 | Không | Có |
| 5 | Hoàng Văn Đức | `1777977756008` | `STAGED / NEEDS_REVIEW` | Net `0 đ`; ending debt `1.089.367.776 đ`; sales `512.713.500 đ` | F1-F8 | Không | Có |
| 6 | Lê Bảo Thoa | `1779938115247` | `STAGED / NEEDS_REVIEW` | Net `2.250.000 đ`; ending debt `0 đ` | F1-F8 | Không | Có |
| 7 | Nguyễn Văn Út | `1783407274204` | `STAGED / NEEDS_REVIEW` | Net `3.568.667 đ`; ending debt `0 đ`; 2 bonus records | F1-F8 | Không | Có |
| 8 | Lưu Văn Thọ | `1783407397230` | `STAGED / NEEDS_REVIEW` | Net `5.383.333 đ`; ending debt `0 đ` | F1-F8 | Không | Có |
| 9 | Trần Tấn Cường | `1783407562782` | `STAGED / NEEDS_REVIEW` | Net `2.116.666 đ`; ending debt `0 đ` | F1-F8 | Không | Có |
| 10 | Trần Quang Huy | `1783593270854` | `STAGED / NEEDS_REVIEW` | Net `3.333.333 đ`; ending debt `0 đ` | F1-F8 | Không | Có |
| 11 | Hoàng Văn Lương | `1783667162443` | `STAGED / NEEDS_REVIEW` | Net `4.716.667 đ`; ending debt `0 đ` | F1-F8 | Không | Có |
| 12 | Trịnh Văn Vũ | `1783667210338` | `STAGED / NEEDS_REVIEW` | Net `4.716.667 đ`; ending debt `0 đ` | F1-F8 | Không | Có |
| 13 | Lê Văn Phương (Nuôi) | `1783667568708` | `STAGED / NEEDS_REVIEW` | Net `3.700.000 đ`; ending debt `0 đ` | F1-F8 | Không | Có |

### Xử lý đề xuất

1. Giữ nguyên 13 staged record; không ghi đè và không tự động LOCK.
2. Người có thẩm quyền đối chiếu từng nhân viên với hồ sơ lương, chấm công, ứng, thưởng, phạt, hoa hồng, phụ cấp và chứng từ gốc của đúng kỳ `2026-08`.
3. Chỉ tạo snapshot schema v2 khi có đủ căn cứ để lưu đồng thời policy, formula, inputs, additions, deductions và results.
4. Record không đủ căn cứ tiếp tục ở `NEEDS_REVIEW`; không dùng policy hiện tại để tái dựng lịch sử.
5. Vì ngày audit mới là 08/08/2026, tuyệt đối không khóa kỳ `2026-08` trước `23:59:59` ngày 31/08/2026.

Kết quả A: **NEEDS_REVIEW / FAIL production gate**.

## B. Auto-lock - PASS local, BLOCKED Production

Backend đã được gia cố theo hai bước bắt buộc:

```text
READY -> ELIGIBLE -> LOCKED
```

Một plan chỉ trở thành `ELIGIBLE` khi đồng thời:

- Đã đến đúng thời điểm cuối tháng theo `Asia/Ho_Chi_Minh`.
- Có `rulesVersion = PAYROLL_FREEZE_RULES_V2` và runtime xác nhận cùng version.
- Có `closingSchedule` hợp lệ.
- `snapshotCount`, staged IDs và employee IDs khớp hoàn toàn.
- Tập nhân viên hiện tại không thay đổi.
- Mọi snapshot đạt schema v2 và đủ policy/calculation snapshot.
- Không có adjustment `PENDING`, `DRAFT`, `REVIEW` hoặc `PROCESSING`.
- Eligibility digest không thay đổi giữa bước kiểm tra và finalize.

Finalize chạy trong Firestore transaction, dùng ID xác định cho period, snapshot, carry-forward và audit log. Chạy lại/retry không tạo bản thứ hai. Hai request lock đồng thời đã được Emulator xác nhận chỉ có một transaction thành công.

Trạng thái plan Production hiện tại:

- Ngày kiểm tra chưa đến 31/08/2026: `NOT_DUE`.
- Thiếu production Rules marker: khi đến hạn sẽ là `RULES_PENDING` nếu Rules chưa active.
- Dù Rules được active, plan vẫn thiếu schedule/expected employees và 13 snapshot vẫn thiếu F1-F8: phải chuyển `NEEDS_REVIEW`, không LOCK.

Kết quả B: **PASS logic local / NEEDS_REVIEW Production**.

## C. UI runtime - PASS

- Callback render payroll đã destructure đầy đủ `emp`, `details`, `snapshotId`, `policySnapshot`, `latestAdjustment` và metadata review; không còn biến ngoài scope.
- Kỳ đã khóa thoát khỏi đường tính live và chỉ đọc `payrollSnapshots`.
- UI hiển thị rõ kỳ đã khóa/chỉ đọc, người khóa, thời điểm chốt, policy version, cảnh báo snapshot thiếu dữ liệu, điều chỉnh mới nhất, lương cơ bản, hoa hồng, phụ cấp, ứng, khấu trừ, nợ đầu kỳ, net salary và ending debt.
- UI không dùng employee profile hiện tại để thay giá trị snapshot đã khóa.

Kết quả C: **PASS**.

## D. Legacy policy fallback - PASS

- Không còn fallback tự gán `legacy-v1` cho lịch sử không có bằng chứng.
- Kỳ chưa khóa có thể dùng `UNVERSIONED_LIVE_PREVIEW` để hiển thị/tính live, nhưng giá trị này không hợp lệ để khóa.
- Snapshot thiếu policy/calculation metadata được phân loại `LEGACY_NEEDS_REVIEW` hoặc `INVALID_NEEDS_REVIEW`.
- Auto-lock từ chối record thiếu bằng chứng lịch sử.

Kết quả D: **PASS**.

## E. Firestore Rules Production - FAIL

Local Rules đã bảo vệ:

- Client không thể tạo kỳ LOCKED trái quyền.
- Snapshot/period/carry-forward/audit không thể sửa hoặc xóa sau khi chốt.
- Adjustment phải đi cùng transaction cập nhật period/carry/audit hợp lệ.
- Client không thể promote/delete auto-lock plan.
- Hai lock đồng thời chỉ tạo một bộ lịch sử bất biến.

Firestore Emulator: **14/14 PASS**.

Tuy nhiên Rules Production đang active là ruleset cũ, không chứa `PAYROLL_FREEZE_RULES_V2` và cho phép user đã xác thực ghi toàn bộ `public/data`. Vì yêu cầu cấm deploy trong vòng review này, Rules mới chưa được đưa lên Production.

Kết quả E: **FAIL - release blocker**.

## F. Dependency security - PASS runtime, NEEDS_REVIEW toolchain

### Các blocker runtime đã xử lý

| Package | Trước | Sau | Phạm vi | Kết quả |
| --- | --- | --- | --- | --- |
| `websocket-driver` | `0.7.4` | `0.7.5` | Cloud Functions/Firebase Admin transitive runtime | Đã vá |
| `body-parser` | phiên bản transitive cảnh báo | `1.20.6` | Cloud Functions runtime | Đã vá |
| `dompurify` | `3.4.12` | `3.4.13` | Web runtime qua `jspdf` | Đã vá |
| `tar` | bản transitive cũ | `7.5.22` | Build/dev toolchain | Đã vá |
| `electron` | `38.7.x` | `39.8.10` | Desktop runtime/build | Đã cập nhật cùng major target |
| `postcss` | `8.4.x` | `8.5.26` | Build CSS | Đã cập nhật |

Audit sau cùng:

- `npm audit --omit=dev`: **0 vulnerability**.
- `npm --prefix functions audit`: **0 vulnerability**.
- Toàn bộ root tree gồm dev/build tools: 29 cảnh báo = 9 High, 19 Moderate, 1 Low, 0 Critical.

### High còn lại - chỉ toolchain, không đóng gói vào runtime

| Package | Version hiện tại | Nguồn/phạm vi | Cách xử lý đề xuất | Breaking risk | Chặn runtime Production? |
| --- | --- | --- | --- | --- | --- |
| `@expo/plist` | `0.2.0`, `0.2.2` | `eas-cli` | Chờ cây Expo/EAS phát hành bản vá tương thích | Cao nếu ép downgrade | Không |
| `@xmldom/xmldom` | `0.7.13` | `@expo/plist` | Cập nhật qua Expo/EAS, không override mù | Cao | Không |
| `brace-expansion` | `1.1.16`, `2.1.2`, `5.0.7` | CLI/build tools | Nâng từng package cha trong sprint toolchain | Trung bình | Không |
| `eas-cli` | `19.1.0` | Direct dev dependency | Audit đề xuất `0.52.0` là downgrade major không an toàn; không áp dụng | Rất cao | Không |
| `fast-uri` | `3.1.3` | Validation/build tree | Nâng qua package cha | Trung bình | Không |
| `js-yaml` | `3.15.0`, `4.3.0` | Expo/CLI tools | Nâng qua package cha | Trung bình | Không |
| `minimatch` | `5.1.2` | `eas-cli` | Chờ/nâng EAS tương thích | Cao | Không |
| `nanoid` | `3.3.8` | `eas-cli` | Chờ/nâng EAS tương thích | Cao | Không |
| `node-forge` | `1.3.1` | `eas-cli` | Chờ/nâng EAS tương thích | Cao | Không |

### Moderate/Low còn lại

- Moderate (19): `@expo/bunyan`, `@expo/config`, `@expo/config-plugins`, `@expo/eas-json`, `@expo/prebuild-config`, `@expo/rudder-sdk-node`, `@expo/steps`, `@google-cloud/pubsub`, `@opentelemetry/core`, `ajv`, `firebase-tools`, `gaxios`, `joi`, `re2`, `ts-deepmerge`, `undici`, `uuid`, `xcode`, `yaml`.
- Low (1): `diff`.
- Tất cả thuộc dev/build/deploy tree. Không package nào trong số này xuất hiện trong `npm audit --omit=dev` hoặc Functions audit.
- Không chạy `npm audit fix --force`; cần sprint toolchain riêng và regression EAS/Firebase CLI trước khi nâng.

Kết quả F: **PASS cho runtime Production / NEEDS_REVIEW cho toolchain debt**.

## G. Payroll freeze - PASS

Các test xác nhận:

- Tháng 7 khóa salary 12M; đổi live salary 14M không đổi lịch sử.
- Commission 1% đã khóa không đổi khi profile thành 2%.
- Formula version và allowance đã khóa không đổi khi policy mới xuất hiện.
- Tháng 8 chưa khóa dùng policy mới đúng hiệu lực.
- Tháng 7/8 đã khóa tiếp tục giữ policy version tương ứng khi có policy v3.
- Dependency graph kỳ LOCKED dừng trước mọi tính toán từ profile/policy live.

Kết quả G: **PASS 15/15 freeze + 13/13 hardening**.

## H. Salary carry-forward - PASS

Các chuỗi bắt buộc đã PASS:

1. Tháng 7 net `-2.000.000` -> carry tháng 8 `2.000.000`.
2. Tháng 8 gross/net trước carry `12.000.000` -> trừ `2.000.000` -> thực nhận `10.000.000`, carry còn `0`.
3. Nếu tháng 8 chỉ có `1.000.000` -> carry tháng 9 còn `1.000.000`.
4. Tháng 9 có `3.000.000` -> trừ `1.000.000` -> carry còn `0`.
5. Refresh, reopen, recalculate và retry dùng cùng deterministic ID, không cộng hai lần.

Kết quả H: **PASS 12/12**.

## I. Adjustment - PASS

- Không sửa snapshot gốc.
- Adjustment tạo document riêng, difference, sequence và audit log.
- Snapshot gốc giữ byte-for-byte bất biến trong test.
- Period/carry/audit liên quan được cập nhật cùng transaction.
- Adjustment bị chặn nếu kỳ kế tiếp đã khóa hoặc người dùng không đủ quyền.

Kết quả I: **PASS**.

## J. Concurrency - PASS local

- Lock dùng Firestore transaction.
- IDs của period/snapshot/carry/audit là deterministic.
- Eligibility digest được kiểm tra lại trước finalize.
- Hai request lock đồng thời trong Emulator: đúng 1 thành công, không duplicate period/snapshot/carry.
- Retry, refresh và nhiều tab không tạo duplicate deduction/carry/adjustment trong test.

Chưa chạy concurrency write trên Production vì yêu cầu tuyệt đối không ghi dữ liệu thật.

Kết quả J: **PASS Emulator / NOT TESTED Production writes**.

## K. Tests - PASS

| Gate | Kết quả |
| --- | --- |
| Payroll evaluation | 10/10 PASS |
| Payroll period lock | 11/11 PASS |
| Payroll freeze | 15/15 PASS |
| Payroll hardening | 13/13 PASS |
| Payroll debt rollover | 12/12 PASS |
| Payroll auto-lock | 15/15 PASS |
| Firestore Rules integration | 14/14 PASS |
| Tổng Payroll + Rules | **90/90 PASS, 0 FAIL** |
| Full `npm test` | PASS |
| Stress suite | PASS, 11.309 operations |
| Cloud Functions syntax | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |

Các log `PERMISSION_DENIED` của Emulator là negative tests có chủ đích và tương ứng với thao tác trái phép bị chặn.

Kết quả K: **PASS**.

## L. Build - PASS

- `npm run build`: PASS.
- Vite: `7.3.6`.
- Modules transformed: 2.363.
- Thời gian build cuối: khoảng `10,52s`.
- Không có lỗi import, compile hoặc bundle.
- `git diff --check`: PASS; chỉ có cảnh báo LF/CRLF của Git trên Windows.

Kết quả L: **PASS**.

## M. Migration - NEEDS_REVIEW

- Không có official historical payroll period/snapshot để migrate.
- 13 staged snapshot không đủ căn cứ để backfill policy/calculation history.
- Số record có thể migrate tự động an toàn: **0**.
- Số record phải review thủ công: **13**.
- Không có migration hay ghi Production nào được thực hiện trong đợt kiểm tra.

Kết quả M: **NEEDS_REVIEW / release blocker**.

## N. Remaining risks

1. **13 snapshot chưa đủ bằng chứng:** không thể auto-lock hợp lệ cho tới khi từng record được review và tái chuẩn bị từ chứng từ đúng kỳ.
2. **Rules Production chưa active:** client đã xác thực hiện vẫn có quyền ghi rộng; phải triển khai Rules đã kiểm thử theo một release được phê duyệt trước khi bật auto-lock.
3. **Functions/app hardening chưa deploy:** Production vẫn chạy code cũ; tuyệt đối không bật scheduler/Rules version env riêng lẻ hoặc deploy từng phần lệch phiên bản.
4. **Plan schema cũ:** plan thiếu `rulesVersion`, `closingSchedule`, `expectedEmployeeIds` và chứa object `period.status=locked` dự kiến. Không được dùng plan này để lock trực tiếp.
5. **Toolchain audit debt:** 29 cảnh báo dev/build cần sprint nâng dependency riêng; runtime web và Functions hiện đạt 0 vulnerability.
6. **Không có Production write test:** concurrency và immutability đã PASS Emulator nhưng chưa được kiểm thử ghi trên Production, đúng theo giới hạn an toàn của yêu cầu.

## Bảng GO/NO-GO cuối

| Mục | Trạng thái |
| --- | --- |
| A. 13 snapshot | **NEEDS_REVIEW / FAIL** |
| B. Auto-lock | **PASS local / NEEDS_REVIEW Production** |
| C. UI runtime | **PASS** |
| D. Legacy fallback | **PASS** |
| E. Firestore Rules Production | **FAIL** |
| F. Dependency security | **PASS runtime / NEEDS_REVIEW toolchain** |
| G. Payroll freeze | **PASS** |
| H. Salary carry-forward | **PASS** |
| I. Adjustment | **PASS** |
| J. Concurrency | **PASS Emulator / NOT TESTED Production writes** |
| K. Tests | **PASS, 90/90 Payroll + Rules** |
| L. Build | **PASS** |
| M. Migration | **NEEDS_REVIEW** |
| N. Remaining risks | **OPEN** |

## Quyết định

**PRODUCTION: NO-GO**

Điều kiện tối thiểu để đánh giá lại GO:

1. Review có chứng từ cho 13 nhân viên và tạo lại snapshot schema v2 đầy đủ, hoặc loại từng record khỏi kỳ theo quyết định nghiệp vụ có audit; không backfill bằng policy hiện tại.
2. Plan mới phải có `rulesVersion`, `closingSchedule`, `expectedEmployeeIds`, đủ snapshot và không còn `NEEDS_REVIEW`.
3. Deploy đồng bộ Rules + Functions + App theo release được phê duyệt; xác nhận Rules active đúng marker trước khi scheduler được phép finalize.
4. Chạy smoke test trên staging hoặc môi trường Production được cô lập, sau đó audit lại bằng read-only API.

Cho tới khi đủ các điều kiện trên: không commit/push/deploy theo yêu cầu hiện tại, không migrate và không auto-lock dữ liệu thật.
