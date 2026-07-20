# HD CONNECT Website

Website tĩnh chính thức cho HD CONNECT, có thể upload trực tiếp lên Hosting TH-2/cPanel. Source nằm riêng trong thư mục `hdconnect-website` để không ảnh hưởng mã nguồn hoặc dữ liệu của ứng dụng HD Manager.

## Cấu trúc thư mục

- `index.html`: Trang chủ.
- `gioi-thieu.html`: Trang giới thiệu.
- `tinh-nang.html`: Trang tính năng.
- `bang-gia.html`: Trang bảng giá.
- `ho-tro.html`: Trung tâm hỗ trợ.
- `lien-he.html`: Trang liên hệ và form email tĩnh.
- `chinh-sach-bao-mat.html`: Chính sách bảo mật cho Google Play.
- `dieu-khoan-su-dung.html`: Điều khoản sử dụng.
- `xoa-du-lieu.html`: Hướng dẫn xóa tài khoản và dữ liệu.
- `tai-ung-dung.html`: Trang tải ứng dụng.
- `assets/css/styles.css`: Toàn bộ giao diện, responsive, màu thương hiệu.
- `assets/js/main.js`: Menu mobile, animation nhẹ và form liên hệ tĩnh.
- `assets/img/`: Favicon, logo, ảnh Open Graph và dashboard placeholder.
- `robots.txt`, `sitemap.xml`: SEO crawler.
- `.htaccess`: HTTPS, bảo mật và cache cho cPanel/Apache.

## Hướng dẫn upload lên cPanel

1. Mở cPanel của hosting TH-2 và vào `File Manager`.
2. Vào thư mục domain chính, thường là `public_html`.
3. Upload toàn bộ nội dung bên trong thư mục `hdconnect-website` vào `public_html`.
4. Sau khi upload, `index.html`, `.htaccess`, `robots.txt`, `sitemap.xml` và thư mục `assets` phải nằm trực tiếp trong `public_html`.
5. Bật SSL/AutoSSL cho `hdconnect.net` trong cPanel.
6. Truy cập `https://hdconnect.net/`, `https://hdconnect.net/robots.txt` và `https://hdconnect.net/sitemap.xml` để kiểm tra.
7. Dùng URL chính sách cho Google Play:
   - Chính sách bảo mật: `https://hdconnect.net/chinh-sach-bao-mat.html`
   - Xóa dữ liệu: `https://hdconnect.net/xoa-du-lieu.html`
   - Điều khoản sử dụng: `https://hdconnect.net/dieu-khoan-su-dung.html`

## Cập nhật nội dung

- Mở file `.html` tương ứng và sửa phần chữ trong thẻ nội dung.
- Khi đổi số điện thoại, email, Zalo hoặc Facebook, tìm toàn bộ các chuỗi `support@hdconnect.net`, `0900 000 000`, `0900000000`, `facebook.com/hdconnect`.
- Khi bảng giá chính thức có dữ liệu, sửa `bang-gia.html`, thay trạng thái `Sắp cập nhật` và giá trong từng `plan-card`.
- Khi app phát hành, sửa `tai-ung-dung.html`, đổi các nút `button disabled` thành thẻ `a` trỏ đến APK, Google Play hoặc App Store.

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

- Không đưa API key, token, secret hoặc thông tin đăng nhập vào HTML, CSS, JS.
- Form liên hệ hiện là form tĩnh mở email, không cần backend và không lưu dữ liệu trên website.
- Nếu sau này cần form gửi về server, hãy dùng backend riêng và cấu hình secret trong môi trường server, không hardcode vào website.
- `.htaccess` đã thêm HTTPS redirect, tắt directory listing, header bảo mật và cache tĩnh. Nếu hosting không hỗ trợ một directive nào đó, có thể comment riêng directive gây lỗi.

## Kiểm tra trước khi công bố

- Mở đủ các trang trên desktop và mobile.
- Kiểm tra các link footer, chính sách, xóa dữ liệu và tải ứng dụng.
- Chạy công cụ SEO để xác nhận title, description, canonical, Open Graph.
- Gửi `sitemap.xml` lên Google Search Console sau khi DNS/SSL ổn định.
