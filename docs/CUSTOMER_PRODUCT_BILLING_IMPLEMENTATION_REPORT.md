# Báo cáo chuẩn hóa tính tiền theo sản phẩm cố định khách hàng

## Kết luận

Luồng sau đã được chuẩn hóa để dùng cùng một cấu hình và cùng một snapshot tính tiền:

`Sản phẩm cố định khách hàng -> Đơn đặt hàng -> Xuất kho -> Giao hàng -> Báo cáo giao hàng -> Đơn bán hàng/Công nợ`

Nguồn sự thật của giao dịch mới là cấu hình sản phẩm cố định đúng khách hàng, đúng sản phẩm và đúng biến thể. Chứng từ đã lưu luôn ưu tiên snapshot trên chính chứng từ, vì vậy thay đổi giá/cấu hình sau này không làm đổi lịch sử.

Không có migration Firestore, không xóa hoặc sửa hàng loạt dữ liệu cũ, không thay đổi cấu trúc collection và không thực hiện commit/push/deploy.

## Root cause đã xử lý

1. Đơn vị tính trước đây có thể được mở rộng sang toàn bộ đơn vị hệ thống, dù khách chỉ được cấu hình một đơn vị.
2. Đơn đặt hàng, xuất kho và báo cáo giao hàng có các nhánh tính tiền riêng, dễ dẫn đến `actualQuantity * unitPrice` sai khi đơn vị thực tế khác đơn vị tính tiền.
3. Báo cáo có thể tìm lại giá cấu hình hiện tại thay vì dùng giá đã chốt trên chứng từ cũ.
4. Dữ liệu đơn hàng từng có thể ghi ngược giá/đơn vị về cấu hình sản phẩm khách hàng và danh mục sản phẩm.
5. Việc ghép dòng theo tên sản phẩm chưa đủ để phân biệt hai biến thể/size có giá khác nhau.

Chi tiết audit ban đầu nằm tại `docs/CUSTOMER_PRODUCT_BILLING_AUDIT.md`.

## Kiến trúc chung

Service thuần `src/services/customerProductBilling.js` cung cấp:

- `resolveCustomerProductConfiguration`: xác định đúng khách hàng, sản phẩm, configuration/variant, size, thuộc tính, đơn vị tính giá và đơn giá.
- `isCustomerProductUnitAllowed`: chỉ chấp nhận đơn vị thuộc đúng cấu hình.
- `calculateBillableAmount`: tách số lượng thực tế khỏi số lượng tính tiền.
- `buildCustomerProductBillingSnapshot`: tạo snapshot bất biến cho dòng chứng từ.
- `resolveTransactionBillingSnapshot`: đọc snapshot đã chốt trước; chỉ fallback tương thích khi chứng từ cũ chưa có snapshot.

Snapshot chuẩn gồm:

```text
productId
productName
configurationId
sizeLabel
attributeLabel
actualQuantity
actualUnit
actualWeightKg
billingQuantity
billingUnit
unitPrice
amount
```

Các alias cũ như `quantity`, `quantityUnit`, `pricingQuantity`, `pricingUnit`, `lineTotal` và `pricingAmount` vẫn được đọc/ghi để không phá dữ liệu đang dùng.

## Data flow sau thay đổi

1. Khi chọn khách hàng/chi nhánh, app tạo danh sách cấu hình cố định trong bộ nhớ; không query Firestore khi thay đổi số lượng.
2. Người dùng chỉ chọn sản phẩm/biến thể đã cấu hình. Size, thuộc tính, đơn vị tính giá và giá được khóa theo configuration.
3. Đơn đặt hàng lưu snapshot. Nếu tính theo Kg nhưng mới biết số Con, số tiền ở trạng thái chờ cân và không đoán `Con * giá/Kg`.
4. Phiếu xuất kho kế thừa snapshot đơn đặt hàng; nếu tạo ngoài đơn thì resolve đúng cấu hình cố định hiện tại.
5. Báo cáo giao hàng kế thừa snapshot phiếu xuất, chỉ cập nhật số lượng thực giao/cân; không tìm lại giá mới.
6. Đơn bán hàng, chia sẻ hóa đơn, dashboard, phân tích giá và công nợ dùng `amount` đã chốt từ snapshot.

Ví dụ chuẩn: `actualQuantity = 7`, `actualUnit = Con`, `billingQuantity = 20`, `billingUnit = Kg`, `unitPrice = 60.000`, `amount = 1.200.000`.

## Tương thích dữ liệu cũ

- Snapshot mới chỉ được thêm vào chứng từ tạo/sửa sau thay đổi.
- Chứng từ cũ có giá, đơn vị và thành tiền đã lưu được coi là nguồn bất biến.
- Dòng cũ có cả số Con và Kg nhưng thiếu đơn vị tính tiền sẽ resolve theo đúng cấu hình khách/biến thể; không tự suy luận tùy ý.
- Chứng từ cũ thiếu toàn bộ cấu hình dùng fallback duy nhất có thể xác định; không mở dropdown toàn hệ thống.
- Không có script migration và không có thao tác ghi hàng loạt.

