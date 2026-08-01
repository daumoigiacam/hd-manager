# Bao cao kiem tra va toi uu module Xuat kho

Ngay kiem tra: 01/08/2026

## 1. Pham vi kiem tra

- Form tao phieu xuat: khach hang, san pham, so luong, don vi, cac lan can, tai xe, ghi chu va luu phieu.
- Danh sach xuat kho trong ngay: tim kiem, gom nhom, sua dong, sua rieng so kg, chia se va xoa.
- Bang Don Thieu, lich su xuat kho va cac bo loc ngay/thang.
- Luong ghi Firebase cua them/sua/xoa phieu xuat.
- Realtime listener, timer, event listener va cleanup khi unmount.
- Duong nhap lieu tren Web, Android Capacitor WebView va Electron.

## 2. Nguyen nhan goc

### Critical - ban phim IME bi phat lai gia tri khi app tu chuyen o

Truoc khi sua, hai handler nhap cac lan can tu dong `focus()` va `select()` o tiep theo ngay sau khi nhan thay so thap phan. Tren mot so ban phim Samsung/OPPO/Xiaomi, phan IME dang composition co the commit lai chuoi vao o vua duoc focus. Vi vay `12.5` co the thanh `12.512.5`, hoac `12` bi phat lai thanh `1212`.

Bang chung trong ban truoc:

- `handleWeightEntryDraftChange` tao timer 80 ms de tu chuyen o.
- `handleDispatchListWeightEntryChange` chuyen focus ngay sau thay doi.
- Ca hai duong deu `select()` noi dung o tiep theo trong luc ban phim co the chua ket thuc composition.

Xu ly:

- Bo hoan toan tu dong chuyen o theo gia tri vua go.
- Chi chuyen o khi nguoi dung bam Enter va khong o trang thai composition.
- Theo doi `compositionstart`, `compositionend`, `event.isComposing` va `nativeEvent.isComposing`.
- Them lop bao ve cho chuoi IME phat lai nguyen khoi, nhung van cho phep nhap hop le nhu `11`, `22` va `1212`.

### High - moi ky tu render lai toan bo module Xuat kho

Truoc khi sua, state cua tung o can nam trong `WarehouseDispatchView`. Moi ky tu goi `setWeightEntriesDraft` hoac `setDispatchListWeightEditor`, lam render lai form, danh sach trong ngay, bang gom tai xe/khach, Don Thieu va lich su.

Xu ly:

- Tach `WarehouseWeightEntriesModal` thanh component `React.memo`.
- State `entries` nam cuc bo trong modal; man hinh cha chi nhan du lieu sau khi bam Cap nhat.
- Moi ky tu chi co mot lan `setEntries`, khong cap nhat state cha va khong ghi Firebase.

### High - tim kiem mo khach hang/san pham tinh lai khi state khong lien quan thay doi

Ham xep hang tim kiem phai chuan hoa chuoi, tao alias, tach token va cham diem cho tung muc. Truoc khi sua, ham nay chay truc tiep trong moi render cua module.

Xu ly:

- On dinh ham xep hang bang `useCallback`.
- Memo hoa danh sach lua chon, ket qua khach hang va ket qua san pham bang `useMemo`.
- Chi tinh lai khi keyword hoac tap du lieu nguon thuc su thay doi.

### Medium - co the gui yeu cau sua kg lap khi bam nhanh

Truoc khi sua, nut Cap nhat khong co khoa chong submit lap rieng cho editor kg.

Xu ly:

- Them `dispatchListWeightSaveLockRef` va trang thai `isSavingDispatchListWeight`.
- Mot lan bam chi tao toi da mot lan goi sua phieu; nut bi khoa trong khi dang luu.
- Neu luu loi, modal va du lieu dang nhap van duoc giu de nguoi dung thu lai.

## 3. Ket qua kiem tra cac nghi van

| Noi dung | Ket qua |
|---|---|
| Hai handler cung chay cho mot input | Khong phat hien |
| Dung ca `value` va `defaultValue` | Khong phat hien |
| React StrictMode lam handler chay hai lan | Khong su dung StrictMode o entry hien tai |
| Goi API/Firestore khi go tung ky tu | Khong co |
| Ghi Firebase khi luu | Mot lan tren moi thao tac xac nhan hop le |
| Listener realtime bi dang ky lap ma khong cleanup | Khong phat hien; cac unsubscribe/timer/interval deu duoc cleanup |
| Timer nhap kg con ton tai sau unmount | Timer tu dong da bi loai bo; task focus Enter co cleanup |
| Animation nang tren input kg | Khong phat hien |
| Race condition khi bam Cap nhat nhieu lan | Da them save lock |
| Key input khong on dinh | Key theo chi so o trong mang co do dai quan ly on dinh; khong tao key ngau nhien |

## 4. File va vi tri thay doi

