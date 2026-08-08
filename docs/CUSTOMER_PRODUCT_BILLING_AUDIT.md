# Customer Fixed Product Billing Audit

## Phạm vi

Luồng được kiểm tra:

`Khách hàng / Sản phẩm cố định -> Đơn đặt hàng -> Xuất kho -> Giao hàng -> Báo cáo giao hàng -> Công nợ`

Không thay đổi dữ liệu Firestore hiện có. Các trường snapshot mới phải có tính cộng thêm và giữ khả năng đọc chứng từ cũ.

## Nguồn dữ liệu hiện tại

- Sản phẩm cố định của khách được xác định bởi `customerProductIds`, `quotedProductIds`, `priceOverrides` hoặc `customPrices`.
- Cấu hình giá, size, thuộc tính, đơn vị tính giá và biến thể được chuẩn hóa trong `normalizeCustomerPriceOverrides` tại `src/App.jsx`.
- Đơn đặt hàng được ghi vào `orderRequests`.
- Phiếu xuất kho được ghi vào `warehouseDispatches`.
- Báo cáo giao hàng được ghi vào `deliveryReports`.
- Đơn bán hàng và công nợ lấy tổng tiền đã chốt từ các dòng giao hàng/đơn hàng.

## Root cause

### Critical - đơn vị được mở rộng ngoài cấu hình khách hàng

`getCustomerProductUnitOptions` chỉ đưa đơn vị cấu hình lên đầu, sau đó vẫn trả về tất cả đơn vị của sản phẩm. Màn hình đơn đặt hàng và xuất kho còn ghép thêm danh sách đơn vị toàn hệ thống. Vì vậy nhân viên có thể đổi một sản phẩm cố định từ `Bộ` sang `Cái`, `Con`, `Kg` hoặc đơn vị không được cấu hình.

### Critical - nhiều công thức tính giá độc lập

Đơn đặt hàng dùng `calculatePricingAmount`, xuất kho chủ yếu lưu số lượng/khối lượng và giá, còn báo cáo giao hàng tự tìm lại đơn đặt hàng bằng heuristic rồi tính lại. Khi không tìm thấy dòng nguồn chính xác, báo cáo có thể lấy cấu hình khách hiện tại. Kết quả có thể khác giữa đơn, xuất kho và báo cáo.

### Critical - chứng từ cũ có thể dùng giá cấu hình mới

Phiếu xuất kho chưa có snapshot đầy đủ `billingQuantity`, `billingUnit`, `unitPrice`, `amount`. Báo cáo giao hàng có nhánh fallback đọc cấu hình khách hàng tại thời điểm xem báo cáo. Nếu giá đổi từ 5.000 lên 6.000, chứng từ cũ có nguy cơ bị tính lại theo 6.000.

### High - đơn đặt hàng ghi ngược vào nguồn cấu hình

Sau khi tạo/sửa đơn, `syncCustomerFixedProductPricingFromOrderRequest` và `syncProductCatalogPricingFromOrderRequest` tự cập nhật cấu hình sản phẩm cố định và danh mục sản phẩm từ dữ liệu trên đơn. Điều này đảo ngược quan hệ nguồn sự thật: một thao tác nhập đơn có thể thay đổi giá/đơn vị chính thức của khách hàng.

### High - danh sách sản phẩm không luôn giới hạn theo khách

Màn hình đơn đặt hàng có bộ chọn “thêm sản phẩm” từ toàn bộ danh mục. Màn hình xuất kho cũng fallback sang toàn bộ sản phẩm nếu không tìm thấy dòng đơn. Điều này cho phép tạo chứng từ với sản phẩm ngoài cấu hình cố định của khách.

### Medium - thiếu mô hình tách thực tế và tính tiền

Các dòng hiện có dùng xen kẽ `quantity`, `quantityUnit`, `weightKg`, `pricingQuantity`, `pricingUnit`. Không có một snapshot chuẩn được tất cả module ưu tiên đọc. Trường hợp `7 Con / 20 Kg tính tiền` vì vậy phụ thuộc từng màn hình.

## Kiến trúc xử lý

Tạo service thuần dùng chung:

- `resolveCustomerProductConfiguration(...)`: chuẩn hóa đúng cấu hình/biến thể của khách, danh sách đơn vị được phép, size, thuộc tính, giá và nguồn fallback an toàn.
- `calculateBillableAmount(...)`: tách `actualQuantity/actualUnit` khỏi `billingQuantity/billingUnit`, kiểm tra đơn vị và tính thành tiền một lần.
- `buildCustomerProductBillingSnapshot(...)`: tạo snapshot bất biến cho từng dòng chứng từ.
- `resolveTransactionBillingSnapshot(...)`: ưu tiên snapshot đã chốt; chỉ fallback cho dữ liệu cũ thiếu snapshot.

Snapshot chuẩn:

```text
productId
productName
configurationId
sizeLabel
attributeLabel
actualQuantity
actualUnit
billingQuantity
billingUnit
unitPrice
amount
```

Các alias cũ (`quantity`, `quantityUnit`, `pricingQuantity`, `pricingUnit`, `lineTotal`, `pricingAmount`) tiếp tục được ghi/đọc để tương thích.

## Quy tắc fallback dữ liệu cũ

- Nếu dòng đã có snapshot: không đọc lại cấu hình hiện tại.
- Nếu dòng cũ chưa có snapshot: ưu tiên giá/đơn vị đã lưu trên dòng hoặc dòng đơn nguồn.
- Chỉ khi chứng từ cũ thiếu cả hai mới đọc cấu hình khách hiện tại.
- Fallback đơn vị chỉ trả về một đơn vị chính xác định được; không mở toàn bộ danh sách đơn vị hệ thống.
- Không sửa hoặc migration bản ghi cũ.

## Data flow sau chuẩn hóa

1. Chọn khách/chi nhánh và tạo index cấu hình sản phẩm cố định trong bộ nhớ.
2. Chọn đúng sản phẩm/biến thể từ index; đơn vị tính giá và giá là read-only theo cấu hình.
3. Khi lưu đơn, tạo snapshot cấu hình và số tiền dự kiến.
4. Xuất kho kế thừa snapshot dòng đơn; nếu ngoài đơn thì lấy snapshot từ cấu hình cố định hiện tại.
5. Báo cáo giao hàng kế thừa snapshot xuất kho, thay số lượng thực tế nhưng không tìm lại giá mới.
6. Đơn bán hàng/công nợ dùng `amount` đã chốt từ snapshot báo cáo.

## Tiêu chí kiểm thử

- Bộ 5.000 x 10 = 50.000 và không thể đổi sang Cái.
- Xuất 9 Bộ = 45.000.
- Thực tế 7 Con, tính tiền 20 Kg x 60.000 = 1.200.000.
- Báo cáo dùng snapshot xuất kho.
- Đổi cấu hình giá không đổi chứng từ cũ.
- Hai khách có cấu hình khác nhau không lẫn nhau.
- Dữ liệu cũ fallback an toàn, không tự chọn đơn vị tùy ý.
