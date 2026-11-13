# HD Manager — Release blocker closure

Trạng thái: **RELEASE BLOCKED**, cập nhật ngày 13/11/2026.

Nguồn ứng dụng chuẩn: `development/hd-manager/application`. Kế thừa dev.83 và ngoại lệ hiệu suất dev.42; không chạy lại benchmark hoặc thay giao diện/công thức nghiệp vụ.

## GitHub Actions

- Commit `142ab48d2464ed9bd3a1b94d2927f724c97be479` đã push thành công; validation/build run `43447909454` PASS.
- Job riêng `Verify official Android signing only`, run `43448514174`, FAIL với `OFFICIAL_SIGNING_SECRETS_MISSING`.
- Đây là lỗi thiếu thông tin ký, không phải push source thất bại. Hai secret thiếu được xác minh lại qua GitHub API ngày 13/11; không đọc giá trị secret.

## Các sửa đổi tiếp theo

- `offlineCommandAuthority.cjs`: một ranh giới cấp quyền cho transaction hiện có. Local vẫn đọc binding/access bền vững; trusted host phải đọc lại Identity Center, membership, quyền và revision trong chính transaction, kể cả khi trả lại receipt cũ.
- `offlineTrustedCommands.mjs`: dispatcher dùng lại các handler và protocol hiện hữu, không tạo ledger/database mới. Giữ CAS, receipt bất biến, idempotency, source fingerprint, stock fence, payroll fence và transaction nguyên tử.
- `offlineBusinessPolicy.mjs` được sinh từ đúng các khai báo capability đang sử dụng trong Local. CI kiểm tra không lệch policy; không suy quyền từ tên chức danh.
- Chấm công dùng bộ xác minh thiết bị gốc của Identity Center. Bằng chứng thiết bị chỉ tồn tại trong request; không ghi secret vào receipt.
- Feed payroll dùng quyền hiện thời của Identity Center khi chạy trusted, không đọc grant Local giả. Cơ chế checkpoint và mở rộng nguồn giữ nguyên, không reset journal.
- Gate phát hành yêu cầu bằng chứng riêng cho mọi miền ghi và hash của các handler; một kết quả `offlineWrite: PASS` tổng quát không đủ để phát hành.

## Sáu route đọc

| Action | Handler thực tế | Trạng thái |
|---|---|---|
| `business-source` | `offlineScopedBusinessSource.mjs` | PASS contract; kế thừa kiểm thử truy vấn Local |
| `attendance-period` | `attendancePeriodConfirmations.cjs` | PASS contract; route đọc không nhận lệnh ghi |
| `payroll-settlement` | `payrollSettlements.cjs`, read-only | PASS contract đọc; không cho thanh toán qua route đọc |
| `attendance-adjustment` | `attendanceAdjustmentRequests.cjs` | PASS contract; danh sách theo quyền và tenant |
| `warehouse-import-head` | `offlineWarehouseImportSource.cjs` | PASS contract revision/count/generation |
| `warehouse-import-page` | Cùng source | PASS contract phân trang, cursor và tenant |

Các action này đã có code xử lý; **chưa có nghĩa URL Production đã được triển khai**.

## Miền ghi và bằng chứng mới

