# HD Manager - Invoice Template Implementation Report

## Pham vi

- Da them 10 mau hoa don ban hang, dung React/HTML/CSS, khong dung anh chup thiet ke lam hoa don.
- `Cai dat > Mau hoa don` cho phep xem truoc va ap dung mau mac dinh cho cong ty (`company.invoiceTemplateId`).
- Menu trong chi tiet don hang cho phep chon mau rieng (`order.invoiceTemplateOverride`) hoac quay ve mac dinh cong ty. Mau da chon duoc dung cho chi tiet hoa don, xem truoc va anh chia se.
- Ho so hoa don dung du lieu don hang, khach, san pham, cong ty, so no va thanh toan hien co. Engine chi hien thi; khong ghi lai tien, cong no, kho hay trang thai giao hang.

## Cau truc

| Mau | Ten | Component | Diem nhan |
| --- | --- | --- | --- |
| 01 | Hien dai toi gian | `InvoiceTemplate01` | Header sach, bang hang, QR |
| 02 | Noi bat tong tien | `InvoiceTemplate02` | Tong cong lon, thanh mau xanh |
| 03 | Thanh toan nhanh | `InvoiceTemplate03` | No phai thu va QR uu tien |
| 04 | Timeline & trang thai | `InvoiceTemplate04` | Bon moc don/giao/thanh toan/hoan tat |
| 05 | Ngan hang / Clean | `InvoiceTemplate05` | Hero thanh toan, anh nen nhe |
| 06 | Phieu dep in A5 | `InvoiceTemplate06` | Khung trang trong, chu ky, A5 portrait |
| 07 | Premium Sang trong | `InvoiceTemplate07` | Vang, vien trang tri, chu ky |
| 08 | Hien dai hinh anh | `InvoiceTemplate08` | Hai cot anh/hoa don, chuyen doc tren mobile |
| 09 | Toi gian cao cap | `InvoiceTemplate09` | Nen trang, duong ke manh |
| 10 | Corporate chuyen nghiep | `InvoiceTemplate10` | Nhan dien doanh nghiep xanh |

`InvoiceTemplateEngine` chon dung mot component theo template ID. `buildInvoiceViewModel` tao view model chung, khong tinh lai nghiep vu. `InvoiceTemplateSettings`/`InvoicePreview` duoc tai theo yeu cau qua `React.lazy`.

## Du lieu va hanh vi

- Bang gia hien cac dong phat sinh: tien hang, giam gia/chiet khau, khuyen mai theo ten chuong trinh, tung loai phi, tong cong, da thu, cong no cu, con no don va tong phai thu. Cac khoan 0 khong hien.
- Gia tri `grandTotal`, `paid`, `invoiceDebt` va `totalReceivable` den tu don hang/so no hien tai; mau khong ghi hoac dieu chinh chung. QR thuc su dung bo tao VietQR hien co, gan so tien phai thu va noi dung chuyen khoan. Xem thu cung dung bo tao nay.
- Anh san pham lay tu dong hang hoac danh muc; anh loi/thieu co placeholder. Anh trang tri duoc tao rieng va nen WebP con 213 KB tai `public/invoice/white-chicken-farm.webp`, khong phai anh chup mau hoa don.
- Xem truoc co che do dien thoai, may tinh va ban in; xuat PNG, PDF A4/A5 va in qua trinh duyet. Chia se don hang tai su dung luong hien tai, nhung anh chia se duoc render theo mau dang ap dung.

## Kiem thu

| Hang muc | Ket qua |
| --- | --- |
| 10 mau x 8 tinh huong gia/thanh toan | PASS - `node tests/invoice-templates.test.mjs` |
| 10 mau x 7 kich thuoc 320/360/375/390/414/768/1024; 8 tinh huong; anh san pham tai duoc; khong tran ngang/loi runtime | PASS - `node tests/visual/invoice-templates.visual.mjs` |
| PNG, PDF A4/A5, anh chia se cho tung mau | PASS - visual test kiem tra blob > 5 KB |
| Ban in A5 mau 06 | PASS - PDF trinh duyet 1 trang A5, co noi dung |
| Cai dat: chon/xem truoc du 10 mau, luu mac dinh, override, reload va quay ve mac dinh | PASS - `node tests/visual/invoice-settings.integration.mjs` |
| VietQR demo va hoa don that trong preview | PASS - giai ma anh QR, doi chieu tai khoan va so tien 1.818.000/1.398.000 |
| Nut xuat PDF va anh tren UI | PASS - tai file that, dung duoi file va kich thuoc > 5 KB |
| Toan bo bo hoi quy hien co | PASS - `npm run test:all` |
| Lint hien co va cac tep hoa don moi | PASS - `npm run lint` va `npx eslint` cho invoice files |
| Typecheck du an | PASS - `npm run typecheck` (config hien tai chi bao phu module payroll) |
| Production build | PASS - `npm run build` |
| Whitespace | PASS - `git diff --check` (chi canh bao CRLF cua Git tren Windows) |

Anh chup QA o `test-results/invoice-templates/`. Preview local: `http://127.0.0.1:5207/`.

## Tep thay doi trong cong viec nay

- `src/App.jsx`, `eslint.config.js`
- `src/features/invoice-templates/invoiceTemplateModel.js`
- `src/features/invoice-templates/InvoiceTemplateEngine.jsx`
- `src/features/invoice-templates/InvoiceTemplateWorkspace.jsx`
- `src/features/invoice-templates/invoiceTemplates.css`
- `src/features/invoice-templates/invoiceTemplateWorkspace.css`
- `public/invoice/white-chicken-farm.webp`
- `tests/invoice-templates.test.mjs`
- `tests/visual/invoice-harness.html`, `tests/visual/invoice-harness.jsx`
- `tests/visual/invoice-templates.visual.mjs`, `tests/visual/invoice-settings.integration.mjs`
- `INVOICE_TEMPLATE_IMPLEMENTATION_REPORT.md`

## Gioi han chua nghiem thu

- Kiem thu tuong tac dung Firebase preview/local mock; chua ghi thu vao tenant Firebase san xuat, gui Zalo that hay in tu may in vat ly. Can nghiem thu cac luong nay tren moi truong cua chu so huu truoc khi phat hanh.
- 10 bo cuc duoc dung theo huong tham chieu, chua duoc doi chieu pixel-perfect voi anh phac thao tren moi loai thiet bi.
- PDF xuat la anh raster dat len trang A4/A5; hoa don dai nhieu trang co the cat qua mot dong san pham o ranh gioi trang. Ban in trinh duyet co CSS tranh ngat dong. Chua kiem chung hoa don nhieu trang tren may in that.
- Anh trang tri WebP duoc tai chi khi mau can den. Cac thumbnail o Cai dat la hinh thu nho CSS, khong phai anh preview chi tiet.
- Bo `tsc` cua repo chi bao phu payroll; cac tep invoice JS/JSX duoc kiem tra bang ESLint, build va test thay vi typecheck TypeScript.
- Cac tep hoa don duoc gom vao dot phat hanh cung nhung thay doi module khac. Ma commit va ket qua deploy can duoc doi chieu voi GitHub Actions va `version.json` cua production.