| File / dong | Thay doi |
|---|---|
| `src/App.jsx:51662` | `WarehouseWeightEntriesModal`: editor kg doc lap, local state, IME guard va cleanup. |
| `src/App.jsx:51709` | Moi ky tu chi cap nhat mot local state, khong cap nhat man hinh cha. |
| `src/App.jsx:52325-52396` | Memo hoa xep hang/tim khach hang va san pham. |
| `src/App.jsx:53172` | Khoa mot lan luu khi sua kg va giu modal neu Firebase loi. |
| `src/App.jsx:12172-12366` | Vi tri da audit dang ky va cleanup realtime listener/timer/interval; khong sua data flow. |
| `src/App.jsx:16622-16734` | Vi tri da audit them/sua phieu va rollback; khong sua data flow. |
| `src/utils/warehouseWeightEntries.js:1-76` | Ham thuan de chuan hoa, tinh tong, tao hang, lam sach va chong chuoi IME lap. |
| `tests/warehouse-dispatch-weight-input.test.mjs:1-103` | Regression test cho `12.5`, `12,5`, `12.512.5`, `1212`, IME composition, mot state update va khong ghi Firebase khi go. |
| `package.json:20-21` | Them `test:warehouse-dispatch` va dua test nay vao `test:all`. |

## 5. So sanh truoc va sau

| Chi so | Truoc | Sau |
|---|---:|---:|
| Parent `WarehouseDispatchView` render khi go mot ky tu kg | 1 lan | 0 lan |
| State update khi go mot ky tu | 1 parent update, co the them update khi auto-advance | 1 local update |
| Auto-focus task sau khi go so thap phan | 1 timer | 0 |
| Firestore/API request khi go | 0 | 0 |
| Firestore write khi bam luu | 1 | 1 |
| Pure input transition trung binh | Chua co benchmark tach rieng | 0,0006 ms/input |
| Runtime local: nhap `12.5` | Co nguy co phat lai/nhay o tren IME mobile | O 1 = `12.5`, o 2 rong, focus van o 1 |
| Nguong muc tieu input | Duong cu co the giat do full parent render | Pure transition nho hon 16 ms rat xa |

Luu y: so lan render duoc xac dinh truc tiep tu vi tri dat state truoc/sau. FPS va thoi gian React commit tren Android that can duoc xac nhan bang Android Profiler/Chrome tracing tren thiet bi dich; khong suy dien thanh so lieu thiet bi khi chua do.

## 6. Firebase va tinh toan

- `handleAddWarehouseDispatch` van optimistic update va goi mot `saveDataDocument` nhu truoc.
- `handleEditWarehouseDispatch` van merge dung document, rollback local state neu loi.
- Co che `clientMutationId` va duplicate window hien co duoc giu nguyen.
- Cau truc `warehouseDispatches`, field `weightKg`, `weightEntries`, cong thuc tong kg va cac quyen khong thay doi.
- Realtime full-collection listener khong phai nguyen nhan cua loi go lap va khong chay lai theo tung ky tu. Day van la rui ro scale chung khi du lieu rat lon, nhung thay doi query/cau truc nam ngoai Sprint vi co the anh huong luong du lieu.

## 7. Kiem thu

- `npm run test:warehouse-dispatch`: PASS, 10 nhom kiem thu.
- Input sanitizer: trung binh 0,0001 ms/input.
- Full input transition: trung binh 0,0006 ms/input.
- `npm run test:product-pricing-units`: PASS.
- `npm run test:design-system`: PASS.
- `npm run test:all`: PASS; stress test 11.309 thao tac.
- `npm run test:kpi`: PASS; device log khong bat buoc va duoc ghi WARNING.
- `npm run build`: PASS; lan build cuoi xu ly 2.348 module trong 25,37 giay.
- Smoke test tren ban local da dang nhap: mo `Xuat kho` -> `Nhap cac lan can kg`, nhap `12.5`; gia tri chi nam o lan can 1, lan can 2 rong, focus khong tu nhay.
- Console runtime sau smoke test: 0 loi. Thao tac `fill` qua cong cu trinh duyet mat 26 ms gom ca round-trip dieu khien; phep chuyen state thuan trong app la 0,0006 ms/input.

Bo performance tong the van canh bao kien truc full-collection realtime khi mo rong den hang nghin/hang tram nghin user. Canh bao nay ton tai doc lap voi editor kg va khong duoc sua trong Sprint nay de tranh thay doi Firebase/data flow.

## 8. Xac nhan an toan

- Khong thay doi business logic.
- Khong thay doi schema, document hay du lieu Firestore.
- Khong thay doi cong thuc tong kg.
- Khong thay doi UI nhin thay; modal giu nguyen noi dung, class va hanh dong.
- Khong thay doi API contract, role hay permission.
- Khong xoa du lieu cu.

## 9. Rui ro con lai va buoc xac nhan tren thiet bi

- Can thu truc tiep tren it nhat mot may Samsung/OPPO/Xiaomi dung ban phim mac dinh de xac nhan IME thuc te.
- Can thu cung dong thoi Web Chrome, APK Capacitor va EXE Electron voi bo du lieu lon cua cong ty.
- Neu du lieu mot cong ty tang rat lon, can mot Sprint rieng de gioi han realtime query theo ngay/man hinh va phan trang; khong nen ghep thay doi kien truc do vao ban sua input nay.
