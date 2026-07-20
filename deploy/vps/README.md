# HD Manager VPS Deployment Kit

Bo cau hinh nay dung de dua HD Manager len VPS rieng ma khong lam mat du lieu hien tai.

## Huong chuyen an toan

Phien ban hien tai cua HD Manager dang dung:

- Frontend: Vite/React, build ra thu muc `dist`.
- Mobile: Capacitor Android lay web build tu `dist`.
- Desktop: Electron lay web build tu `dist`.
- Du lieu: Firebase Auth, Firestore, Storage.
- API doi soat: Firebase Functions, cac endpoint `/api/sepay/*` va `/webhooks/sepay`.

Vi vay, giai doan 1 nen de VPS phuc vu giao dien web/PWA va reverse proxy API ve Firebase Functions hien tai.
Cach nay giup:

- Khong phai migrate database gap.
- Khong mat du lieu dang co tren Firebase.
- SePay webhook van hoat dong on dinh.
- Co the doi URL web/iPhone sang domain VPS.

Neu muon chuyen ca backend/database ve VPS, can lam rieng mot giai doan migration co kiem thu doi soat du lieu.

## Can chuan bi

1. Domain tro ve IP VPS `180.93.0.87`, vi PWA/iPhone, GPS, camera, thong bao can HTTPS.
2. Tai khoan SSH VPS, vi du `root@180.93.0.87`.
3. Ubuntu 22.04/24.04 duoc khuyen nghi.
4. File `.env.local` hien tai cua app de build dung Firebase/SePay/Goong.

## Cach dung nhanh tu Windows

Mo PowerShell tai thu muc goc du an:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\vps\publish-from-windows.ps1 -HostName 180.93.0.87 -SshUser root -Domain app.tenmiencuaban.vn
```

Neu chua co domain, co the dung IP de test web co ban:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\vps\publish-from-windows.ps1 -HostName 180.93.0.87 -SshUser root -Domain 180.93.0.87
```

Luu y: dung IP se khong co HTTPS hop le, nen mot so chuc nang tren dien thoai nhu GPS/camera/thong bao co the bi han che.

## URL webhook SePay

Sau khi domain chay HTTPS, URL webhook nen dat:

```text
https://app.tenmiencuaban.vn/webhooks/sepay
```

Trong giai doan 1, Nginx tren VPS se proxy URL nay ve Firebase Functions, nen app van doi soat nhu hien tai.

## Khi nao can chuyen backend sang VPS?

Chi nen chuyen backend sang VPS khi can:

- Khong muon dung Firebase Functions nua.
- Muon tu quan ly queue/log/server rieng.
- Co chien luoc backup database va migration ro rang.

Luc do can them:

- Firebase Admin service account JSON.
- Bien moi truong SePay bi mat.
- Process manager PM2/Systemd.
- Queue/worker.
- Script backup va restore.
