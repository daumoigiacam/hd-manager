# HD Manager Store Release Checklist

Ngay sau khi build xong, hay dung file nay de kiem tra truoc khi dua len Google Play va App Store.

## 1. Firebase va du lieu

- Deploy Firestore rules va Storage rules: `npx firebase-tools deploy --only firestore:rules,storage`
- Deploy Hosting va Functions: `npm run web:deploy:firebase`
- Kiem tra PayOS webhook tren dashboard PayOS tro ve: `https://hd-manager-c5839.web.app/webhooks/payos`
- Kiem tra tat ca du lieu moi tao deu co `companyId` dung cong ty.
- Kiem tra backup/khoi phuc va tai file backup thu cong truoc khi phat hanh.
- Tao lich backup hang ngay tren server hoac Cloud Scheduler neu can sao luu tu dong that su.

## 2. Bao mat bat buoc

- Khong dua file `.env`, `functions/.env`, `google-services.json` that len noi cong khai.
- Rotating lai PayOS key neu da tung dan key vao chat, log, anh chup man hinh hoac may khac.
- Hien tai app dung dang nhap nghiep vu + Firebase anonymous/custom token. De phat hanh dai han, can nang cap sang Firebase Auth user that/co custom claims `companyId`, `role`, `employeeId`/`customerId` de Firestore rules khoa du lieu theo cong ty o server.
- Bat App Check cho Firebase sau khi da on dinh APK/iOS/web.

## 3. Google Play

- Dung AAB release: `npm run android:aab:release`
- Cau hinh signing release trong Android Studio/Gradle truoc khi upload AAB.
- Kiem tra `android/app/google-services.json` dung Firebase project production.
- Chay internal testing tren Google Play Console truoc khi production.
- Dien Data Safety: vi app xu ly so dien thoai, vi tri, anh, danh ba, du lieu tai chinh, noi dung tin nhan/noi bo.
- Cung cap link Privacy Policy va cach xoa tai khoan/du lieu.

## 4. App Store

- Xac nhan bundle id production trong `ios-expo/app.json`.
- Build bang EAS/Xcode voi Apple Developer Team production.
- Dung HTTPS production, khong dung local/LAN khi nop App Store.
- Dien App Privacy: contact info, location, user content, financial info, identifiers, diagnostics neu co.
- Neu co tao tai khoan trong app, phai co cach xoa tai khoan/yeu cau xoa du lieu.
- Chuan bi anh screenshot iPhone, iPad neu supportsTablet van bat.

## 5. Kiem thu nghiep vu truoc release

- Dang nhap cong ty/nhan su/khach hang, dong app mo lai van tu vao dung tai khoan.
- Tao don dat hang tren dien thoai, PC thay ngay.
- Xuat kho xong don thieu an dung.
- Tao hoa don, QR PayOS duoc tao, thanh toan PayOS tu tru cong no va tao thong bao.
- Thu/chi, so no, diem thuong cap nhat realtime.
- Dispatcher Zalo tren PC chi gui dung nhom co link cua khach, khong gui lai don da sent.
- Reset du lieu chi xoa dung vung du lieu da chon va co backup truoc.

## 6. Lenh kiem tra nhanh

```powershell
npm run store:preflight
npm run android:sync
npm run android:aab:release
```

Neu can test APK truc tiep:

```powershell
npm run android:apk:debug
```