## File thay đổi

- `src/services/customerProductBilling.js`: resolver, pricing engine và snapshot chung.
- `src/App.jsx`: áp dụng cấu hình/snapshot vào đơn đặt hàng, cổng khách hàng, xuất kho, giao hàng, báo cáo, hóa đơn, doanh thu và công nợ.
- `src/services/executiveDashboardService.js`: doanh thu và phân tích giá ưu tiên snapshot; tồn kho/giá vốn vẫn dùng số lượng thực tế.
- `src/services/pricingEngineService.js`: doanh thu phân tích giá ưu tiên `amount` snapshot.
- `tests/customer-product-billing.test.mjs`: 16 kịch bản, 40 assertion.
- `package.json`: thêm test mới vào regression suite.
- `docs/CUSTOMER_PRODUCT_BILLING_AUDIT.md`: báo cáo audit/root cause.
- `docs/CUSTOMER_PRODUCT_BILLING_IMPLEMENTATION_REPORT.md`: báo cáo nghiệm thu này.

## Kết quả test bắt buộc

| Trường hợp | Kết quả |
| --- | --- |
| 10 Bộ x 5.000 = 50.000 | PASS |
| Cố đổi Bộ sang Cái bị từ chối | PASS |
| Xuất kho 9 Bộ x 5.000 = 45.000 | PASS |
| 7 Con, tính 20 Kg x 60.000 = 1.200.000 | PASS |
| Báo cáo giao hàng tái sử dụng snapshot xuất kho | PASS |
| Giá đổi 5.000 -> 6.000 không đổi chứng từ cũ | PASS |
| Khách B dùng đúng cấu hình riêng | PASS |
| Fallback cũ chỉ trả một đơn vị xác định | PASS |
| Hai biến thể Xô/Bao không lấy nhầm giá | PASS |
| Biến thể mơ hồ bị chặn rõ ràng | PASS |
| Reload/JSON round-trip giữ giá và số lượng tính tiền | PASS |
| Sản phẩm thiếu giá bị chặn | PASS |
| Khối lượng thập phân 2,5 Kg tính đúng | PASS |
| Dashboard dùng 1.200.000, không dùng 7 x 60.000 | PASS |
| Pricing analytics dùng cùng 1.200.000 | PASS |
| Regression toàn app | PASS |

## Lệnh xác minh

- `npm.cmd run test:customer-product-billing`: PASS, 16 kịch bản/40 assertion.
- `npm.cmd test`: PASS toàn bộ suite.
- Stress suite: PASS, 11.309 thao tác.
- Warehouse dispatch regression: PASS.
- Order request UX: PASS 5/5.
- Delivery reconciliation UX: PASS 6/6.
- Payroll/debt/auth và các suite còn lại: PASS.
- `npm.cmd run build`: PASS, Vite chuyển đổi 2.360 module trong 9,88 giây.
- `git diff --check`: không có lỗi whitespace; chỉ có cảnh báo line-ending LF/CRLF của Git trên Windows.

## Smoke test local

Kiểm tra trực tiếp tại `http://127.0.0.1:5173/?loginDebug=1&perfCheck=1` với phiên đã đăng nhập:

- Mở màn hình Đơn đặt hàng: PASS.
- Chọn khách `Dũng Dầu Tiếng`: PASS; app chỉ hiển thị 3 sản phẩm cố định đã cấu hình của khách.
- Chọn đúng biến thể `Vịt Móc Sạch Cắt Chân`: PASS; card chuyển sang trạng thái `đã chọn`, bị khóa trong thời gian xử lý chống bấm lặp và sau đó hiển thị `1 sản phẩm đã chọn`.
- Chuyển sang bước nhập số lượng: PASS; đơn vị hiển thị `Đơn vị tính giá Kg` dạng chỉ đọc, không có dropdown toàn hệ thống.
- Hủy bản nháp: PASS; không tạo hoặc ghi đơn hàng thử nghiệm.
- Reload sạch: PASS; Dashboard phục hồi và không có console error mới.

Một log HMR cũ của Vite xuất hiện trong lúc file `App.jsx` đang được chỉnh trực tiếp. Sau reload sạch, log này không tái diễn và không phải lỗi runtime production; production build vẫn PASS.

## Xác nhận phạm vi

- Không thay đổi công thức lương, cấu trúc công nợ, Firebase project, Firestore collection, Authentication, SePay hoặc quyền người dùng.
- Không sửa dữ liệu đã tồn tại.
- Không query Firestore theo mỗi lần nhập số lượng.
- Không hard-code tên sản phẩm như Vịt/Gà/Lòng; mọi quy tắc lấy từ cấu hình khách hàng.
- Chưa commit, chưa push và chưa deploy theo yêu cầu.
