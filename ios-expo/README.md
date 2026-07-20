# HD Manager iOS Test

Thu muc nay la ban iOS rieng de test tren iPhone bang Expo Go/EAS. Ban Android APK van giu o thu muc goc va khong phu thuoc vao thu muc nay.

## 1. Test cung WiFi

Mo web app tren may Windows:

```powershell
npm.cmd run ios:web:lan
```

Mo Expo tren iPhone:

```powershell
npm.cmd run ios:expo:lan
```

Neu iPhone khong tu thay server, mo `http://<IP-may-Windows>:5173/open-expo.html` bang Safari tren iPhone roi bam `Mo bang Expo Go`.

## 2. Test khac WiFi bang tunnel

Dung lenh nay khi iPhone khong cung WiFi voi may Windows:

```powershell
npm.cmd run ios:expo:tunnel
```

Tunnel giup Expo Go nap bundle qua internet. Web app van can co dia chi truy cap duoc tu iPhone. Cach on dinh nhat la deploy web len Firebase Hosting, roi cau hinh `EXPO_PUBLIC_HD_MANAGER_URL`.

## 3. Dung that cho nhan vien qua internet

Expo Go chi nen dung de test. Khi cho nhan vien dung that, app nen tro toi URL online:

1. Deploy web:

   ```powershell
   npm.cmd run web:deploy:firebase
   ```

2. Tao file `ios-expo\.env.local`:

   ```env
   EXPO_PUBLIC_HD_MANAGER_URL=https://hd-manager-c5839.web.app
   ```

3. Chay lai Expo:

   ```powershell
   npm.cmd run ios:expo:tunnel
   ```

Khi co Apple Developer duyet xong, dung EAS de tao ban cai dat iPhone rieng:

```powershell
cd ios-expo
npm.cmd run build:ios:preview
```

## 4. Ghi nho

- LAN: nhanh, nhung iPhone phai cung WiFi voi may Windows.
- Tunnel: dung de test khac WiFi, phu thuoc dich vu tunnel cua Expo.
- Firebase Hosting + EAS: phu hop de nhan vien dung that vi khong phu thuoc may Windows hoac WiFi noi bo.
