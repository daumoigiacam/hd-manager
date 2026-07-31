# HD CONNECT - Design Sprint 001: Presentation Layer Audit

## 1. Pham vi va nguyen tac

Bao cao nay la moc ket thuc **Phan A - Phan tich hien trang**. Tai thoi diem tao bao cao, chua co ma nguon giao dien nao duoc thay doi trong Sprint 001.

Pham vi chi gom Presentation Layer. Khong thay doi Database, Firebase, Firestore, VPS, API, SePay, QR, Webhook, Authentication, Permission, cong thuc tinh toan, business logic hay luong du lieu.

## 2. Tong quan repository

| Hang muc | Hien trang |
| --- | --- |
| Framework | React 19 + Vite 7 + Tailwind CSS 3 |
| Native/Desktop | Capacitor 8 + Electron 38 |
| Tep giao dien chinh | `src/App.jsx` - khoang 72.818 dong |
| CSS ung dung | `src/index.css` - khoang 1.336 dong nguon, 1,24 MB sau build |
| Component React cap cao | 77 component trong `App.jsx` |
| Legacy component con ton tai | 6 |
| Design System hien co | Bo token co ban va AppShell wrapper da co, chua du ngu nghia enterprise |
| Theme | Light/Dark/High Contrast co ten lop, pham vi token va quy tac con phan manh |

## 3. Kiem tra baseline

- `npm run build`: **PASS**, 2.339 module, 50,52 giay.
- `npm run test:all`: **PASS**.
- Stress suite: **PASS**, 11.309 thao tac.
- Runtime local: tai duoc du lieu that; khong co Console Error/Warning moi tai man hinh Don hang.
- Bundle giao dien chinh: JavaScript `2.094,86 kB` (gzip `539,81 kB`).
- CSS: `1.238,35 kB` (gzip `114,45 kB`).

## 4. Van de kien truc UI

### Critical

Khong phat hien loi Presentation Layer muc Critical lam thay doi du lieu hay nghiep vu trong baseline.

### High

1. **Monolithic UI:** `src/App.jsx` gom khoang 72.818 dong va 77 component, lam tang rui ro regression, kho tai su dung va kho chia tach bundle theo module.
2. **CSS/tokens chong lop:** co 5 khoi `:root`, 20 media query va 117 `!important`; thu tu cascade co the lam khac biet hien thi giua Web, APK va Electron.
3. **Typography khong thong nhat:** font Plus Jakarta Sans duoc nhung lap tai nhieu vi tri trong `App.jsx`; mot so khu vuc dung Segoe UI/Arial cho tai lieu xuat. Font giao dien chua co mot nguon duy nhat.
4. **Component primitive chua du:** AppShell hien tai chi la wrapper class; Card, Button, Input, Dialog, State va motion chua co API/token chung.
5. **Dialog/overlay phan manh:** co 59 lop `fixed inset-0`; moi man hinh tu quan ly bo cuc, z-index va scroll, tao nguy co bi Header/Sidebar/Keyboard che.

### Medium

1. **Mau hard-code:** 251 gia tri hex trong Presentation Layer. Cac mau trung lap nhieu nhat: trang, slate/ink, emerald, amber va blue.
2. **Bien the typography qua nhieu:** `text-sm` 1.018 lan, `text-xs` 880 lan, `text-[11px]` 628 lan, `text-[10px]` 420 lan, `text-[9px]` 51 lan.
3. **Bien the radius qua nhieu:** `rounded-2xl` 1.017 lan, `rounded-xl` 685 lan, `rounded-3xl` 221 lan, cung nhieu kich thuoc tuy y (`2rem`, `28px`, `30px`).
4. **Elevation phan manh:** `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl` duoc su dung truc tiep thay vi semantic elevation.
5. **Inline style:** 34 vi tri `style={{...}}`; mot so vi tri can thiet cho toa do dong, nhung phan con lai can duoc phan loai va dua ve token.
6. **Icon khong co mapping ngu nghia:** lucide-react duoc import rong, nhung chua co bo icon theo vai tro/nghiep vu de dam bao nhat quan.

### Low

1. Cac file con trong `src/design-system` hien chi re-export mot dong, chua cung cap tai lieu su dung hay primitive component.
2. Theme mode da co ten lop nhung chua co state/persistence tong quat tai AppShell.
3. Motion chua tu dong ton trong `prefers-reduced-motion` tren toan bo app.

## 5. Component va CSS trung lap

### Component trinh bay lap lai

