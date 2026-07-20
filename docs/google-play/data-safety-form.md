# Google Play Data Safety Form - HD Manager

Tài liệu này dùng để điền mục Data Safety trên Google Play Console.

## 1. Ứng dụng có thu thập dữ liệu không?

Có.

## 2. Ứng dụng có chia sẻ dữ liệu với bên thứ ba không?

Có, theo nghĩa dữ liệu được xử lý bởi nhà cung cấp dịch vụ cần thiết:

- Firebase/Google Cloud: xác thực, database, storage, hosting, thông báo, log lỗi nếu bật.
- SePay hoặc nhà cung cấp thanh toán: webhook/đối soát giao dịch.
- Dịch vụ bản đồ/chỉ đường nếu doanh nghiệp bật.
- Ứng dụng bên ngoài như ngân hàng, Zalo, Maps khi người dùng chủ động mở hoặc chia sẻ.

Không bán dữ liệu cá nhân.

## 3. Nhóm dữ liệu cần khai báo

### Personal info

- Name
- Phone number
- Email address nếu người dùng nhập
- Address
- User IDs/customer IDs/employee IDs

Mục đích: account management, app functionality, analytics nội bộ doanh nghiệp, fraud prevention/security.

### Financial info

- Purchase history/orders
- Payment info, debt, receipts, transaction references
- Bank transfer status and reconciliation code

Mục đích: payment, accounting, debt reconciliation, app functionality.

### Location

- Approximate location
- Precise location

Mục đích: attendance GPS, customer delivery location, driver route, maps. Không khai báo background location trong Android manifest hiện tại.

### Photos and videos

- Photos do người dùng chụp/tải lên: chứng từ, tài sản, hóa đơn, giấy tờ.

Mục đích: app functionality, record keeping. Ứng dụng không yêu cầu quyền đọc video trong bản Android hiện tại.

### Files and docs

- Documents uploaded by users: hợp đồng, giấy tờ nhân sự, giấy tờ xe, chứng từ.

Mục đích: app functionality, record keeping.

### Contacts

- Selected contact name/phone/address when user taps "Lấy từ danh bạ điện thoại".

Mục đích: app functionality. Không tự động tải toàn bộ danh bạ.

### App activity

- In-app actions, orders created, messages, audit logs, feature usage.

Mục đích: app functionality, security, fraud prevention, analytics nội bộ.

### App info and performance

- Crash logs, diagnostics, ANR/crash status if Crash Reporting/Play Android Vitals is enabled.

Mục đích: diagnostics, app quality.

### Device or other IDs

- Installation/session IDs, notification token, device metadata needed for sync/notification.

Mục đích: notifications, fraud prevention, app functionality.

## 4. Security practices

- Data is encrypted in transit: Yes, HTTPS/Firebase TLS.
- Users can request data deletion: Yes, through company owner/admin or support contact.
- Data is not sold: Yes.
- App follows Families policy: Not intended for children.

## 5. Notes for Play Console

- If microphone voice input remains enabled, declare Audio collection only if audio is uploaded/stored or processed beyond local transient use. Current code can send voice input for AI parsing when the feature is used, so disclose microphone/audio processing if publishing that feature.
- If future releases add background driver tracking, update Android manifest, privacy policy, prominent disclosure, and Background Location permission declaration before submitting.
