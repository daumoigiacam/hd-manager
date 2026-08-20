# HD CONNECT Website

Website tĩnh chính thức cho HD CONNECT/HD Manager, có thể upload trực tiếp lên Hosting TH-2/cPanel. Source nằm riêng trong thư mục `hdconnect-website` để không ảnh hưởng mã nguồn, database hoặc package Android của ứng dụng HD Manager. Website release hiện chỉ là public frontend; không deploy backend, database migration hoặc payment production trong gói này.

## Cấu trúc thư mục

- `index.html`: Trang chủ.
- `apps.html`: Catalog ứng dụng, fallback chỉ có HD Manager.
- `app-detail.html`: Chi tiết ứng dụng theo `?slug=`; sản phẩm và plan lấy từ backend khi có API.
- `gioi-thieu.html`: Trang giới thiệu.
- `tinh-nang.html`: Trang tính năng.
- `bang-gia.html`: Trang bảng giá.
- `checkout.html`: Checkout public, lấy catalog và gửi dữ liệu customer tới backend commerce.
- `payment.html`: Trang QR payment, polling trạng thái backend và nút sao chép mã/số tiền.
- `success.html`: Trạng thái sau checkout, hiện thông báo `MOCK_DISABLED` khi payment tắt.
- `account.html`: Customer portal foundation cho orders, invoices, subscriptions và profile; không dựng dữ liệu giả.
- `payment-policy.html`, `refund-policy.html`: Chính sách commerce ở trạng thái dự thảo chờ phê duyệt.
- `ho-tro.html`: Trung tâm hỗ trợ HD Manager.
- `lien-he.html`: Trang liên hệ HD Manager Support và form email tĩnh.
- `chinh-sach-bao-mat.html`: Chính sách quyền riêng tư cho Google Play.
- `xoa-tai-khoan.html`: URL công khai để yêu cầu xóa tài khoản/dữ liệu.
- `xoa-du-lieu.html`: Trang tương thích cho liên kết cũ, trỏ về `xoa-tai-khoan.html`.
- `dieu-khoan-su-dung.html`: Điều khoản sử dụng.
- `tai-ung-dung.html`: Trang tải ứng dụng, hiện giữ trạng thái sắp phát hành.
- `assets/css/styles.css`: Giao diện, responsive, màu thương hiệu.
- `assets/js/main.js`: Menu mobile, animation nhẹ và form liên hệ tĩnh.
- `assets/img/`: Favicon, logo, ảnh Open Graph và dashboard placeholder.
- `robots.txt`, `sitemap.xml`: SEO crawler.
- `.htaccess`: HTTPS, bảo mật và cache cho cPanel/Apache.
- `package.json`: Chỉ dùng cho build validator local, website runtime không cần Node.js.

## Clean routes

Apache rewrite trong `.htaccess` hỗ trợ các URL public:

- `/`, `/apps`, `/apps/hd-manager`, `/pricing`, `/support`.
- `/checkout`, `/checkout/payment`, `/checkout/success`.
- `/account`, `/account/orders`, `/account/invoices`, `/account/subscriptions`, `/account/profile`.
- `/terms`, `/privacy`, `/payment-policy`, `/refund-policy`.

Các file `.html` cũ vẫn được giữ để tương thích link Google Play và link legacy.
Mỗi HTML page dùng `<base href="/">` để asset và navigation không bị resolve sai khi Apache phục vụ clean route như `/apps` hoặc `/apps/hd-manager`.

## Release configuration

- `assets/js/site-config.js` là public configuration, không chứa secret.
- `PAYMENTS_ENABLED=false`.
- `paymentMode=MOCK_DISABLED`.
- Chưa kết nối SePay production, ngân hàng thật hoặc auto subscription.
- Catalog, giá, VAT, order và trạng thái subscription phải do backend làm source of truth khi mở production.
- Account, invoice, subscription và affiliate hiện chỉ là foundation UI/contract, không giả lập dữ liệu hoặc security state.

