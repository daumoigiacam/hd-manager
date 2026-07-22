# HD Manager Full Application Audit - Sprint 1

Ngay kiem toan: 2026-07-22  
Pham vi: React + Vite + Capacitor + Electron + Firebase/Firestore + Firebase Functions  
Nguyen tac Sprint 1: chi audit, khong sua source runtime, khong thay doi nghiep vu, khong thay doi du lieu.

> Ghi chu cong nghe: yeu cau co nhac `flutter analyze`, `dart analyze`, `Widget rebuild`, `ListView`, `Sliver`. Repository hien tai la React/Vite/Capacitor/Electron, khong phai Flutter. Cac hang muc do duoc audit tuong duong theo React render, DOM/WebView, list rendering, effect/subscription/timer va native WebView.

## 1. Ket qua tong quan

| Hang muc | Ket qua |
| --- | --- |
| Build production | PASS |
| Lenh build | `npm run build` |
| Thoi gian build | 34.36s |
| So module transform | 2081 |
| Main JS bundle | `dist/assets/index-ZFoNzhsk.js` - 2,047.62 kB, gzip 525.92 kB |
| CSS bundle | `dist/assets/index-C5rJx9aj.css` - 1,220.14 kB, gzip 111.13 kB |
| File runtime lon nhat | `src/App.jsx` - 70,784 dong, ~3.95 MB |
| So `useEffect` trong `App.jsx` | 163 |
| So `useMemo` trong `App.jsx` | 626 |
| So `useCallback` trong `App.jsx` | 27 |
| So `setInterval` trong `App.jsx` | 10 |
| So `setTimeout` trong `App.jsx` | 52 |
| So `addEventListener` trong `App.jsx` | 32 |
| So `console.*` trong `App.jsx` | 82 |
| So `alert()` trong `App.jsx` | 11 |

## 2. Cac file/module nong

| File | Kich thuoc/Do phuc tap | Nhan dinh |
| --- | --- | --- |
| `src/App.jsx` | 70,784 dong, ~3.95 MB | Qua nhieu module nghiep vu, state, effect, timer, realtime listener va UI cung nam trong mot file/root. Day la nguy co lon nhat gay lag, memory pressure, crash WebView va kho debug. |
| `src/services/executiveDashboardService.js` | ~108 KB | Gom nhieu phep tinh tong hop, salary, dashboard, analytics. Can cache selector va test cong thuc rieng. |
| `functions/index.js` | ~93 KB | Webhook, payment, notification va background logic tap trung. Can dam bao webhook tra 200 nhanh va tac vu phu chay nen. |
| `src/services/performanceMonitor.js` | ~16 KB | Da co monitor tot, nhung neu bat bang `?perfCheck=1` tren thiet bi yeu se them overhead vi patch fetch/history, FPS loop va memory interval. |
| `src/main.jsx` | ~21 KB | Global error boundary, viewport vars, performance bootstrap. Co observer sua text neu bat flag; can dam bao khong bat trong production dai han. |

## 3. Findings theo muc do uu tien

### Critical

#### C-01 - Root component qua lon va qua nhieu state/effect trong mot render tree

- File: `src/App.jsx:1`
- Bang chung: `App.jsx` co 70,784 dong, 163 `useEffect`, 10 `setInterval`, 52 `setTimeout`, 32 `addEventListener`.
- Nguyen nhan: Nhieu man hinh lon nhu xuat kho, don dat, don hang, khach hang, bang luong, danh gia, ban do, thanh toan cung nam trong mot file va chia se nhieu state o root.
- Anh huong: parse/evaluate JS cham, WebView ton RAM, bat ky state update lon nao cung co nguy co lam re-render nhieu vung UI; tren may RAM yeu co the bi ANR/tu thoat.
- Huong xu ly: Sprint `fix/crash-stability` chi cat cac listener/timer ro ri va crash truoc; Sprint `perf/rendering` moi tach lazy screen/code splitting/selector cache. Khong doi logic nghiep vu.
- Uu tien: P0.

#### C-02 - Firestore realtime dang dong bo nhieu collection vao root, de gay burst update va recover loop

