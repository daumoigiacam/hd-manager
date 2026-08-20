# HD Manager UI Section Inventory

Audit baseline for the visual overhaul. This inventory records the existing
navigation surface and the shared shell used by each screen; it does not change
business behavior or data access.

| Screen | Route/tab | Main component | Desktop/mobile | Current status | Visual status | Test status |
| --- | --- | --- | --- | --- | --- | --- |
| Trang chủ | `home` | `DashboardView` / `EmployeePersonalHomeView` | Both | Existing | Shared dashboard foundation | `test:design-system`, full regression previously PASS |
| Điều hành | `executive_dashboard` | `ExecutiveDashboardView` | Both | Existing | Shared dashboard foundation | Existing dashboard tests |
| Tin nhắn | `messages` | `MessageCenterView` | Both | Existing, employee-scoped access enforced | Messaging surfaces use shared shell | Messaging and Firestore rules tests PASS |
| Đơn đặt | `order_requests` | `OrderRequestView` | Both | Existing | Dense form/table surfaces | `test:order-request-ux` |
| Đơn hàng | `orders` | `OrderManagementView` | Both | Existing | Dense operational cards/tables | Billing and order regression tests |
| Khách hàng | `customers` | `CustomerCRMView` | Both | Existing | Customer cards and data surfaces | Customer and billing tests |
| Giá cả | `pricing` | `PricingEngineView` / `SimplePricingEngineView` | Both | Existing | Pricing cards and filters | Pricing unit tests |
| Báo giá | `price_quotes` | `PriceQuoteBroadcastView` | Both | Existing | Quote surfaces | Existing quote coverage |
| Xuất kho | `warehouse_dispatch` | `WarehouseDispatchView` | Both | Existing | Warehouse operational surface | Warehouse dispatch tests |
| Nhập Xuất Tồn | `warehouse_import` | `WarehouseImportView` | Both | Existing | Inventory data surface | Warehouse inventory tests |
| Báo cáo giao hàng | `delivery_reports` | `DeliveryReportView` | Both | Existing | Delivery/report cards | Delivery reconciliation tests |
| Bản đồ | `maps` | `MapManagementView` | Both | Existing | Map action surface | Existing map coverage |
| Sổ nợ | `debt` | `DebtManagementView` | Both | Existing | Finance/debt surface | Debt and payment tests |
| Thu chi | `finance` | `FinanceView` | Both | Existing | Finance tables/cards | Finance regression coverage |
| Ngân hàng | `bank_payments` | `BankPaymentCenterView` | Both | Existing | Payment/reconciliation surface | SePay and reconciliation tests |
| Chấm công | `company_attendance` | `AttendanceView` | Both | Existing | People/action surface | Attendance regression coverage |
| Bảng lương | `payroll` | `SalaryView` | Both | Existing | Payroll tables/cards | Payroll regression coverage |
| Nhân sự | `employees` | `EmployeeView` | Both | Existing | People cards/forms | Employee regression coverage |
| Đánh giá | `employee_reviews` | `EmployeeReviewModuleView` | Both | Existing | Review cards/forms | Existing employee review tests |
| Tài sản | `asset_management` | `AssetManagementView` | Both | Existing | Asset data surface | Existing asset coverage |
| Sản phẩm | `products` | `ProductManagementView` | Both | Existing | Product tables/forms | Product and inventory tests |
| Báo cáo | `report` | `ReportView` | Both | Existing | Report/table surface | Existing report coverage |
| Cài đặt | `settings` | `SettingsView` | Both | Existing | Settings panels/forms | Security and config tests |
| Vai trò | `role_permissions` | `RolePermissionView` | Both | Existing | Permission matrix surface | Authorization/rules tests |
| Gói dịch vụ | `billing` | `BillingView` | Both | Existing | Account surface | Existing billing coverage |
| Thêm | `more` | `MoreMenu` | Both | Existing | Navigation surface | Navigation regression coverage |
| Customer portal | portal shell | `CustomerPortalView` | Mobile/web | Existing | Customer shell foundation | Customer portal tests |
| Authentication | auth shell | `LoginRegisterView` | Mobile/web | Existing | Auth shell foundation | Identity tests |

## Shared UI boundary

- `AppShell` is the root boundary for staff, customer portal and auth shells.
- `HDHeader`, `HDNavigation`, `HDBottomNavigation`, `HDNavigationRail` and
  `HDSidebar` are the shared shell primitives.
- `src/design-system/foundation.css` is loaded globally after `src/index.css`.
- Business logic, Firestore access, authorization and notification behavior are
  outside this visual inventory and remain unchanged.