## Thông tin hỗ trợ chính thức

- Email hỗ trợ/quyền riêng tư: `hotro.hdconnect@gmail.com`
- Điện thoại hỗ trợ: `0978194836`
- Địa chỉ: `xã Bàu Bàng, Hồ Chí Minh`
- Zalo: `https://zalo.me/0978194836`

Không dùng email hỗ trợ cũ của domain `hdconnect.net` làm thông tin hỗ trợ công khai cho HD Manager nếu chưa có quyết định riêng.

## URL dùng cho Google Play Console

- Privacy Policy: `https://hdconnect.net/chinh-sach-bao-mat.html`
- Account deletion / Data deletion: `https://hdconnect.net/xoa-tai-khoan.html`
- Support contact: `https://hdconnect.net/lien-he.html`
- Help center: `https://hdconnect.net/ho-tro.html`

Các URL sạch tương ứng là `/privacy`, `/support`; có thể dùng sau khi xác nhận rewrite trên hosting.

Sau khi upload, kiểm tra các URL trên bằng HTTPS trước khi khai báo trong Play Console.

## Hướng dẫn upload lên cPanel

1. Chạy `npm run build --prefix hdconnect-website` ở thư mục project root.
2. Mở cPanel của hosting TH-2 và vào `File Manager`.
3. Vào thư mục domain chính, thường là `public_html`.
4. Upload toàn bộ nội dung bên trong `hdconnect-website-dist` vào `public_html`, bật tùy chọn hiển thị file ẩn để giữ `.htaccess`.
5. Sau khi upload, `index.html`, `.htaccess`, `robots.txt`, `sitemap.xml` và thư mục `assets` phải nằm trực tiếp trong `public_html`.
6. Bật SSL/AutoSSL cho `hdconnect.net` trong cPanel.
7. Kiểm tra `https://hdconnect.net/`, `https://hdconnect.net/apps`, `https://hdconnect.net/robots.txt` và `https://hdconnect.net/sitemap.xml`.

Không upload `hd-connect-platform`, thư mục `src`, `.env`, Firebase config, database dump hoặc các package ứng dụng vào `public_html`.

## Cập nhật nội dung

- Mở file `.html` tương ứng và sửa phần chữ trong thẻ nội dung.
- Khi đổi số điện thoại, email, Zalo hoặc Facebook, tìm các chuỗi `hotro.hdconnect@gmail.com`, `0978194836`, `zalo.me/0978194836`, `facebook.com/hdconnect`.
- `apps.html` và `bang-gia.html` gọi catalog public cùng origin khi API sẵn sàng; nếu chưa có API, trang giữ fallback an toàn.
- `app-detail.html` lấy app/plan theo slug từ backend; không hardcode giá.
- `checkout.html` chỉ gửi `productId` và `planId` cùng hồ sơ khách hàng. Giá, VAT và chu kỳ phải được backend tính lại.
- `payment.html` chỉ gọi payment intent/polling khi `PAYMENTS_ENABLED=true`; bản release này không gọi payment production.
- `account.html` chỉ hiển thị foundation/empty states nếu chưa có authenticated account API.
- Nếu API nằm ở host khác, cập nhật `data-api-base` trên các phần tử `data-commerce-catalog`, `data-checkout-form` và `data-payment-root` thành origin HTTPS của API. Không đặt token, secret SePay hoặc thông tin khóa trong HTML/JavaScript.
- Backend commerce nằm ở `../hd-connect-platform/src/platform/commerce-billing`; migration chỉ dành cho staging review tại `../hd-connect-platform/prisma/migrations/20260820100000_commerce_billing_core`.
- Khi app phát hành, sửa `tai-ung-dung.html`, đổi các nút `button disabled` thành thẻ `a` trỏ đến APK, Google Play hoặc App Store. Không tạo URL Google Play giả.

## Build và kiểm tra

