# HD Manager Local App

App này được dựng lại từ `code.txt` thành một project React/Vite có thể chạy trực tiếp trong thư mục hiện tại.

## Chạy app

```bash
npm install
npm run dev
```

Sau đó mở `http://127.0.0.1:5173`.

## Tài khoản demo

- Chủ doanh nghiệp: `0909000001`
- Nhân viên kinh doanh: `0909000002`
- Tài xế: `0909000003`

## Những gì đã được làm

- Chuyển mã nguồn một file sang project React/Vite chạy được
- Tạo backend giả lập ngay trong app để thay thế môi trường Firebase cũ
- Lưu dữ liệu cục bộ bằng `localStorage`, nên thêm/sửa/xóa vẫn còn sau khi refresh
- Lưu phiên đăng nhập gần nhất để đỡ phải đăng nhập lại mỗi lần mở app
- Thêm AI fallback nội bộ để khung chat vẫn phản hồi khi chưa có API key
- Thêm script `build` và `preview`

## AI cloud tùy chọn

Nếu muốn nối khóa Gemini cho khung chat, tạo file `.env.local`:

```bash
VITE_GEMINI_API_KEY=your_key_here
```

## Ghi chú

- Dữ liệu demo hiện nằm trong `src/mocks/seed-data.js`
- Nguồn giao diện chính hiện ở `src/App.jsx`
- Nếu muốn reset dữ liệu demo, hãy xóa `localStorage` của site `127.0.0.1`
