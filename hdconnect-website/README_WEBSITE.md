# HD CONNECT Website

Website tĩnh chính thức cho HD CONNECT/HD Manager, có thể upload trực tiếp lên Hosting TH-2/cPanel. Source nằm riêng trong thư mục `hdconnect-website` để không ảnh hưởng mã nguồn, database hoặc package Android của ứng dụng HD Manager.

## Cấu trúc thư mục

- `index.html`: Trang chủ.
- `gioi-thieu.html`: Trang giới thiệu.
- `tinh-nang.html`: Trang tính năng.
- `bang-gia.html`: Trang bảng giá.
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

Sau khi upload, kiểm tra các URL trên bằng HTTPS trước khi khai báo trong Play Console.

## Hướng dẫn upload lên cPanel

1. Mở cPanel của hosting TH-2 và vào `File Manager`.
2. Vào thư mục domain chính, thường là `public_html`.
3. Upload toàn bộ nội dung bên trong thư mục `hdconnect-website` vào `public_html`.
4. Sau khi upload, `index.html`, `.htaccess`, `robots.txt`, `sitemap.xml` và thư mục `assets` phải nằm trực tiếp trong `public_html`.
5. Bật SSL/AutoSSL cho `hdconnect.net` trong cPanel.
6. Truy cập `https://hdconnect.net/`, `https://hdconnect.net/robots.txt` và `https://hdconnect.net/sitemap.xml` để kiểm tra.

## Cập nhật nội dung

- Mở file `.html` tương ứng và sửa phần chữ trong thẻ nội dung.
- Khi đổi số điện thoại, email, Zalo hoặc Facebook, tìm các chuỗi `hotro.hdconnect@gmail.com`, `0978194836`, `zalo.me/0978194836`, `facebook.com/hdconnect`.
- Khi bảng giá chính thức có dữ liệu, sửa `bang-gia.html`, thay trạng thái `Sắp cập nhật` và giá trong từng `plan-card`.
- Khi app phát hành, sửa `tai-ung-dung.html`, đổi các nút `button disabled` thành thẻ `a` trỏ đến APK, Google Play hoặc App Store. Không tạo URL Google Play giả.

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