| Miền | Trusted dispatcher | Bằng chứng trong đợt này |
|---|---|---|
| Khách hàng | Giữ handler đã có | Contract hiện hữu PASS |
| Đơn hàng | Đã nối | Unit: hai dòng khác ĐVT, tiền giữ nguyên, retry, CAS, từ chối chéo tenant |
| Thu chi | Đã nối | Unit + Firebase Auth/Firestore Emulator thật: 12.345đ, một receipt sau retry, từ chối chéo tenant |
| Kiểm kê | Đã nối | Unit + Emulator thật: 2 đơn vị, retry không trùng, từ chối chéo tenant |
| Nhập kho | Đã nối | Unit + Emulator thật: chứng từ và chi phí cùng 49.380đ, retry và tenant guard |
| Xuất kho | Đã nối | Unit: planner gốc, CAS, stock fence và receipt |
| Giao hàng | Đã nối | Unit: transaction compound và receipt bất biến |
| Hồ sơ nhân viên | Đã nối | Unit + Emulator thật: whitelist trường, CAS, retry, tenant guard |
| Tạm ứng | Đã nối | Unit: duyệt ghi advance/financial/fence/receipt nguyên tử, rollback khi lỗi |
| Chốt lương | Đã nối | Unit: từ chối công chưa xác nhận, liên kết bảng công xác nhận hai bên, không tạo chi phí lương lần hai |
| Vào/ra ca | Đã nối | Unit: Identity Center/device verifier gốc, audit, retry; từ chối sai hoặc thu hồi thiết bị |
| Điều chỉnh công | Đã nối | Unit: yêu cầu, từ chối có lý do, lịch sử, receipt và kiểm tra quyền hiện thời |
| Xác nhận bảng công | Đã nối | Unit: nhân viên rồi quản lý xác nhận trên fingerprint đúng kỳ, lưu lịch sử riêng |
| Thanh toán/đối soát lương | **Chặn ghi trusted** | Chưa có liên kết nguồn sổ quỹ/ngân hàng/bút toán chính thức; không bật Local subledger thay thế |

35/35 contract tests PASS. Bốn nhóm transaction trên Firebase Emulator sử dụng dữ liệu QA Local được đánh dấu `SYNTHETIC_ONLY`; không phải chứng cứ HTTPS/Firebase Production hoặc kiểm thử APK mới. Các lần chạy harness cũ không tương thích nguồn chuẩn được giữ trong bằng chứng Local, không dùng để kết luận PASS.

## Signing readiness

- Giữ nguyên keystore `hdmanager-upload-key.jks`, alias `hdmanager-upload`.
- SHA-256 tệp mã hóa: `d5d616282282ea86ac1a99247b785fdedec9b93a399a6e3f03037693b236a43d`.
- `HD_RELEASE_KEYSTORE_BASE64`: đã có trên GitHub Secrets, CI đã khôi phục đúng bytes.
- `HD_RELEASE_STORE_PASSWORD`: **MISSING**.
- `HD_RELEASE_KEY_PASSWORD`: **MISSING**.
- Không tạo/thay khóa, không đoán mật khẩu, không đưa khóa hay giá trị secret vào Git/log.
- Chưa có APK/AAB Release mới, chưa xác minh chữ ký hoặc nâng cấp. APK dev.83 không được đổi tên thành Release.

Người giữ khóa cần cấu hình đúng hai mật khẩu hiện hữu tại GitHub repository Settings → Secrets and variables → Actions, hoặc secret manager đã cấp quyền. Không gửi giá trị vào chat.

## Các điều kiện còn chặn phát hành

1. Hai mật khẩu ký chính thức nêu trên.
2. API trusted/JWK chưa được triển khai và kiểm chứng HTTPS trên môi trường được phép. Production `version.json` vẫn là `577d303144421b1c0e6e822ce03912ce42d5e1f4`; `/api/offline/grant` hiện trả 404. Composition chưa đăng ký endpoint Production; không gỡ gate để phát hành khi thiếu bằng chứng.
3. Thanh toán lương chưa liên kết sổ quỹ/ngân hàng và journal chuẩn. `payrollSettlements.cjs` hiện chỉ ghi settlement/payment/reference/receipt; không tự chọn tài khoản kế toán hoặc tạo sổ song song.
4. Chưa có báo cáo HTTPS cùng source SHA đáp ứng toàn bộ miền ghi, reload/offline/reconnect và đối chiếu tài chính/kho. Kết quả Local được phân loại đúng phạm vi.

Không deploy Web, thay Rules, sửa dữ liệu Production, tạo release tag hoặc phát hành Google Play trong đợt này. Backup/rollback Production hiện hữu được giữ nguyên. Chỉ kết luận `RELEASE COMPLETE` khi các điều kiện bắt buộc thực sự đạt.