- File: `src/App.jsx:11442`
- Bang chung: `startCollectionListener` tao `onSnapshot` theo collection; danh sach priority web/native gom rat nhieu collection: customers, customer_accounts, customer_points, products, orders, orderRequests, warehouseImports, warehouseDispatches, deliveryReports, payments, expenses, bankAccounts, bankTransactions, notifications, messages, attendance, assets, advances, pricing...
- Nguyen nhan: Realtime listener doc toan bo collection va day vao state root. Khi Firestore recover/cache empty/update hang loat, UI co the bi giat va xuat hien thong bao recover.
- Anh huong: tang Firestore reads, tang CPU do parse docs/map docs, tang render storm, co lien quan den cac loi nguoi dung da thay: Firestore internal assertion/realtime recover thong bao.
- Huong xu ly: them subscribe manager co debounce/batch update; chi realtime cac collection can thiet theo man hinh; pagination/lazy listener; giu cache cu khi snapshot cache rong; log read count.
- Uu tien: P0.

#### C-03 - Cac interval/worker polling co the tiep tuc chay va lam CPU cao tren may yeu

- File: `src/App.jsx:22197`, `src/App.jsx:22234`, `src/App.jsx:23643`, `src/App.jsx:23661`, `src/App.jsx:23702`, `src/App.jsx:23786`, `src/App.jsx:30862`, `src/App.jsx:41973`
- Bang chung: Zalo dispatcher heartbeat 20s, queue polling 2s/5s, inbox bridge polling, scanner timeout 450ms, fallback intervals.
- Nguyen nhan: Cac luong nen nam trong UI process. Neu man hinh/role khong can nhung dependency thay doi lien tuc, effect co the restart nhieu lan.
- Anh huong: CPU wakeup cao, battery drain, WebView bi treo khi cung luc render list/canvas/Firestore sync.
- Huong xu ly: gate theo role/man hinh/native availability; pause khi document hidden; dung AbortController/cancel token; gom heartbeat/polling vao service rieng.
- Uu tien: P0.

#### C-04 - UI blocking dialog `alert()` van ton tai trong nhieu flow quan trong

- File: `src/App.jsx:43801`, `src/App.jsx:43882`, `src/App.jsx:43896`, `src/App.jsx:59306`, `src/App.jsx:59317`, `src/App.jsx:59328`, `src/App.jsx:59349`, `src/App.jsx:61665`, `src/App.jsx:63926`, `src/App.jsx:70951`, `src/App.jsx:70999`
- Bang chung: 11 vi tri goi `alert()`/`window.alert()`.
- Nguyen nhan: Mot so thong bao/tinh huong loi dung modal native cua browser/WebView.
- Anh huong: chan UI thread, gay cam giac app dung hinh; tren desktop/phone co the hien popup kho hieu nhu nguoi dung da bao.
- Huong xu ly: thay bang toast/banner non-blocking co auto-dismiss va hanh dong tiep theo; log loi van giu nguyen.
- Uu tien: P0.

### High

#### H-01 - Chia se hoa don/QR/bang bao cao tao anh tren main thread

- File: `src/App.jsx:3185`, `src/App.jsx:4916`, `src/App.jsx:52382`, `src/App.jsx:55451`, `src/App.jsx:58740`
- Bang chung: dynamic QRCode, canvas/html-to-image/share image generation.
- Nguyen nhan: Tao QR, render DOM/canvas, convert blob/dataURL co the nang va chay trong UI thread.
- Anh huong: bam chia se bi cham, cuon/nhap bi dung, tren WebView yeu co the crash vi memory spike.
- Huong xu ly: tao QR bang payload EMV offline nhe; pre-measure; dung queue 1 lan, cancel duplicate click, `requestIdleCallback`/worker khi co the; giai phong canvas/object URL sau share.
- Uu tien: P1.

#### H-02 - Performance monitor co the tao overhead neu bat bang query/localStorage

- File: `src/services/performanceMonitor.js:68`, `src/main.jsx:6`
- Bang chung: monitor bat khi URL co `?perfMonitor`, `?perfCheck`, env hoac localStorage; hien browser dang dung `?perfCheck=1`.
- Nguyen nhan: Khi bat, monitor patch fetch/history, tao FPS RAF loop, memory interval, PerformanceObserver va global error listeners.
- Anh huong: dung de audit nhung khong nen bat mac dinh cho khach hang/thiet bi yeu; co the lam phep do bi anh huong boi chinh monitor.
- Huong xu ly: dam bao build release khong co query/flag/localStorage monitor; them nut tat nhanh va clear flag khi dong audit.
- Uu tien: P1.

#### H-03 - Danh sach lon chua co bang chung virtualization/pagination day du

