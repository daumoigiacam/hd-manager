# Báo cáo Sprint UX - Đơn đặt hàng

Ngày kiểm tra: 01/08/2026

## 1. Phạm vi

Đã kiểm tra trọn luồng tạo đơn đặt hàng thủ công:

1. Chọn khách hàng.
2. Nạp sản phẩm cố định và danh mục sản phẩm bổ sung.
3. Chọn hoặc bỏ chọn sản phẩm.
4. Chuyển sang bước nhập số lượng và thông tin chi tiết.
5. Kiểm tra cơ chế lưu đơn và chống gửi lặp.

Sprint chỉ thay đổi trạng thái trình bày và cơ chế bảo vệ thao tác ở Presentation Layer. Payload, công thức tiền, quy tắc giá, dữ liệu Firebase và nghiệp vụ lưu đơn không thay đổi.

## 2. Nguyên nhân UX cũ khó sử dụng

- Thẻ sản phẩm cố định không có dấu tick hoặc trạng thái đang xử lý rõ ràng.
- Danh mục sản phẩm bổ sung dùng màu đỏ khi được chọn, không đồng nhất với màu Primary của HD Manager.
- Một lần bấm có thể lập tức được theo sau bởi lần bấm thứ hai trước khi React hoàn tất cập nhật. Với hành vi toggle hiện tại, hai lần bấm nhanh làm sản phẩm được chọn rồi bị bỏ chọn, khiến người dùng tưởng app không nhận thao tác.
- Khóa biến thể trước đây so sánh cấu hình thô với dòng đơn đã chuẩn hóa. Khác biệt về đơn vị hoặc thuộc tính có thể làm thẻ không nhận ra dòng vừa thêm và làm suy yếu kiểm tra trùng.
- Danh sách dùng JSX thẻ trực tiếp trong vòng lặp nên nội dung của mọi thẻ được thực thi lại khi trạng thái cha thay đổi.
- Nút lưu đã có khóa bằng state và ref nhưng chưa biểu đạt đầy đủ trạng thái loading cho người dùng.

## 3. Thay đổi đã thực hiện

### Trạng thái selected

- Cả sản phẩm cố định và sản phẩm bổ sung dùng chung `OrderRequestSelectableProductCard`.
- Thẻ đã chọn dùng nền Emerald Green, viền xanh, chữ nổi bật, dấu tick và shadow nhẹ.
- Thẻ có transition 200 ms, `touch-manipulation`, focus ring và vùng bấm đầy đủ.
- Trạng thái truy cập gồm `aria-pressed`, `aria-selected`, `aria-busy`, `aria-label` và `data-selected`.
- Khách hàng đang chọn cũng có viền/nền Emerald và dấu tick.
- Bộ đếm hiển thị số sản phẩm đã chọn hoặc trạng thái đang cập nhật.

### Anti double click

- Mỗi lựa chọn có khóa tương tác độc lập trong 320 ms, bao phủ cửa sổ nhấn đúp phổ biến trên màn hình cảm ứng.
- Khóa được giữ trong `Set` bằng ref nên có hiệu lực ngay trong cùng lượt sự kiện, không phải chờ React render.
- Thẻ đang xử lý được disable và hiển thị spinner.
- Timer và khóa được dọn khi đóng form hoặc unmount, không để rò rỉ timer.
- Nhấn đúp chuột/touch liên tục chỉ thực hiện một lần toggle.

### Duplicate product

- Khóa nhận diện biến thể được lấy từ chính dòng đơn đã chuẩn hóa (`product + thuộc tính + size + đơn vị + giá`).
- Nếu biến thể đã có, hành vi nghiệp vụ hiện tại được giữ nguyên: bấm lại sẽ bỏ dòng đó thay vì tạo dòng trùng.
- Nếu chưa có, app chỉ thay dòng trống hoặc thêm đúng một dòng mới.

### Anti double submit và loading

- Giữ nguyên đồng thời hai lớp bảo vệ `isRequestSubmitting` và `requestSubmittingRef`.
- Nút Lưu bị disable trong lúc xử lý, có `aria-busy`, spinner và chữ `Đang lưu...`.
- Nút Hủy và Tiếp tục cũng bị khóa trong lúc submit để tránh thay đổi form giữa giao dịch.

## 4. Hiệu năng trước và sau

| Hạng mục | Trước | Sau |
|---|---|---|
| Render thân thẻ khi state cha đổi | Tối đa N thẻ/lần cập nhật | Thẻ không đổi được `React.memo` bỏ qua; chỉ thẻ đổi selected/pending render lại |
| Tạo tập ID/khóa đã chọn | Tạo `Set` mới ở mọi render | `useMemo`, chỉ tính lại khi danh sách item đổi |
| Hàm click truyền xuống thẻ | Callback mới theo render cha | Callback ổn định bằng `useCallback` và action ref |
| Phản hồi selected | Không có chỉ báo thống nhất | Đo trong trình duyệt: 42 ms từ click đến `data-selected=true` |
| Nhấp đúp | Có thể toggle hai lần | Kiểm thử `dblclick`: chỉ còn đúng 1 sản phẩm đã chọn |
| Phản hồi lưu | Khóa nội bộ, chỉ báo chưa rõ | Disable + spinner + nội dung loading |

