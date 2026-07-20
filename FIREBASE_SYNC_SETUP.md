# Đồng bộ dữ liệu qua Firebase

App hiện có 2 chế độ dữ liệu:

- `local`: lưu dữ liệu trong máy đang mở app, dùng để preview an toàn.
- `cloud`: dùng Firebase Firestore thật để nhiều điện thoại và máy tính cùng đồng bộ qua internet.

## 1. Cấu hình `.env.local`

Giữ `VITE_GEMINI_API_KEY` nếu đang dùng AI, sau đó thêm các dòng Firebase:

```env
VITE_DATA_MODE=cloud
VITE_HD_APP_ID=hd-manager-production
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

Các giá trị này lấy trong Firebase Console, mục Project settings, phần Web app config.

## 2. Bật Authentication

Trong Firebase Console, bật Authentication với phương thức Anonymous.

App hiện dùng anonymous sign-in để mở kết nối Firestore, còn phân quyền nghiệp vụ vẫn nằm trong tài khoản nội bộ của app.

## 3. Firestore Rules để thử nghiệm

Rules thử nghiệm nhanh:

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/public/data/{collectionName}/{docId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Rules này phù hợp để test nội bộ. Khi app đi vào vận hành thật, nên siết rules theo công ty và vai trò tài khoản.

## 4. Build

Sau khi điền `.env.local`, chạy:

```powershell
npm.cmd run build
```

Hoặc build APK:

```powershell
npm.cmd run android:apk:debug
```

Từ lúc đó, các dữ liệu như khách hàng, sản phẩm, đơn hàng, đơn đặt hàng, phiếu xuất kho, thu chi, chấm công, lương sẽ ghi vào Firestore và đồng bộ giữa nhiều thiết bị.