- File: `src/App.jsx:49759`, `src/App.jsx:53449`, `src/App.jsx:57492`, `src/App.jsx:62302`, `src/App.jsx:70655`
- Bang chung: cac view lon nhu xuat kho, don dat, don hang, khach hang, so no nam trong `App.jsx`; du lieu co the len hang nghin khach/don/giao dich.
- Nguyen nhan: Render danh sach/summary truc tiep trong React co nguy co map toan bo item, filter/sort trong render.
- Anh huong: scroll lag, FPS thap, memory tang khi co nhieu khach/don/notification.
- Huong xu ly: virtualized list/windowing cho web, pagination theo ngay/thang, memo selector theo company/date/role, debounce search.
- Uu tien: P1.

#### H-04 - Map/camera/scanner/location la nhom de ton CPU pin va crash WebView

- File: `src/App.jsx:7540`, `src/App.jsx:30078`, `src/App.jsx:30793`, `src/App.jsx:41878`
- Bang chung: Geolocation, map event listener, ZXing scanner va camera/location flow.
- Nguyen nhan: Native permission + camera decode + map marker render co the cung chay voi realtime/list rendering.
- Anh huong: may cu de bi treo, nong may, crash hoac bi he dieu hanh tat app.
- Huong xu ly: pause camera/map/location khi khong o man hinh; remove listener bang reference on cleanup; throttle GPS; chi render marker trong viewport.
- Uu tien: P1.

#### H-05 - Guided next-step feature van ton tai va co the lam nang flow neu hien qua nhieu

- File: `src/App.jsx:19483`, `src/App.jsx:19505`, `src/App.jsx:19525`
- Bang chung: `renderMissingSalesSetupGuide` duoc dung cho cac flow thieu du lieu.
- Nguyen nhan: Huong dan thao tac huu ich nhung neu tinh toan/hien thi o nhieu man hinh co the tang DOM va state.
- Anh huong: nguoi dung da phan hoi tu khi them chuc nang tu huong dan thi app nang/lag hon.
- Huong xu ly: trong Sprint rieng, bien thanh lightweight empty-state component, lazy mount, khong tinh toan khi khong can; khong xoa chuc nang neu chua xac nhan.
- Uu tien: P1.

### Medium

#### M-01 - Debug/log production con nhieu

- File: `src/App.jsx` nhieu dong `console.*`; `functions/index.js`
- Bang chung: 82 `console.*` trong `App.jsx`.
- Anh huong: console/log tren WebView va function co the lam cham, lo du lieu neu log payload.
- Huong xu ly: tao logger production-gated; giu error critical, bo/chan debug verbose.
- Uu tien: P2.

#### M-02 - AppErrorBoundary va text repair can duoc lam sach

- File: `src/main.jsx`
- Bang chung: Error boundary co cac chuoi fallback da tung bi loi ma hoa; visible text repair observer chi bat theo flag/localStorage.
- Anh huong: khi crash, nguoi dung co the thay thong bao khong chuan hoac observer lam ton CPU neu bat.
- Huong xu ly: sua encoding tai source, bo can thiep DOM production neu khong can.
- Uu tien: P2.

#### M-03 - Repository con nhieu artifact/build/temp co the lam packaging/deploy cham

- File/folder: `dist`, `dist-packages`, `release`, `exports`, `source-archives`, `temp-restore-unzip`, `_recovered-source-*`, nhieu APK/AAB/EXE cu.
- Anh huong: tang thoi gian scan, de nham file build, rui ro dong goi nham artifact cu.
- Huong xu ly: khong xoa trong Sprint audit; sau do dua vao `.gitignore`/release folder chuan va quy uoc version.
- Uu tien: P2.

#### M-04 - Chua co lint/analyze chuan bat buoc trong `package.json`

- File: `package.json`
- Bang chung: co build/test/stress nhung chua thay script lint/analyze React/ESLint chuan.
- Anh huong: import du, dead code, dependency sai chi lo khi build/runtime.
- Huong xu ly: them ESLint/knip hoac ts-prune tuong duong trong Sprint `refactor/clean-code`, khong doi UI/nghiep vu.
- Uu tien: P2.

### Low

#### L-01 - Dependency nang can dam bao chi lazy load khi can

- File: `package.json`, `src/App.jsx:3185`
- Bang chung: `tesseract.js`, `@zxing/browser`, `html-to-image`, `jspdf`, `qrcode`, Firebase SDK.
- Anh huong: neu import sync vao main bundle se tang startup/RAM.
- Huong xu ly: kiem tra bundle analyzer va dynamic import cho OCR/scanner/export/share.
- Uu tien: P3.

#### L-02 - Cac test stress da co nhung can tich hop vao pipeline nghiem thu