- Header man hinh va cum hanh dong Search/Filter/Notification.
- Card thong ke, card danh sach, card empty state.
- Modal/Dialog co backdrop + header + body + footer.
- Badge trang thai va chip filter.
- Form label/input/validation/action footer.
- Loading, success, error, retry va empty state.
- Navigation desktop/rail/mobile.

### Mau CSS lap lai

- Card trang + border slate/emerald + shadow nhe + radius lon.
- Button pill mau emerald/blue/amber/rose.
- Label uppercase co tracking tuy y.
- Header gradient xanh voi icon tron.
- Overlay `fixed inset-0` voi backdrop toi va responsive alignment.

## 6. Theme, font, icon va layout cu

### Theme

Bo token hien co moi co mot cap mau brand, mot surface va mot canvas. Chua co thang mau 50-950, semantic foreground/background/container, disabled, inverse va on-color cho light/dark.

### Font

- Giao dien: Plus Jakarta Sans duoc nhung lap bang remote `@import`.
- Tai lieu xuat/hoa don/PDF: Segoe UI/Arial. Phan nay la artifact nghiep vu va **khong thuoc pham vi thay doi font cua Sprint**.
- Muc tieu moi: Inter Variable la chinh; SF Pro tren Apple; Roboto Flex/Roboto tren Android; system sans la fallback.

### Icon

Lucide React phu hop nhung can duoc dong goi thanh semantic icon map de tranh cung mot hanh dong dung nhieu icon khac nhau.

### Layout

AppShell, Header va Navigation wrapper da ton tai. Tuy nhien nhieu man hinh van tu quyet dinh padding, min-height, sticky/fixed va overlay, lam giao dien khong dong nhat.

## 7. Danh sach man hinh can refactor

### Nhom 1 - Nen tang va truy cap

- Dang nhap / tao cong ty / khoi phuc phien.
- Main AppShell, Header, Bottom Navigation, Navigation Rail, Sidebar, More Menu.
- Notification, Confirm Dialog, Error Boundary, Empty/Loading/Retry State.

### Nhom 2 - Ban hang va khach hang

- Dashboard / Executive Dashboard.
- Khach hang / Customer CRM / Customer Portal.
- Don hang, don dat, bao gia, gia ca, san pham.
- Hoa don, chia se va cac dialog lien quan.

### Nhom 3 - Kho va van hanh

- Nhap kho, xuat kho, nhap-xuat-ton.
- Bao cao giao hang, dieu phoi, ban do va tai san.

### Nhom 4 - Tai chinh

- Thu chi, cong no, ngan hang/thanh toan, bang luong.

### Nhom 5 - Nhan su va quan tri

- Nhan su, cham cong, danh gia, vai tro/phan quyen, cai dat, ho so.

### Nhom 6 - Zalo, AI va bao cao

- Tin nhan/Zalo CRM/Dispatcher.
- Tro ly AI va AI state.
- Bao cao tong hop va cac man hinh export.

## 8. Chien luoc refactor an toan

1. Mo rong token thanh semantic Design System ma khong sua du lieu/handler.
2. Tao mot stylesheet foundation duoc import mot lan tai entry point.
3. Nang AppShell va cac primitive dung chung; duy tri props/className cu de tuong thich nguoc.
4. Chuyen font giao dien sang nguon duy nhat; khong dong vao font canvas/PDF/hoa don.
5. Chuan hoa Header, Navigation, Dialog, Card, Button, Input va State theo lop semantic.
6. Ap dung Soft 3D chi cho dashboard/hero/logo/AI/loading/empty state.
7. Ton trong reduced motion; chi animate opacity/transform de tranh layout thrashing.
8. Kiem thu hoi quy sau moi nhom va commit nho, co the rollback.

## 9. Do uu tien

1. Token + typography + theme foundation.
2. AppShell + navigation + safe area.
3. Dialog/form/button/card/state primitive.
4. Man hinh truy cap va cac module su dung nhieu.
5. Dashboard/AI soft 3D co kiem soat.
6. Dark mode architecture va accessibility.
7. Responsive validation + bao cao nghiem thu.

## 10. Rui ro va bien phap bao ve

- Khong sua service, query, Firebase handler, SePay/QR/webhook hoac cong thuc tinh.
- Khong thay font cua canvas/PDF/hoa don de tranh thay doi artifact chia se.
- Duy tri class cu trong AppShell trong giai doan chuyen tiep.
- Moi nhom thay doi phai build/test va commit rieng.
- Moi loi runtime/layout moi se duoc coi la blocker truoc khi hoan tat Sprint.

