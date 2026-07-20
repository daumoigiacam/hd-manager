# Cau hinh PayOS cho HD Manager

Muc tieu: khi nhan vien bam `Duyet gui Zalo`, HD Manager tu tao ma VietQR/link thanh toan theo ma don. Khi khach chuyen khoan dung noi dung ma don, PayOS goi webhook de app tu ghi nhan thanh toan va tru cong no.

## 1. Lay 3 ma PayOS o dau?

Vao trang quan tri PayOS:

```text
https://my.payos.vn
```

Lam theo cac buoc:

1. Dang nhap tai khoan PayOS.
2. Xac thuc to chuc/ca nhan neu PayOS yeu cau.
3. Lien ket tai khoan ngan hang nhan tien.
4. Vao menu `Kenh thanh toan`.
5. Bam `Tao kenh thanh toan`.
6. Nhap ten kenh, vi du `HD Manager`.
7. Chon ngan hang chinh nhan tien.
8. Sau khi tao kenh thanh cong, PayOS se hien thi 3 khoa:

```env
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
```

Luu y: 3 khoa nay la thong tin bi mat, khong dua vao code frontend, khong gui cho nguoi khong phu trach ky thuat.

## 2. Nhap khoa vao Firebase Functions

Tao file:

```text
functions/.env
```

Noi dung:

```env
PAYOS_CLIENT_ID=dien_client_id_cua_payos
PAYOS_API_KEY=dien_api_key_cua_payos
PAYOS_CHECKSUM_KEY=dien_checksum_key_cua_payos
HD_MANAGER_APP_ID=hd-manager-production
HD_MANAGER_PUBLIC_URL=https://hd-manager-c5839.web.app
PAYOS_RETURN_URL=
PAYOS_CANCEL_URL=
```

Neu de trong `PAYOS_RETURN_URL` va `PAYOS_CANCEL_URL`, Functions se tu dung:

```text
https://hd-manager-c5839.web.app/
```

## 3. Deploy Functions va Hosting

Chay:

```powershell
npx firebase-tools deploy --only functions,hosting
```

Hoac neu dung script co san:

```powershell
npm.cmd run web:deploy:firebase
```

## 4. Cau hinh webhook trong PayOS

Trong PayOS, mo `Kenh thanh toan` da tao, them webhook URL:

```text
https://hd-manager-c5839.web.app/webhooks/payos
```

Webhook nay dung de PayOS bao giao dich da thanh toan ve HD Manager.

## 5. Luong chay trong app

1. Nhan vien tao hoa don.
2. Nhan vien bam `Duyet gui Zalo`.
3. App goi Firebase Functions de tao link thanh toan PayOS.
4. PayOS tra ve `checkoutUrl`, `qrCode`, `paymentLinkId`.
5. App luu thong tin thanh toan vao hoa don va hang cho gui Zalo.
6. Khach quet QR/chuyen khoan.
7. PayOS goi `/webhooks/payos`.
8. App kiem tra ma don trong noi dung chuyen khoan.
9. Neu hop le, app tao ban ghi `payments`, cap nhat hoa don va tru cong no.

## 6. Cach xu ly tien

- Chuyen thieu: ghi nhan so da thanh toan, hoa don con no phan con lai.
- Chuyen du: hoa don chuyen sang da thanh toan.
- Chuyen du tien: hoa don da thanh toan, phan du luu vao tien du cua khach.
- Sai ma don: dua vao danh sach can doi soat thu cong.
- Webhook gui trung: app bo qua, khong tru tien lan nua.

## 7. Ghi chu ve VietQR bien dong so du

PayOS la buoc chay nhanh de test thanh toan tu dong. Neu sau nay dung them VietQR Callback/Transaction Sync, app co the mo rong them endpoint:

```text
/webhooks/vietqr
```

Khi do HD Manager se nhan truc tiep bien dong so du ngan hang de doi soat song song voi PayOS.