- File: `tests/hd-manager-stress-suite.mjs`, `tests/hd-manager-big-stress-suite.mjs`, `tests/hd-manager-kpi-suite.mjs`
- Anh huong: neu khong chay dinh ky thi regression ve lag/crash kho phat hien truoc build.
- Huong xu ly: them job CI rieng hoac nightly; khong chay tren moi push neu qua nang.
- Uu tien: P3.

## 4. Root cause kha nang cao cua lag/crash/tu thoat

1. `src/App.jsx` qua lon va gom qua nhieu UI/state/effect trong mot root, gay JS parse/evaluate va render pressure cao.
2. Firestore realtime doc nhieu collection vao root, co the tao burst state updates khi dong bo/recover.
3. Nhieu background interval/polling/heartbeat/scanner/location cung chay trong WebView.
4. Canvas/QR/share image generation chay tren main thread gay memory spike.
5. Cac popup `alert()` chan UI thread, lam nguoi dung tuong app bi dung.
6. Neu `?perfCheck=1` hoac localStorage monitor con bat tren production/mobile, ban than monitor se lam tang CPU/RAM.

## 5. De xuat chia Sprint/commit rieng

### Sprint 2 - `fix/crash-stability`

- Thay `alert()` bang non-blocking app toast/modal co auto-dismiss.
- Gate/tat performance monitor neu khong phai debug; them cach clear flag.
- Dam bao moi interval/listener/scanner/location/map co cleanup ro rang va pause khi hidden/unmount.
- Bao ve QR/share/canvas bang single-flight + timeout + release resource.
- Them global error handling gọn, khong crash UI khi icon/function undefined.

### Sprint 3 - `fix/high-risk-realtime`

- Batch/debounce Firestore state updates.
- Lazy subscribe theo role/man hinh/date.
- Giam collection realtime khong can thiet tren mobile.
- Them instrumentation dem Firestore reads va snapshot size.

### Sprint 4 - `perf/rendering`

- Tach cac screen lon ra lazy chunks.
- Memo selector theo company/date/role.
- Virtualized/paginated list cho khach hang, don hang, don dat, xuat kho, so no, notification.
- Debounce search/filter.
- Doi cac phep sort/filter nang ra memoized derived data.

### Sprint 5 - `refactor/clean-code`

- Tach service/repository theo module.
- Tach UI components nho, memo hoa co kiem soat.
- Them lint/static audit cho import du, dead code, circular dependency.

### Sprint 6 - `build/production`

- Bundle analyzer.
- Tach vendor nang OCR/scanner/export.
- Giam CSS bundle neu co class du.
- Kiem tra Android WebView memory va APK/AAB size.

## 6. Build/static verification

Lenh da chay:

```bash
npm run build
```

Ket qua:

```text
vite v7.3.6 building client environment for production...
✓ 2081 modules transformed.
dist/index.html                              1.38 kB │ gzip:   0.63 kB
dist/assets/index-C5rJx9aj.css           1,220.14 kB │ gzip: 111.13 kB
dist/assets/vendor-icons-poDkXaUy.js        17.11 kB │ gzip:   6.26 kB
dist/assets/vendor-qrcode-BimE3RnI.js       24.61 kB │ gzip:   9.64 kB
dist/assets/vendor-mm0EJI2u.js             407.39 kB │ gzip: 128.59 kB
dist/assets/vendor-firebase-BRRD0sZp.js    417.29 kB │ gzip: 124.25 kB
dist/assets/vendor-tools-Bn1CrqcO.js       494.82 kB │ gzip: 126.87 kB
dist/assets/index-ZFoNzhsk.js            2,047.62 kB │ gzip: 525.92 kB
✓ built in 34.36s
```

## 7. Nhung viec chua lam trong Sprint 1

- Chua sua runtime code.
- Chua refactor.
- Chua xoa file rac.
- Chua thay doi package/dependency.
- Chua thay doi Firebase/Firestore/Auth/SePay.
- Chua tao APK/EXE/AAB.

Ly do: Sprint 1 theo yeu cau la audit-only de tranh vua kiem tra vua sua lam kho truy vet.

## 8. Ket luan Sprint 1

Build hien tai PASS, nhung nguy co lag/crash lon nhat nam o kien truc runtime: `App.jsx` qua lon, realtime Firestore qua rong, nhieu timer/listener/polling, va cac tac vu nang nhu QR/share/camera/map chay tren UI thread. Cac buoc tiep theo nen xu ly theo dung thu tu: crash-stability truoc, sau do moi toi render/performance/refactor/build production.
