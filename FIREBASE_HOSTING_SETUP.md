# Chay app qua internet bang Firebase Hosting

Muc tieu: nhan vien co the mo app o bat ky WiFi/4G nao, khong can cung mang voi may Windows.

## Buoc 1: Dang nhap Firebase

```powershell
npx.cmd firebase-tools login
```

## Buoc 2: Build va deploy web

```powershell
npm.cmd run web:deploy:firebase
```

Sau khi deploy xong, web se co dang:

```text
https://hd-manager-c5839.web.app
```

## Buoc 3: Cho iOS wrapper dung URL online

Tao file:

```text
D:\quản lý bán hàng 1\ios-expo\.env.local
```

Noi dung:

```env
EXPO_PUBLIC_HD_MANAGER_URL=https://hd-manager-c5839.web.app
```

Sau do chay lai Expo:

```powershell
npm.cmd run ios:expo:tunnel
```

## Nen dung cach nao?

- Test nhanh trong nha: `npm.cmd run ios:expo:lan`
- Test khac WiFi: `npm.cmd run ios:expo:tunnel`
- Dung that cho nhan vien: Firebase Hosting + APK Android / EAS iOS

Expo Go khong nen xem la ban van hanh that vi no van phu thuoc Metro dev server. Ban van hanh that nen la APK Android va app iOS build bang EAS, ca hai deu doc web online da deploy.
