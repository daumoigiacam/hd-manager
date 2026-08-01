# Smart Customer Ordering - Bao cao trien khai

## Pham vi

Sprint chi cap nhat ba luong giao dien/nghiep vu da duoc yeu cau:

- Don dat hang.
- San pham co dinh theo khach hang.
- Bao cao giao hang.

Khong thay doi cau truc du lieu cu, cong no, doanh thu, bang luong, nhap kho, xuat kho, dashboard, quyen nguoi dung hay cong thuc tai chinh khac.

## Kien truc Smart Memory

`Pricing Unit` la nguon du lieu duy nhat quyet dinh cach tinh tien. Smart Memory chi ghi nho cach nhan vien nhap so luong cho dung cap khach hang + san pham, khong duoc phep thay doi cong thuc tinh tien.

Moi cap du lieu duoc luu tai mot tai lieu xac dinh duy nhat:

```text
artifacts/{appId}/public/data/customerProductPreferences/{companyId_customerId_productId}
```

Tai lieu luu cac thong tin:

- `companyId`, `customerId`, `productId`.
- `defaultInputUnit`: don vi nhap mac dinh da duoc nguoi dung xac nhan.
- `lastInputUnit`: don vi nhap gan nhat.
- `updatedAt`, `updatedBy`.

Ung dung doc dung mot tai lieu theo ID xac dinh, khong quet toan bo Firestore. Ket qua duoc cache trong bo nho cua phien dang nhap. Khi lan dau luu don, app ghi nho don vi nhap. Khi don vi moi khac mac dinh, app hoi nguoi dung truoc khi cap nhat; chon "Khong" chi cap nhat lan nhap gan nhat va giu nguyen mac dinh.

## Pricing Unit

Danh muc chuan:

`Kg`, `Con`, `Cai`, `Bo`, `Thung`, `Bao`, `Khay`, `Loc`, `Goi`, `Chai`, `Khac`.

Du lieu cu van duoc doc tu `defaultUnit`, `quantityUnit`, `unit` va cac ban ghi gia theo don vi. Khi chinh sua san pham co dinh, `pricingUnit` va alias tuong thich `defaultUnit` cung duoc luu de khong lam hong cac man hinh cu.

Quy tac tinh:

- `Pricing Unit = Kg`: su dung so kg thuc te giao. Neu don duoc nhap theo Con ma chua co kg thuc te, ket qua o trang thai cho du lieu, khong nhan nham so Con voi gia Kg.
- `Pricing Unit = Con/Cai/Bo/Thung/Bao/Khay/Loc/Goi/Chai/Khac`: su dung so luong thuc te cung don vi; neu chua giao thi su dung so luong dat cung don vi.
- Don vi Smart Memory khong tham gia quyet dinh cong thuc gia.

## Luong du lieu

```text
San pham co dinh cua khach
  -> Pricing Unit + don gia
  -> Don dat hang luu pricingUnit, inputUnit, pricingQuantity, lineTotal
  -> Bao cao giao hang uu tien so luong/kg thuc te theo Pricing Unit
  -> pricingAmount duoc luu cung bao cao
  -> Tong hoa don, doanh thu va cong no dung cung ket qua thanh tien
```

Bao cao giao hang van giu cac truong khoi luong/so luong cu de tuong thich. Cac dong tinh theo Kg hien kg thuc te; cac dong tinh theo don vi khac khong nhan gia theo kg.

## File da cap nhat

- `src/services/productPricingUnits.js`: danh muc va chuan hoa Pricing Unit, doc gia theo dung don vi.
- `src/services/smartCustomerOrdering.js`: ID xac dinh, Smart Memory, chon so luong tinh gia va tinh thanh tien.
- `src/App.jsx`: ket noi cau hinh san pham co dinh, don dat hang, Smart Memory va bao cao giao hang.
- `src/utils/deliveryReconciliationUx.js`: gom doi chieu theo san pham + Pricing Unit + don gia.
- `src/mocks/firebase-firestore.js`: bo sung mock `getDoc` cho ban build/test.
- `tests/smart-customer-ordering.test.mjs`: 35 tinh huong Smart Memory va tinh gia.
- `tests/product-pricing-units.test.mjs`: hoi quy chuan hoa don vi va gia.
- `tests/delivery-reconciliation-ux.test.mjs`: hoi quy doi chieu theo Kg va don vi so luong.
- `package.json`: lenh test rieng va bo test tong.

## Ket qua kiem thu

Da kiem tra tren 35 tinh huong Smart Customer Ordering, bao gom hon 20 tinh huong thuc te bat buoc:

- ID/caching dung cong ty, khach hang, san pham.
- Lan dat dau tien.
- Giu mac dinh khi chon "Khong".
- Doi mac dinh khi chon "Co".
- Ban theo Kg, Con, Cai, Bo, Thung, Bao, Khay, Loc, Goi, Chai, Khac.
- Kg thuc te khac so luong dat.
- So luong thuc te khac so luong dat.
- Khong nhan nham Kg thanh Con hoac nguoc lai.
- So thap phan Viet Nam va tien dinh dang Viet Nam.
- Gia 0, so luong am, thieu so luong thuc te.
- Du lieu cu `defaultUnit` van doc duoc.
- Doc Firestore theo mot document xac dinh.
- Don dat hang luu Smart Memory sau khi ghi thanh cong.
- Bao cao giao hang luu ket qua Pricing Unit co tham quyen.

Bo test doi chieu kiem tra 1.000 nhom du lieu ma khong can render lai toan bo giao dien. Ket qua chi tiet duoc ghi trong log test cua lan build nghiem thu.

## Xac nhan an toan

- Khong tao field `Order Unit` trong cau hinh san pham.
- Khong hard-code tien thuong, doanh thu hay cong no.
- Khong sua cong thuc luong, cong no hoac module tai chinh.
- Khong xoa, migrate hoac ghi de du lieu cu.
- Firestore Rules hien tai da bao phu collection moi theo quy tac chung cua du lieu cong ty; khong mo quyen cong khai.
- Neu dong cu khong co du lieu thuc te phu hop voi Pricing Unit, app cho du lieu thuc te thay vi tinh sai doanh thu.

## Rui ro con lai

- Cac ban ghi cu khong co `pricingUnit` se dung don vi hien tai cua san pham/co dinh khach hang lam fallback, dung nhu yeu cau tuong thich nguoc.
- Khi gia tinh theo Kg nhung nhan vien dat theo Con, so tien chinh xac chi hoan tat sau khi co kg giao thuc te; app danh dau dang cho thay vi tam tinh sai.