Ghi chú: số render là đánh giá theo topology React sau refactor. Không đưa profiler vào production để tránh tăng chi phí runtime. Phép đo 42 ms được thực hiện trên localhost bằng polling thuộc tính DOM trong lúc Playwright phát click; thời gian Playwright hoàn tất toàn bộ action là 269 ms và không được dùng làm thời gian phản hồi UI.

## 5. Kiểm thử thực tế

- Khách kiểm thử: `Bảo Bến Tre`.
- Danh sách nạp đúng 2 sản phẩm cố định.
- Chọn `Gà Móc Sạch`: thẻ chuyển xanh, có tick, bộ đếm là `1 sản phẩm đã chọn`.
- Nhấn đúp khi chưa chọn: kết quả vẫn chỉ có 1 sản phẩm, không tạo dòng trùng.
- Nhấn đúp khi đang chọn: chỉ bỏ chọn một lần.
- Nút `Tiếp tục` mở đúng bước nhập số lượng; nút `Lưu đơn` có trạng thái sẵn sàng và `aria-busy=false`.
- Đã bấm Hủy, không ghi đơn kiểm thử vào dữ liệu.

## 6. Rà soát các màn hình chọn danh sách khác

| Khu vực | Cơ chế hiện tại | Rủi ro | Khuyến nghị |
|---|---|---|---|
| Báo giá / áp giá hàng loạt | `Set` ID khách và sản phẩm, nút submit có loading | Thấp; chọn lặp chỉ toggle local | Có thể dùng lại thẻ selected chuẩn ở sprint UI chung |
| Xuất kho / báo cáo giao hàng | Chọn theo `customerId`/`dispatchId`, thay thế ID hiện tại | Thấp; không append khi chọn | Giữ logic, bổ sung khóa submit riêng nếu audit nghiệp vụ phát hiện thiếu |
| Nhập kho | Native select/form, không thêm dòng bằng card click nhanh | Thấp | Không cần áp dụng lock thẻ |
| Bản đồ giao hàng | Toggle marker bằng ID, không ghi dữ liệu khi chọn | Thấp | Giữ nguyên để không làm chậm thao tác bản đồ |
| Phân quyền / bàn giao tài sản | Boolean hoặc tập ID | Thấp; phép cập nhật idempotent | Chuẩn hóa selected visual, không cần đổi nghiệp vụ |
| Đối soát công nợ | Chọn khách/phiếu theo ID | Trung bình ở bước xác nhận ghi dữ liệu | Nên audit khóa submit ở sprint đối soát riêng trước khi sửa |

Không áp dụng đại trà khóa 320 ms vào các module trên trong sprint này vì mỗi màn hình có quy tắc toggle/ghi dữ liệu khác nhau. Việc dùng chung khi chưa audit có thể thay đổi hành vi nghiệp vụ. Utility tương tác đã được tách riêng để tái sử dụng an toàn sau khi kiểm tra từng module.

## 7. File thay đổi của Sprint

- `src/App.jsx`: component thẻ selected, trạng thái loading, khóa chọn, khóa lưu và tối ưu memo.
- `src/utils/orderRequestInteraction.js`: utility khóa tương tác theo khóa sản phẩm.
- `tests/order-request-ux.test.mjs`: regression cho double click, duplicate variant, accessibility và double submit.
- `package.json`: thêm script test UX đơn đặt hàng vào `test:all`.

## 8. Kết quả kiểm thử

- `npm run test:order-request-ux`: PASS, 5/5.
- `npm run test:all`: PASS; stress suite PASS 11.309 thao tác.
- `npm run test:product-pricing-units`: PASS.
- `node --check src/utils/orderRequestInteraction.js`: PASS.
- `git diff --check`: PASS (chỉ có cảnh báo chuyển LF/CRLF của Git trên Windows).
- `npm run build`: PASS, Vite 7.3.6, 2.349 module, 9,18 giây ở lần chạy nghiệm thu cuối.

## 9. Xác nhận an toàn

- Không đổi công thức tính số lượng, đơn giá, thành tiền hoặc doanh thu.
- Không đổi quy tắc giá theo khách hàng hoặc đơn vị tính.
- Không đổi payload đơn hàng, cấu trúc Firestore hay API.
- Không tạo, sửa hoặc xóa dữ liệu production trong quá trình kiểm thử.
- Không thay đổi quy trình đặt hàng; chỉ làm trạng thái chọn rõ ràng và ngăn thao tác lặp ngoài ý muốn.
