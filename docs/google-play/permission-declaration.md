# Android Permission Declaration - HD Manager

## Permissions currently declared

| Permission | User-facing purpose | Notes |
| --- | --- | --- |
| `INTERNET` | Đồng bộ Firebase, thanh toán, bản đồ, webhook, tải ảnh/QR. | Required. |
| `ACCESS_NETWORK_STATE` | Kiểm tra trạng thái online/offline để đồng bộ an toàn. | Required. |
| `POST_NOTIFICATIONS` | Gửi thông báo đơn hàng, công nợ, thanh toán, tin nhắn, chấm công. | Android 13+. |
| `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Chấm công GPS, lấy vị trí khách, bản đồ giao hàng, chỉ đường. | Foreground only. |
| `NEARBY_WIFI_DEVICES`, `ACCESS_WIFI_STATE` | Chấm công theo WiFi và đọc SSID/BSSID khi người dùng bật chấm công WiFi. | Không thay đổi cấu hình WiFi. |
| `CAMERA` | Chụp chứng từ, quét QR, ảnh hóa đơn/tài sản/giấy tờ. | Camera optional. |
| `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED`, `READ_EXTERNAL_STORAGE` maxSdk 32, `WRITE_EXTERNAL_STORAGE` maxSdk 28 | Chọn/tải ảnh từ máy, lưu/chia sẻ file ảnh hóa đơn trên Android cũ. | Scoped theo Android version. |
| `READ_CONTACTS` | Lấy một liên hệ khi người dùng bấm "Lấy từ danh bạ điện thoại" để thêm khách. | Không đọc toàn bộ danh bạ tự động. |
| `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Nhập nhanh bằng giọng nói nếu doanh nghiệp bật tính năng ghi âm/AI đọc đơn. | Microphone optional. |

## Permissions intentionally not declared

| Permission | Reason |
| --- | --- |
| `ACCESS_BACKGROUND_LOCATION` | Chưa phát hành theo dõi vị trí nền liên tục. Vị trí chỉ dùng trong phiên người dùng thao tác/chấm công/giao hàng. |
| `READ_MEDIA_VIDEO` | Bản hiện tại không cần đọc video từ thư viện. |
| `CHANGE_WIFI_STATE` | Ứng dụng chỉ đọc/quét thông tin WiFi phục vụ chấm công, không thay đổi trạng thái WiFi. |

## Prominent disclosure text suggestion

HD Manager dùng vị trí để chấm công GPS, lưu vị trí giao hàng và hỗ trợ tài xế chỉ đường. Ứng dụng chỉ lấy vị trí khi bạn sử dụng các chức năng này và không theo dõi vị trí nền trong bản hiện tại.

HD Manager dùng camera/ảnh để quét mã QR, chụp chứng từ, hóa đơn, tài sản và giấy tờ do bạn chủ động tải lên.

HD Manager dùng danh bạ chỉ khi bạn bấm "Lấy từ danh bạ điện thoại" để chọn một liên hệ và tạo khách hàng nhanh hơn.