Build là bản copy tĩnh có kiểm tra required files, broken local references, localhost/loopback, development endpoint và một số pattern secret. Không cần `npm install`, Node.js chỉ cần ở máy build; hosting chỉ cần Apache/HTTPS.

```powershell
npm run build --prefix hdconnect-website
```

Artifact deploy được tạo tại `hdconnect-website-dist`. File `BUILD-INFO.txt` ghi rõ `PAYMENTS_ENABLED=false` và `PAYMENT_MODE=MOCK_DISABLED`.

## Thay logo

- Logo dạng file nằm tại `assets/img/logo.svg`.
- Favicon nằm tại `assets/img/favicon.svg`.
- Header/footer hiện dùng logo chữ bằng HTML/CSS để tải nhanh. Có thể thay bằng ảnh logo nếu muốn bằng cách sửa khối `<a class="brand">` trong các file HTML.
- Sau khi thay logo, nên cập nhật thêm `assets/img/og-image.png` để ảnh chia sẻ Facebook/Zalo đồng bộ.

## Thay banner hoặc dashboard

- Ảnh minh họa dashboard trên trang chủ nằm tại `assets/img/dashboard-placeholder.svg`.
- Thay file này bằng ảnh thật của HD Manager khi có screenshot chính thức.
- Nếu dùng ảnh PNG/JPG, cập nhật đường dẫn trong `index.html` tại thẻ `<img src="assets/img/dashboard-placeholder.svg">`.
- Luôn cập nhật `alt`, `width` và `height` để SEO và Core Web Vitals tốt hơn.

## Đổi màu thương hiệu

Mở `assets/css/styles.css` và sửa các biến trong `:root`:

- `--brand`: màu xanh chính.
- `--brand-strong`: màu xanh đậm.
- `--brand-soft`: nền xanh nhạt.
- `--teal`, `--green`, `--amber`: màu phụ.
- `--ink`, `--muted`, `--line`: màu chữ và đường viền.

Sau khi đổi màu, kiểm tra lại độ tương phản chữ trên nền xanh và nền trắng.

## Thêm trang mới

1. Sao chép một trang gần giống, ví dụ `gioi-thieu.html`.
2. Đổi `title`, `meta description`, `meta keywords`, Open Graph, Twitter Card, canonical URL và JSON-LD.
3. Đổi nội dung trong `<main>`.
4. Thêm link trang mới vào header/footer nếu cần.
5. Thêm URL mới vào `sitemap.xml`.
6. Kiểm tra link bằng local preview hoặc sau khi upload lên hosting.

## Bảo mật và vận hành

- Không đưa API key, token, secret, private key, keystore, Google Play upload key hoặc thông tin đăng nhập vào HTML, CSS, JS.
- Form liên hệ hiện là form tĩnh mở email, không cần backend và không lưu dữ liệu trên website.
- Nếu sau này cần form gửi về server, hãy dùng backend riêng và cấu hình secret trong môi trường server, không hardcode vào website.
- `.htaccess` đã thêm HTTPS redirect, tắt directory listing, header bảo mật và cache tĩnh. Nếu hosting không hỗ trợ một directive nào đó, có thể comment riêng directive gây lỗi.

## Kiểm tra trước khi công bố

- Mở đủ các trang trên desktop và mobile.
- Kiểm tra các link footer, Privacy Policy, xóa tài khoản và tải ứng dụng.
- Chạy công cụ SEO để xác nhận title, description, canonical, Open Graph.
- Gửi `sitemap.xml` lên Google Search Console sau khi DNS/SSL ổn định.
- Trong Play Console, khai báo Privacy Policy và Account deletion URL chính xác như mục URL bên trên.

## Tài liệu bàn giao

- `../WEBSITE-RELEASE-CHECKLIST.md`: checklist release và các gate trước payment production.
- `../WEBSITE-DEPLOYMENT-GUIDE.md`: hướng dẫn build, upload cPanel, smoke test và rollback.
- `../WEBSITE-FINAL-RELEASE-AUDIT.md`: kết quả audit cuối và giới hạn release.
