# Bao cao nghiem thu toi uu SePay - 2026-07-14

## Pham vi da xu ly

- Toi uu API tao QR SePay.
- Toi uu webhook SePay.
- Them trace log theo mili-giay cho tung moc xu ly.
- Them bang tra cuu `payment_lookup` de webhook tim don hang nhanh theo ma hoa don / ma thanh toan.
- Tach thong bao thanh toan sang job nen `payment_jobs` va Cloud Function `processPaymentJob`.
- Them retry co gioi han 1s -> 2s -> 5s cho cac ghi Firestore quan trong.
- Them Firestore indexes cho cac truy van thanh toan, doi soat va job nen.

## Log timestamp moi

Backend ghi log dang JSON voi prefix:

```text
[payment_trace]
```

Nhung moc chinh:

- `request_received`
- `auth_verified`
- `order_loaded`
- `qr_reused`
- `qr_built`
- `order_payment_write_start`
- `order_payment_written`
- `webhook_received`
- `webhook_verified`
- `order_lookup_start`
- `order_lookup_found`
- `payment_duplicate_check_start`
- `payment_firestore_write_start`
- `payment_updated`
- `webhook_response_ready`

Moi log co:

- `traceId`
- `flow`
- `provider`
- `orderId`
- `paymentCode`
- `elapsedMs`
- `deltaMs`

## Diem gay cham da xu ly

1. Webhook truoc day co the phai do nhieu truong hoac scan toi 2.000 don cu de tim hoa don.
   - Da them `payment_lookup` de tim truc tiep theo token ma hoa don.

2. Webhook truoc day vua tru no vua ghi thong bao ngay trong cung request.
   - Da tach thong bao sang `payment_jobs`.
   - Webhook uu tien cap nhat payment/order/customer roi tra HTTP 200 nhanh.

3. Tao QR khi bam nhieu lan co nguy co ghi lai nhieu lan khong can thiet.
   - Da uu tien tai su dung QR SePay neu don van dang cho thanh toan va dung tai khoan nhan.
   - Da ghi lookup cho QR cu de webhook doi soat nhanh hon.

4. Loi tam thoi Firestore co the lam mat trai nghiem.
   - Da them retry co gioi han, khong retry vo han.

## Index da them

File: `firestore.indexes.json`

- `orders`: payment provider/status, invoiceCode/status, paymentCode/status.
- `payments`: provider/order, provider/referenceCode, status/transactionAt.
- `payment_lookup`: provider/status/updatedAt.
- `payment_reconciliations`: provider/status/createdAt.
- `payment_jobs`: type/status/createdAt.

## Kiem tra da chay

- `node --check functions/index.js`: PASS.
- `node -e "require('./functions/index.js')"`: PASS.
- `npm.cmd run build`: PASS.
- `npx.cmd firebase-tools deploy --only functions,firestore:indexes`: PASS mot phan ban dau, `processPaymentJob` can retry do Eventarc propagation.
- `npx.cmd firebase-tools deploy --only functions:processPaymentJob`: PASS.

## Deploy

- Firestore indexes: deployed thanh cong.
- `createSepayPaymentRequest`: updated thanh cong.
- `sepayWebhook`: updated thanh cong.
- `syncSepayPaymentStatus`: updated thanh cong.
- `sepayQrImageProxy`: updated thanh cong.
- `processPaymentJob`: created thanh cong.

## Ky vong hieu nang sau toi uu

- Tao QR: nhanh hon do tao local va tai su dung QR dang cho.
- Webhook: nhanh hon do lookup truc tiep `payment_lookup`.
- Cap nhat app realtime: dua vao Firestore realtime listener hien co cua app, khong can polling.
- Thong bao: xu ly nen qua `payment_jobs`, tranh lam cham webhook.

## Viec can theo doi tren production

- Xem Cloud Logging voi prefix `[payment_trace]` de do thuc te:
  - API tao QR co dat < 500ms khong.
  - Webhook tu luc nhan den `payment_updated` co dat < 1s khong.
  - App realtime co cap nhat trong < 500ms sau khi Firestore doi trang thai khong.
- Can stress test that su bang webhook gia lap tren Firebase Emulator/production staging truoc khi mo rong lon.

