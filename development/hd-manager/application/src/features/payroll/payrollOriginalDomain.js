// Exact original App declarations and transitive pure dependencies; generated without formula changes.
import {isOwnerAccountUser} from "./payrollOriginalShared.js";

import {isOwnerPosition} from "./payrollOriginalShared.js";

import {withSalesRevenueIndex} from "../../utils/salesRevenuePeriod.js";

import {getEntityTimestamp} from "./payrollOriginalShared.js";

import {buildEmployeeReviewSourceIndexes} from "../../utils/employeeReviewSourceIndex.js";

import {projectEvaluationSummaryToPayroll} from "../../utils/payrollEvaluationBonus.js";

import {getEmployeePayrollOpeningDebt} from "../../utils/payrollDebtCarryover.js";

import {isEmployeeSalesPosition} from "./payrollOriginalShared.js";

import {applyPayrollOpeningDebtToSalaryDetails} from "../../utils/payrollDebtCarryover.js";

import {applyEvaluationBonusToSalaryDetails} from "../../utils/payrollEvaluationBonus.js";

import {normalizeEmployeePosition} from "./payrollOriginalShared.js";

import {getTodayString} from "./payrollOriginalShared.js";

import {getDateKeyFromAnyValue} from "./payrollOriginalShared.js";

import {applyEmployeePayrollPolicyForMonth} from "../../utils/payrollPolicyHistory.js";

import {calculateEmployeeAutomaticEvaluation} from "../../utils/employeeEvaluationAutomation.js";

import {buildEvaluationSummary13} from "../../utils/employeeEvaluationAutomation.js";

import {buildCustomerReconciledLedger} from "./payrollOriginalShared.js";

import {parseLooseMoneyValue} from "./payrollOriginalShared.js";

import {getWorkRoleMonthEntries} from "../../utils/attendanceWorkRoles.js";

import {roundMoneyValue} from "./payrollOriginalShared.js";

import {normalizeEmployeeRoleSalaryComponents} from "./payrollOriginalShared.js";

import {calculateWorkRoleSalary} from "../../utils/attendanceWorkRoles.js";

import {isSalaryAdvanceInMonth} from "../../utils/salaryAdvancePeriod.js";

import {isSalesPosition} from "./payrollOriginalShared.js";

import {WAREHOUSE_EXPORT_POSITION} from "./payrollOriginalShared.js";

import {calculateEmployeeSalesRevenueForMonth} from "../../utils/salesRevenuePeriod.js";

import {formatCurrency} from "./payrollOriginalShared.js";

import {SALES_COLLABORATOR_POSITION} from "./payrollOriginalShared.js";

import {getSalesLeaderId} from "./payrollOriginalShared.js";

import {parseInputCurrency} from "./payrollOriginalShared.js";

const DEFAULT_SHIFT_POLICY = {
  shiftName: 'Ca hành chính',
  shiftStart: '08:00',
  shiftEnd: '17:00',
  graceMinutes: 5,
  missingAlertMinutes: 30
};

const DEFAULT_LATE_PENALTY_TIERS = [
  { id: 'late_30', lateMinutes: 30, penaltyAmount: 50000, action: 'fine' },
  { id: 'late_60', lateMinutes: 60, penaltyAmount: 150000, action: 'fine' },
  { id: 'late_120', lateMinutes: 120, penaltyAmount: 0, action: 'no_salary' }
];

const isAccountingPosition = (position = '') => ['Chủ doanh nghiệp', 'Kế toán & nhân sự'].includes(normalizeEmployeePosition(position));

const isSalesCollaboratorPosition = (position = '') => normalizeEmployeePosition(position) === SALES_COLLABORATOR_POSITION;

const getSalesLeaderCommissionPercent = (employee = {}) => {
  const parsed = parseFloat(employee?.salesLeaderCommissionPercent ?? employee?.leaderCommissionPercent ?? employee?.managerCommissionPercent ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const ROLE_PERMISSION_DEPARTMENTS = [
  { key: 'owner', label: 'Chủ doanh nghiệp', positions: ['Chủ doanh nghiệp'] },
  { key: 'accounting', label: 'Kế toán & nhân sự', positions: ['Kế toán & nhân sự'] },
  { key: 'sales', label: 'Kinh doanh / CTV', positions: ['Kinh doanh', SALES_COLLABORATOR_POSITION] },
  { key: 'driver', label: 'Tài xế', positions: ['Tài xế'] },
  { key: 'production', label: 'Sản xuất', positions: ['Sản xuất'] },
  { key: 'warehouse', label: WAREHOUSE_EXPORT_POSITION, positions: [WAREHOUSE_EXPORT_POSITION] }
];

const ROLE_PERMISSION_MODULES = [
  {
    id: 'home',
    group: 'overview',
    label: 'Quản lý tổng quan',
    description: 'Xem màn hình điều hành, số liệu nhanh, chuông thông báo và nút quét mã.',
    actions: [
      { id: 'view_dashboard', label: 'Xem màn hình quản lý' },
      { id: 'view_quick_report', label: 'Xem báo cáo nhanh' },
      { id: 'view_dashboard_revenue_drilldown', label: 'Xem chi tiết tổng thu theo sản phẩm' },
      { id: 'view_dashboard_expense_drilldown', label: 'Xem chi tiết tổng chi theo loại chi phí' },
      { id: 'change_dashboard_date', label: 'Đổi ngày xem quản lý' },
      { id: 'view_notifications', label: 'Xem chuông thông báo' },
      { id: 'open_message_center', label: 'Mở hộp thư / tin nhắn' },
      { id: 'scan_codes', label: 'Quét QR / mã vạch / mã sản phẩm' },
      { id: 'use_quick_actions', label: 'Dùng nút phím tắt nhanh' },
      { id: 'show_floating_quick_action_button', label: 'Hiện nút bong bóng +' },
      { id: 'customize_quick_actions_by_role', label: 'Dùng phím tắt theo vai trò' },
      { id: 'change_company_logo', label: 'Đổi logo từ màn quản lý' },
      { id: 'open_profile_from_header', label: 'Mở hồ sơ từ tên / logo' }
    ],
    details: ['Tổng quan doanh thu', 'Chuông thông báo', 'Quét QR / mã vạch']
  },
  {
    id: 'executive_dashboard',
    group: 'overview',
    label: 'Trung Tâm Điều Hành',
    description: 'Màn hình điều hành dành cho chủ doanh nghiệp: KPI, tài chính, kinh doanh, vận hành và cảnh báo quan trọng.',
    actions: [
      { id: 'view_executive_dashboard', label: 'Xem trung tâm điều hành' },
      { id: 'view_executive_kpis', label: 'Xem KPI tổng quan' },
      { id: 'view_executive_finance', label: 'Xem tài chính điều hành' },
      { id: 'view_executive_business', label: 'Xem kinh doanh điều hành' },
      { id: 'view_executive_operations', label: 'Xem vận hành điều hành' },
      { id: 'view_executive_alerts', label: 'Xem cảnh báo điều hành' },
      { id: 'view_executive_insights', label: 'Xem nhận định hôm nay' }
    ],
    details: ['KPI điều hành', 'Tài chính', 'Kinh doanh', 'Vận hành', 'Cảnh báo']
  },
  {
    id: 'messages',
    group: 'overview',
    label: 'Tin nhắn / thông báo',
    description: 'Hộp thư hỗ trợ, chat nội bộ, thông báo riêng từng tài khoản và gửi nhanh dữ liệu trong app.',
    actions: [
      { id: 'view_message_center', label: 'Xem hộp thư' },
      { id: 'view_support_messages', label: 'Xem tin hỗ trợ app' },
      { id: 'send_support_messages', label: 'Gửi phản ánh / hỗ trợ app' },
      { id: 'view_internal_messages', label: 'Xem tin nhắn nội bộ' },
      { id: 'send_internal_messages', label: 'Gửi tin nhắn nội bộ' },
      { id: 'view_own_notifications', label: 'Xem thông báo của chính tài khoản' },
      { id: 'view_all_notifications', label: 'Xem toàn bộ thông báo công ty' },
      { id: 'send_image_attachment', label: 'Gửi hình ảnh' },
      { id: 'send_contact_attachment', label: 'Gửi danh bạ / liên hệ' },
      { id: 'send_location_attachment', label: 'Gửi vị trí' },
      { id: 'send_bank_qr_attachment', label: 'Gửi số tài khoản kèm QR' },
      { id: 'send_order_attachment', label: 'Gửi đơn hàng' },
      { id: 'send_order_request_attachment', label: 'Gửi đơn đặt hàng' },
      { id: 'send_report_attachment', label: 'Gửi báo cáo nhanh' },
      { id: 'call_from_message', label: 'Gọi điện từ hội thoại' }
    ],
    details: ['Hỗ trợ', 'Nội bộ', 'Thông báo', 'Gửi dữ liệu nhanh']
  },
  {
    id: 'order_requests',
    group: 'warehouse',
    label: 'Đơn đặt hàng',
    description: 'Tạo, xem, lọc, sửa, xóa và chia sẻ danh sách đơn đặt hàng trong ngày.',
    actions: [
      { id: 'view_order_requests', label: 'Xem danh sách đơn đặt' },
      { id: 'view_all_order_requests', label: 'Xem đơn đặt của toàn bộ NVKD' },
      { id: 'view_own_order_requests', label: 'Chỉ xem đơn đặt của mình / cấp dưới' },
      { id: 'change_order_request_date', label: 'Chọn ngày xem đơn đặt' },
      { id: 'create_order_request', label: 'Lên đơn đặt' },
      { id: 'manual_order_request', label: 'Lên đơn đặt thủ công' },
      { id: 'voice_order_request', label: 'Lên đơn đặt bằng giọng nói' },
      { id: 'select_order_request_customer', label: 'Chọn / tìm khách khi lên đơn đặt' },
      { id: 'select_order_request_product', label: 'Chọn / tìm sản phẩm khi lên đơn đặt' },
      { id: 'use_customer_fixed_products', label: 'Ưu tiên sản phẩm cố định của khách' },
      { id: 'use_product_short_name_in_order_request', label: 'Dùng tên viết tắt SP trong đơn đặt' },
      { id: 'select_product_attribute_in_order_request', label: 'Chọn size / thuộc tính sản phẩm' },
      { id: 'show_order_request_note_in_product_cell', label: 'Hiển thị ghi chú trong ô loại hàng' },
      { id: 'set_order_request_deposit', label: 'Nhập tiền cọc đơn đặt' },
      { id: 'edit_order_request_quantity_unit', label: 'Sửa số lượng / đơn vị đặt' },
      { id: 'edit_order_request_size_price', label: 'Sửa size / giá đơn đặt' },
      { id: 'sync_order_price_to_customer_fixed_product', label: 'Đồng bộ giá sửa về sản phẩm cố định' },
      { id: 'edit_order_request_deposit', label: 'Sửa tiền cọc đơn đặt' },
      { id: 'edit_order_request', label: 'Sửa đơn đặt' },
      { id: 'delete_order_request', label: 'Xóa đơn đặt' },
      { id: 'prevent_duplicate_order_requests', label: 'Chống tạo trùng đơn đặt' },
      { id: 'filter_order_requests', label: 'Lọc đơn đặt theo ngày / NVKD' },
      { id: 'group_order_request_rows', label: 'Gộp tên khách / sắp xếp theo loại hàng' },
      { id: 'show_group_totals_in_share', label: 'Hiển thị tổng theo nhóm hàng khi chia sẻ' },
      { id: 'share_order_request_sheet', label: 'Chia sẻ bảng đơn đặt' },
      { id: 'download_order_request_sheet', label: 'Tải bảng đơn đặt' }
    ],
    details: ['Lên đơn đặt', 'Sửa / xóa đơn đặt', 'Lọc theo ngày / NVKD', 'Chia sẻ Zalo']
  },
  {
    id: 'warehouse_dispatch',
    group: 'warehouse',
    label: 'Phiếu xuất kho',
    description: 'Cân hàng, nhập nhanh, sửa dòng xuất và đối chiếu đơn đặt còn thiếu.',
    actions: [
      { id: 'view_warehouse_dispatch', label: 'Xem phiếu xuất kho' },
      { id: 'create_warehouse_dispatch', label: 'Tạo dòng xuất kho' },
      { id: 'create_dispatch_without_order_request', label: 'Tạo phiếu xuất ngoài đơn đặt' },
      { id: 'manual_search_dispatch_customer', label: 'Bấm ô tên KH để tìm trực tiếp' },
      { id: 'manual_search_dispatch_product', label: 'Bấm ô loại hàng để tìm trực tiếp' },
      { id: 'select_dispatch_order_date', label: 'Chọn ngày đơn đặt cần đóng' },
      { id: 'edit_dispatch_piece_count', label: 'Sửa số lượng con / cái khi xuất kho' },
      { id: 'edit_dispatch_weight', label: 'Sửa số kg / trọng lượng xuất kho' },
      { id: 'edit_dispatch_weight_entries', label: 'Nhập nhiều lần cân và tự cộng kg' },
      { id: 'assign_dispatch_driver', label: 'Chỉ định tài xế giao hàng' },
      { id: 'match_dispatch_with_order_request', label: 'Đối chiếu phiếu xuất với đơn đặt' },
      { id: 'edit_warehouse_dispatch', label: 'Sửa dòng xuất kho' },
      { id: 'delete_warehouse_dispatch', label: 'Xóa dòng xuất kho' },
      { id: 'view_dispatch_shortage', label: 'Xem đối chiếu đơn còn thiếu' },
      { id: 'open_shortage_detail', label: 'Mở chi tiết đơn còn thiếu' },
      { id: 'update_shortage_after_dispatch', label: 'Cập nhật thiếu đơn sau khi giao bù' },
      { id: 'view_dispatch_history_calendar', label: 'Xem lịch sử xuất kho dạng lịch' },
      { id: 'open_dispatch_history_detail', label: 'Mở chi tiết phiếu xuất theo ngày' },
      { id: 'edit_dispatch_history_detail', label: 'Sửa phiếu xuất trong lịch sử' },
      { id: 'delete_dispatch_history_detail', label: 'Xóa lịch sử xuất kho' },
      { id: 'share_warehouse_dispatch', label: 'Chia sẻ bảng xuất kho' },
      { id: 'change_warehouse_dispatch_date', label: 'Đổi ngày phiếu xuất' }
    ],
    details: ['Tạo phiếu xuất', 'Đối chiếu thiếu đơn', 'Sửa / xóa dòng cân', 'Chia sẻ phiếu']
  },
  {
    id: 'warehouse_import',
    group: 'warehouse',
    label: 'Nhập Xuất Tồn',
    description: 'Ghi nhận đầu vào theo nhóm hàng, số kg, số lượng, đơn giá và thành tiền để đối chiếu tồn kho.',
    actions: [
      { id: 'view_warehouse_import', label: 'Xem danh sách nhập kho' },
      { id: 'view_inventory_stock', label: 'Xem bảng tồn kho' },
      { id: 'view_inventory_by_group', label: 'Xem tồn theo nhóm hàng' },
      { id: 'create_warehouse_import', label: 'Tạo phiếu nhập kho' },
      { id: 'edit_warehouse_import', label: 'Sửa phiếu nhập kho' },
      { id: 'delete_warehouse_import', label: 'Xóa phiếu nhập kho' },
      { id: 'edit_inventory_balance', label: 'Điều chỉnh số lượng tồn' },
      { id: 'view_actual_inventory_stock', label: 'Xem tồn kho thực tế' },
      { id: 'create_actual_inventory_stock', label: 'Tạo báo cáo tồn kho thực tế' },
      { id: 'edit_actual_inventory_stock', label: 'Sửa báo cáo tồn kho thực tế' },
      { id: 'delete_actual_inventory_stock', label: 'Xóa báo cáo tồn kho thực tế' },
      { id: 'record_actual_inventory_reason', label: 'Ghi lý do lệch tồn thực tế' },
      { id: 'compare_actual_inventory_stock', label: 'Đối chiếu tồn hệ thống với tồn thực tế' },
      { id: 'compare_import_dispatch_stock', label: 'Đối chiếu nhập - xuất - tồn' },
      { id: 'filter_warehouse_import', label: 'Lọc nhập kho theo ngày / nhóm' }
    ],
    details: ['Nhập vịt/gà sống', 'Nhập vật tư', 'Theo dõi giá vốn đầu vào', 'Đối chiếu tồn']
  },
  {
    id: 'delivery_reports',
    group: 'warehouse',
    label: 'Báo cáo giao hàng',
    description: 'Tài xế báo trọng lượng thực tế, ảnh cân lại và cảnh báo lệch phiếu xuất kho.',
    actions: [
      { id: 'create_delivery_report', label: 'Tạo báo cáo giao hàng' },
      { id: 'create_delivery_report_without_dispatch', label: 'Báo cáo trước khi có phiếu xuất' },
      { id: 'edit_delivery_report', label: 'Sửa báo cáo giao hàng' },
      { id: 'delete_delivery_report', label: 'Xóa báo cáo giao hàng' },
      { id: 'view_delivery_reports', label: 'Hiển thị báo cáo giao hàng' },
      { id: 'view_all_delivery_reports', label: 'Xem báo cáo của toàn bộ tài xế' },
      { id: 'view_own_delivery_reports', label: 'Chỉ xem báo cáo của mình' },
      { id: 'view_dispatch_weight_in_report', label: 'Xem số kg phiếu xuất trong báo cáo' },
      { id: 'edit_actual_delivery_quantity', label: 'Nhập số lượng thực tế khi giao' },
      { id: 'edit_actual_delivery_weight', label: 'Nhập trọng lượng thực tế khi giao' },
      { id: 'view_delivery_discrepancies', label: 'Xem cảnh báo lệch cân' },
      { id: 'resolve_delivery_discrepancies', label: 'Chấp nhận / từ chối cảnh báo lệch cân' },
      { id: 'charge_lost_goods_salary', label: 'Trừ lương khi nhân viên làm mất hàng' },
      { id: 'upload_delivery_photo', label: 'Chụp / tải ảnh cân lại' },
      { id: 'delete_delivery_photo_after_5_days', label: 'Xóa ảnh báo cáo sau 5 ngày' },
      { id: 'record_return_goods', label: 'Báo hàng trả lại' },
      { id: 'upload_return_goods_photo', label: 'Gửi ảnh hàng trả lại' },
      { id: 'record_delivery_income', label: 'Ghi nhận tiền thu khi giao' },
      { id: 'record_delivery_expense', label: 'Ghi nhận chi phí khi giao' },
      { id: 'handover_delivery_cashflow', label: 'Bàn giao thu chi giao hàng' },
      { id: 'approve_delivery_cashflow', label: 'Xác nhận thu chi giao hàng' }
    ]
  },
  {
    id: 'asset_management',
    group: 'warehouse',
    label: 'Quản lý tài sản',
    description: 'Quản lý xe, bàn giao tài xế, nhiên liệu, chi phí vận hành, bảo dưỡng và cảnh báo bất thường.',
    actions: [
      { id: 'view_asset_management', label: 'Xem module quản lý tài sản' },
      { id: 'view_assets', label: 'Xem danh sách tài sản / xe' },
      { id: 'create_asset', label: 'Tạo tài sản / xe mới' },
      { id: 'edit_asset', label: 'Sửa thông tin tài sản / xe' },
      { id: 'delete_asset', label: 'Xóa / ngừng sử dụng tài sản' },
      { id: 'manage_asset_handover', label: 'Bàn giao xe cho tài xế' },
      { id: 'view_asset_cost_logs', label: 'Xem nhật ký chi phí xe' },
      { id: 'create_asset_cost_log', label: 'Tạo nhật ký đổ nhiên liệu / chi phí xe' },
      { id: 'edit_asset_cost_log', label: 'Sửa nhật ký chi phí xe' },
      { id: 'delete_asset_cost_log', label: 'Xóa nhật ký chi phí xe' },
      { id: 'upload_asset_cost_images', label: 'Tải ảnh hóa đơn / đồng hồ km' },
      { id: 'view_asset_dashboard', label: 'Xem báo cáo tổng quát tài sản' },
      { id: 'view_asset_warnings', label: 'Xem cảnh báo nhiên liệu / bảo dưỡng' },
      { id: 'view_driver_asset_score', label: 'Xem điểm quản lý xe của tài xế' }
    ],
    details: ['Tài sản', 'Nhật ký chi phí', 'Báo cáo tổng quát', 'Cảnh báo bảo dưỡng']
  },
  {
    id: 'orders',
    group: 'sales',
    label: 'Đơn hàng / hóa đơn',
    description: 'Tạo hóa đơn thủ công, lấy từ phiếu xuất kho, chỉnh sửa và chia sẻ hóa đơn có QR.',
    actions: [
      { id: 'view_orders', label: 'Chỉ xem danh sách & chi tiết đơn' },
      { id: 'create_manual_order', label: 'Lên đơn thủ công' },
      { id: 'create_order_from_image', label: 'Lên đơn bằng hình ảnh' },
      { id: 'create_order_from_warehouse', label: 'Lấy từ phiếu xuất kho' },
      { id: 'create_order_from_previous_warehouse_date', label: 'Lấy phiếu xuất kho từ ngày trước' },
      { id: 'detect_duplicate_warehouse_orders', label: 'Cảnh báo trùng khi lấy từ xuất kho' },
      { id: 'prevent_duplicate_orders', label: 'Chống tạo trùng đơn' },
      { id: 'create_bulk_orders', label: 'Tạo đơn hàng loạt' },
      { id: 'review_bulk_order_drafts', label: 'Rà soát đơn nháp hàng loạt' },
      { id: 'choose_order_creation_source', label: 'Chọn nguồn tạo đơn' },
      { id: 'choose_warehouse_order_date', label: 'Chọn ngày phiếu xuất để lên đơn' },
      { id: 'scan_notebook_image', label: 'Chụp / chọn ảnh sổ để đọc AI' },
      { id: 'edit_order_customer_honorific', label: 'Dùng xưng hô Anh/Chị khi tạo hóa đơn' },
      { id: 'edit_order_items', label: 'Sửa thông tin đơn hàng' },
      { id: 'edit_order_quantity_price', label: 'Sửa số lượng / đơn giá' },
      { id: 'edit_order_paid_amount', label: 'Sửa số tiền đã thu / tiền cọc' },
      { id: 'edit_order_fees', label: 'Sửa phụ phí / giảm giá' },
      { id: 'edit_order_fee_detail', label: 'Thêm / sửa phí vận chuyển, thùng xốp' },
      { id: 'hide_zero_order_finance_rows', label: 'Ẩn dòng giảm giá / phụ phí bằng 0' },
      { id: 'share_payment_qr', label: 'Chia sẻ hóa đơn QR' },
      { id: 'auto_reconcile_qr_payment', label: 'Tự trừ nợ khi QR khớp mã đơn' },
      { id: 'filter_orders', label: 'Lọc đơn theo ngày / hàng / NVKD' },
      { id: 'delete_order', label: 'Xóa đơn' }
    ]
  },
  {
    id: 'customers',
    group: 'sales',
    label: 'Khách hàng',
    description: 'Thêm, sửa, xóa khách; nhập Excel, lấy danh bạ, gắn sản phẩm cố định và giá riêng.',
    actions: [
      { id: 'view_customers', label: 'Xem danh sách khách' },
      { id: 'view_all_customers', label: 'Xem toàn bộ khách hàng' },
      { id: 'view_assigned_customers', label: 'Chỉ xem khách được phụ trách' },
      { id: 'view_customer_phone', label: 'Xem số điện thoại khách' },
      { id: 'copy_customer_phone', label: 'Sao chép số điện thoại khách' },
      { id: 'call_customer_phone', label: 'Bấm gọi điện cho khách' },
      { id: 'view_customer_location', label: 'Xem vị trí / địa chỉ khách' },
      { id: 'open_customer_maps', label: 'Mở Maps theo vị trí khách' },
      { id: 'copy_customer_location', label: 'Copy vị trí / địa chỉ khách' },
      { id: 'add_edit_customer', label: 'Thêm / sửa khách hàng' },
      { id: 'edit_customer_honorific', label: 'Sửa xưng hô Anh / Chị' },
      { id: 'edit_customer_phone_address', label: 'Sửa SĐT / địa chỉ khách' },
      { id: 'edit_customer_location', label: 'Sửa GPS / định vị khách' },
      { id: 'delete_customer', label: 'Xóa khách hàng' },
      { id: 'import_customer_data', label: 'Nhập Excel / lấy danh bạ' },
      { id: 'detect_duplicate_customer_phone', label: 'Cảnh báo trùng số điện thoại' },
      { id: 'fixed_products', label: 'Gắn sản phẩm cố định' },
      { id: 'fixed_product_size_attribute', label: 'Cấu hình size / thuộc tính SP cố định' },
      { id: 'customer_price_overrides', label: 'Giá riêng theo khách' },
      { id: 'bulk_update_customer_prices', label: 'Cập nhật giá riêng hàng loạt' },
      { id: 'share_customer_quote', label: 'Chia sẻ báo giá cho khách' },
      { id: 'customer_debt_limit', label: 'Cấu hình hạn mức công nợ khách' },
      { id: 'view_customer_debt_limit_alerts', label: 'Xem nhãn phải thu tiền ngay' },
      { id: 'send_customer_debt_reminder', label: 'Nhắc nợ khách hàng' },
      { id: 'driver_debt_permission', label: 'Phân quyền tài xế' },
      { id: 'customer_loyalty_points', label: 'Tích điểm khách hàng' },
      { id: 'view_customer_loans', label: 'Xem vay / trả của khách' },
      { id: 'create_customer_loan', label: 'Tạo phiếu khách vay' },
      { id: 'return_customer_loan', label: 'Ghi nhận khách trả hàng' },
      { id: 'edit_customer_loan', label: 'Chỉnh sửa vay / trả' },
      { id: 'delete_customer_loan', label: 'Xóa phiếu vay / trả' },
      { id: 'view_customer_debt', label: 'Xem công nợ khách hàng' },
      { id: 'view_customer_stats', label: 'Xem thống kê doanh thu từng khách' },
      { id: 'view_customer_order_history', label: 'Xem lịch sử đơn hàng từng khách' },
      { id: 'view_customer_payment_history', label: 'Xem lịch sử thanh toán từng khách' }
    ]
  },
  {
    id: 'debt',
    group: 'finance',
    label: 'Sổ nợ',
    description: 'Xem công nợ khách hàng, lịch sử đơn, ghi nhận thu tiền và theo dõi tiền dư.',
    actions: [
      { id: 'view_debt', label: 'Xem công nợ' },
      { id: 'view_all_debt', label: 'Xem công nợ toàn bộ khách' },
      { id: 'view_assigned_debt', label: 'Xem công nợ khách hàng mình quản lý' },
      { id: 'record_payment', label: 'Ghi nhận thu tiền' },
      { id: 'edit_debt', label: 'Chỉnh sửa công nợ' },
      { id: 'delete_debt', label: 'Xóa công nợ' },
      { id: 'edit_order_payment_from_debt', label: 'Sửa tiền thu ngay trong sổ nợ' },
      { id: 'apply_deposit_to_debt', label: 'Tự trừ tiền cọc / tiền dư vào công nợ' },
      { id: 'view_debt_limit_alerts', label: 'Xem cảnh báo vượt hạn mức' },
      { id: 'manage_debt_limit_followup', label: 'Nhắc nợ / tạm ngưng bán khi vượt hạn mức' },
      { id: 'payment_history', label: 'Lịch sử thanh toán' },
      { id: 'edit_payment_history', label: 'Sửa / xóa phiếu thu' },
      { id: 'surplus_and_deposit', label: 'Tiền dư / tiền cọc' },
      { id: 'share_debt', label: 'Chia sẻ công nợ' }
    ]
  },
  {
    id: 'finance',
    group: 'finance',
    label: 'Thu chi',
    description: 'Tạo khoản thu chi, sửa/xóa giao dịch và lọc dữ liệu theo ngày, tuần, tháng.',
    actions: [
      { id: 'view_own_cashflow', label: 'Chỉ xem thu chi của chính mình' },
      { id: 'view_all_cashflow', label: 'Xem toàn bộ thu chi' },
      { id: 'view_cashflow_groups', label: 'Xem nhật ký thu chi theo nhóm loại' },
      { id: 'open_cashflow_group_detail', label: 'Mở danh sách phiếu trong từng loại thu chi' },
      { id: 'create_income', label: 'Tạo khoản thu' },
      { id: 'create_expense', label: 'Tạo khoản chi' },
      { id: 'driver_quick_income', label: 'Tài xế tạo khoản thu nhanh' },
      { id: 'driver_quick_expense', label: 'Tài xế tạo khoản chi nhanh' },
      { id: 'edit_cashflow', label: 'Sửa giao dịch thu chi' },
      { id: 'edit_income_voucher', label: 'Sửa phiếu thu' },
      { id: 'edit_expense_voucher', label: 'Sửa phiếu chi' },
      { id: 'approve_driver_cashflow', label: 'Xác nhận thu chi nhân sự báo' },
      { id: 'handover_driver_cashflow', label: 'Báo thu chi chờ kế toán duyệt' },
      { id: 'delete_cashflow', label: 'Xóa giao dịch thu chi' },
      { id: 'delete_income_voucher', label: 'Xóa phiếu thu' },
      { id: 'delete_expense_voucher', label: 'Xóa phiếu chi' },
      { id: 'filter_cashflow', label: 'Lọc thu chi' },
      { id: 'auto_reconcile_bank', label: 'Đối soát chuyển khoản ngân hàng' }
    ]
  },
  {
    id: 'bank_payments',
    group: 'finance',
    label: 'Ngân hàng & Thanh toán',
    description: 'Theo dõi tài khoản ngân hàng khách, QR thanh toán, giao dịch chuyển khoản và đối soát tự động.',
    actions: [
      { id: 'view_bank_payments', label: 'Xem module Ngân hàng & Thanh toán' },
      { id: 'view_customer_bank_accounts', label: 'Xem tài khoản ngân hàng khách đã liên kết' },
      { id: 'manage_customer_bank_accounts', label: 'Quản lý liên kết ngân hàng khách' },
      { id: 'view_bank_transactions', label: 'Xem giao dịch ngân hàng' },
      { id: 'reconcile_bank_transactions', label: 'Đối soát / gắn giao dịch ngân hàng' },
      { id: 'view_payment_qr_history', label: 'Xem lịch sử thanh toán QR' }
    ],
    details: ['Tài khoản khách', 'Giao dịch ngân hàng', 'Đối soát QR', 'Lịch sử thanh toán']
  },
  {
    id: 'products',
    group: 'sales',
    label: 'Sản phẩm',
    description: 'Quản lý danh mục sản phẩm, đơn vị, giá mặc định và tìm kiếm/lọc sản phẩm.',
    actions: [
      { id: 'view_products', label: 'Chỉ được xem sản phẩm' },
      { id: 'create_product', label: 'Thêm sản phẩm' },
      { id: 'edit_product', label: 'Sửa sản phẩm' },
      { id: 'delete_product', label: 'Xóa sản phẩm' },
      { id: 'archive_product', label: 'Ẩn / khôi phục sản phẩm' },
      { id: 'view_archived_products', label: 'Xem sản phẩm đã ẩn' },
      { id: 'default_product_price', label: 'Giá mặc định' },
      { id: 'product_short_name', label: 'Sửa tên viết tắt SP' },
      { id: 'product_attributes', label: 'Cấu hình thuộc tính sản phẩm' },
      { id: 'product_size_options', label: 'Cấu hình nhiều size cho sản phẩm' },
      { id: 'product_attribute_options', label: 'Cấu hình nhiều thuộc tính cho sản phẩm' },
      { id: 'use_short_name_in_sharing', label: 'Dùng tên viết tắt khi chia sẻ' },
      { id: 'product_barcode_scan', label: 'Quét mã sản phẩm' },
      { id: 'manage_product_inventory', label: 'Cấu hình tồn kho sản phẩm' },
      { id: 'view_inventory_stock', label: 'Xem tồn kho sản phẩm' },
      { id: 'search_filter_products', label: 'Tìm kiếm / lọc' }
    ]
  },
  {
    id: 'pricing',
    group: 'finance',
    label: 'Giá cả',
    description: 'AI Pricing Engine: giá đầu vào, hao hụt, giá vốn, biên lợi nhuận, giá đề xuất và mô phỏng.',
    actions: [
      { id: 'view_pricing', label: 'Xem module Giá cả' },
      { id: 'view_today_price_table', label: 'Xem bảng giá hôm nay' },
      { id: 'edit_today_price_table', label: 'Chỉnh sửa bảng giá hôm nay' },
      { id: 'hide_today_price_group', label: 'Ẩn / hiện nhóm hàng trong bảng giá' },
      { id: 'delete_pricing_data', label: 'Xóa dữ liệu giá' },
      { id: 'manage_input_costs', label: 'Khai báo giá đầu vào / lô hàng' },
      { id: 'manage_loss_standards', label: 'Cấu hình định mức hao hụt' },
      { id: 'manage_cutting_standards', label: 'Cấu hình định mức pha lóc' },
      { id: 'manage_product_formulas', label: 'Cấu hình công thức sản phẩm gốc/phụ' },
      { id: 'manage_cost_allocation', label: 'Phân bổ chi phí sản xuất / quản lý / tài chính' },
      { id: 'manage_margin_rules', label: 'Cấu hình biên lợi nhuận động' },
      { id: 'view_ai_price_suggestions', label: 'Xem đề xuất giá AI' },
      { id: 'run_pricing_sandbox', label: 'Chạy mô phỏng Pricing Sandbox' },
      { id: 'approve_ai_price', label: 'Duyệt áp dụng giá AI đề xuất' },
      { id: 'auto_apply_ai_price', label: 'Cho phép AI Semi-Auto / Auto Pilot' }
    ],
    details: ['Giá đầu vào', 'Hao hụt', 'Pha lóc', 'Giá vốn', 'Giá đề xuất', 'Sandbox']
  },
  {
    id: 'price_quotes',
    group: 'sales',
    label: 'Báo giá hàng loạt',
    description: 'Cập nhật giá riêng cho nhiều khách theo sản phẩm cố định và gửi thông báo Zalo.',
    actions: [
      { id: 'view_price_quotes', label: 'Mở báo giá hàng loạt' },
      { id: 'quote_all_customers', label: 'Báo giá cho toàn bộ khách hàng' },
      { id: 'quote_assigned_customers', label: 'Chỉ báo giá khách mình phụ trách' },
      { id: 'select_quote_product', label: 'Chọn sản phẩm báo giá' },
      { id: 'select_multiple_quote_customers', label: 'Chọn nhiều khách hàng' },
      { id: 'search_quote_customers', label: 'Tìm kiếm khách trong báo giá' },
      { id: 'apply_bulk_price', label: 'Áp dụng giá mới hàng loạt' },
      { id: 'save_customer_price', label: 'Lưu giá riêng từng khách' },
      { id: 'send_zalo_quote_notice', label: 'Gửi thông báo Zalo' },
      { id: 'send_bulk_quote_notice', label: 'Gửi thông báo báo giá hàng loạt' },
      { id: 'include_customer_debt_in_quote', label: 'Kèm công nợ trong tin báo giá' }
    ],
    details: ['Chọn sản phẩm', 'Tick nhiều khách', 'Áp dụng giá mới', 'Gửi báo giá Zalo']
  },
  {
    id: 'company_attendance',
    group: 'people',
    label: 'Chấm công',
    description: 'Chấm công GPS/WiFi, xem lịch sử cá nhân và cảnh báo thiếu chấm công theo quyền.',
    actions: [
      { id: 'check_in_out', label: 'Chấm vào / ra' },
      { id: 'accurate_gps', label: 'GPS chính xác' },
      { id: 'default_wifi', label: 'WiFi mặc định' },
      { id: 'scan_wifi_networks', label: 'Dò danh sách WiFi hiện có' },
      { id: 'view_attendance_location', label: 'Xem vị trí chấm công GPS' },
      { id: 'manage_attendance_settings', label: 'Cài đặt GPS / WiFi chấm công' },
      { id: 'manage_fixed_attendance_location', label: 'Cài vị trí chấm công cố định từng nhân sự' },
      { id: 'view_own_attendance', label: 'Xem chấm công cá nhân' },
      { id: 'view_all_attendance', label: 'Xem chấm công toàn bộ nhân sự' },
      { id: 'edit_attendance', label: 'Sửa chấm công' },
      { id: 'missing_attendance_alerts', label: 'Cảnh báo thiếu công' },
      { id: 'request_leave', label: 'Báo nghỉ' },
      { id: 'request_proxy_attendance', label: 'Nhờ chấm hộ' },
      { id: 'approve_proxy_attendance', label: 'Duyệt / chấm hộ nhân sự' }
    ]
  },
  {
    id: 'payroll',
    group: 'people',
    label: 'Bảng lương',
    description: 'Xem lương cá nhân hoặc toàn bộ nhân viên theo quyền, gồm hoa hồng và thưởng phạt.',
    actions: [
      { id: 'view_own_payroll', label: 'Chỉ xem lương của chính mình' },
      { id: 'view_all_payroll', label: 'Xem lương toàn bộ nhân viên' },
      { id: 'view_commission', label: 'Xem hoa hồng / doanh thu tính lương' },
      { id: 'view_salary_advance', label: 'Xem hạn mức ứng lương' },
      { id: 'create_salary_advance_request', label: 'Tạo lệnh ứng lương' },
      { id: 'create_salary_advance_for_others', label: 'Tạo lệnh ứng hộ cho nhân sự khác' },
      { id: 'view_salary_advance_requests', label: 'Xem lệnh ứng lương chờ duyệt' },
      { id: 'approve_salary_advance', label: 'Duyệt lệnh ứng lương' },
      { id: 'reject_salary_advance', label: 'Từ chối lệnh ứng lương' },
      { id: 'delete_salary_advance', label: 'Xóa lệnh ứng lương' },
      { id: 'configure_salary_advance_limit', label: 'Cấu hình % ứng theo bộ phận' },
      { id: 'view_late_penalty_detail', label: 'Xem phạt đi muộn tự động' },
      { id: 'view_early_overtime_detail', label: 'Xem tăng ca do đi sớm' },
      { id: 'record_employee_purchase', label: 'Ghi mua hàng nhân viên để cấn lương' },
      { id: 'edit_employee_purchase', label: 'Sửa khoản mua hàng cấn lương' },
      { id: 'delete_employee_purchase', label: 'Xóa khoản mua hàng cấn lương' },
      { id: 'add_bonus_penalty', label: 'Thêm thưởng khác / phạt vi phạm' },
      { id: 'edit_bonus_penalty', label: 'Sửa thưởng / phạt đã nhập' },
      { id: 'delete_bonus_penalty', label: 'Xóa thưởng / phạt đã nhập' },
      { id: 'edit_overtime_performance', label: 'Duyệt tăng ca / hiệu suất' },
      { id: 'approve_advance', label: 'Duyệt tạm ứng' },
      { id: 'view_salary_detail_records', label: 'Xem chi tiết chấm công, ứng, thưởng, phạt' }
    ],
    details: ['Lương cá nhân', 'Lương toàn bộ', 'Hoa hồng doanh thu', 'Ứng / thưởng / phạt']
  },
  {
    id: 'employees',
    group: 'people',
    label: 'Nhân sự',
    description: 'Tạo, sửa, xóa nhân sự; cấu hình bộ phận, ca làm, lương, hoa hồng và cấp dưới.',
    actions: [
      { id: 'view_employees', label: 'Xem danh sách nhân sự' },
      { id: 'create_employee', label: 'Tạo nhân sự mới' },
      { id: 'edit_employee', label: 'Sửa thông tin nhân sự' },
      { id: 'manage_employee_documents', label: 'Quản lý giấy tờ nhân sự' },
      { id: 'delete_employee', label: 'Xóa nhân sự' },
      { id: 'edit_employee_salary_policy', label: 'Sửa cấu hình lương / hoa hồng' },
      { id: 'edit_employee_shift_policy', label: 'Sửa ca làm / cảnh báo chấm công' },
      { id: 'edit_employee_late_penalty_policy', label: 'Sửa mốc phạt đi muộn' },
      { id: 'edit_employee_early_overtime_policy', label: 'Sửa tính đi sớm thành tăng ca' },
      { id: 'create_sales_collaborator', label: 'Tạo cộng tác viên kinh doanh' },
      { id: 'assign_sales_leader', label: 'Gán cấp trên / cấp dưới kinh doanh' }
    ],
    details: ['Tạo tài khoản', 'Sửa / xóa nhân sự', 'Ca làm / lương', 'Cấp dưới kinh doanh'],
    sensitive: true
  },
  {
    id: 'employee_reviews',
    group: 'people',
    label: 'Đánh giá',
    description: 'Module đánh giá đa chiều bằng sao: app tự chấm, nhân viên đánh giá ẩn danh và phản hồi khách hàng.',
    actions: [
      { id: 'view_employee_reviews', label: 'Xem module đánh giá' },
      { id: 'view_own_employee_reviews', label: 'Xem đánh giá của chính mình' },
      { id: 'view_all_employee_reviews', label: 'Xem đánh giá toàn bộ nhân sự' },
      { id: 'create_employee_review', label: 'Đánh giá ẩn danh cho đồng nghiệp' },
      { id: 'manage_employee_review_criteria', label: 'Sửa 10 tiêu chí đánh giá' },
      { id: 'view_employee_review_radar', label: 'Xem biểu đồ radar đánh giá' }
    ],
    details: ['Radar 10 tiêu chí', 'Đánh giá ẩn danh', 'App tự chấm', 'Khách hàng phản hồi']
  },
  {
    id: 'settings',
    group: 'system',
    label: 'Cài đặt',
    description: 'Cấu hình thông tin công ty, tài khoản ngân hàng, QR, tích điểm, WiFi và reset dữ liệu.',
    actions: [
      { id: 'view_settings', label: 'Xem cài đặt' },
      { id: 'edit_company_profile', label: 'Sửa hồ sơ / logo công ty' },
      { id: 'manage_bank_accounts', label: 'Cài tài khoản nhận chuyển khoản' },
      { id: 'manage_payment_qr', label: 'Cài QR thanh toán' },
      { id: 'manage_loyalty_settings', label: 'Cài tích điểm khách hàng' },
      { id: 'manage_customer_care_reminders', label: 'Cài nhắc chăm sóc khách lâu chưa mua' },
      { id: 'manage_attendance_wifi', label: 'Cài WiFi chấm công' },
      { id: 'manage_warehouse_dispatch_settings', label: 'Cài tự hủy đơn đặt trong xuất kho' },
      { id: 'manage_order_request_auto_cancel', label: 'Cài số ngày tự hủy đơn đặt' },
      { id: 'manage_quick_action_defaults', label: 'Cấu hình phím tắt nổi theo vai trò' },
      { id: 'backup_data', label: 'Sao lưu dữ liệu' },
      { id: 'restore_data', label: 'Khôi phục dữ liệu' },
      { id: 'backup_restore_data', label: 'Sao lưu / khôi phục dữ liệu' },
      { id: 'reset_selected_data_scopes', label: 'Reset từng phạm vi dữ liệu' },
      { id: 'manage_bank_transactions', label: 'Quản lý giao dịch sao kê ngân hàng' },
      { id: 'manage_gemini_api', label: 'Cấu hình AI / Gemini' },
      { id: 'reset_company_data', label: 'Reset dữ liệu công ty' }
    ],
    details: ['Tài khoản ngân hàng', 'QR thanh toán', 'Tích điểm', 'Reset dữ liệu'],
    sensitive: true
  },
  {
    id: 'role_permissions',
    group: 'system',
    label: 'Vai trò & phân quyền',
    description: 'Bật/tắt quyền cho từng bộ phận. Đây là quyền rất nhạy cảm, nên chỉ dành cho chủ doanh nghiệp.',
    actions: [
      { id: 'view_role_permissions', label: 'Xem mục vai trò' },
      { id: 'manage_role_permissions', label: 'Lưu phân quyền bộ phận' },
      { id: 'manage_employee_permission_override', label: 'Phân quyền riêng từng nhân sự' },
      { id: 'toggle_permission_groups', label: 'Mở / đóng nhóm quyền nhỏ' },
      { id: 'manage_customer_identity_permissions', label: 'Phân quyền thông tin định danh khách' },
      { id: 'manage_warehouse_voice_permissions', label: 'Phân quyền nhập giọng nói xuất kho' },
      { id: 'manage_message_permissions', label: 'Phân quyền tin nhắn / thông báo' },
      { id: 'manage_cashflow_approval_permissions', label: 'Phân quyền duyệt thu chi' },
      { id: 'manage_sensitive_finance_permissions', label: 'Phân quyền dữ liệu tài chính nhạy cảm' },
      { id: 'reset_role_defaults', label: 'Khôi phục quyền mặc định' }
    ],
    details: ['Phân quyền bộ phận', 'Bật / tắt module', 'Khôi phục mặc định', 'Đồng bộ cloud'],
    sensitive: true
  },
  {
    id: 'billing',
    group: 'system',
    label: 'Gói cước',
    description: 'Xem và quản lý gói sử dụng, hạn dùng và trạng thái kích hoạt của công ty.',
    actions: [
      { id: 'view_billing', label: 'Xem gói cước' },
      { id: 'manage_billing', label: 'Quản lý / gia hạn gói cước' }
    ],
    details: ['Gói hiện tại', 'Hạn dùng', 'Trạng thái kích hoạt'],
    sensitive: true
  }
];

const buildPermissionSet = (ids = []) => ROLE_PERMISSION_MODULES.reduce((acc, module) => {
  acc[module.id] = ids.includes(module.id);
  return acc;
}, {});

const DEFAULT_ROLE_PERMISSIONS = {
  owner: buildPermissionSet(ROLE_PERMISSION_MODULES.map(module => module.id)),
  accounting: buildPermissionSet(['home', 'messages', 'order_requests', 'warehouse_import', 'warehouse_dispatch', 'delivery_reports', 'asset_management', 'orders', 'customers', 'debt', 'finance', 'bank_payments', 'products', 'pricing', 'price_quotes', 'company_attendance', 'payroll', 'employees', 'employee_reviews', 'settings']),
  sales: buildPermissionSet(['home', 'messages', 'order_requests', 'orders', 'customers', 'debt', 'pricing', 'price_quotes', 'company_attendance', 'payroll', 'employee_reviews']),
  driver: buildPermissionSet(['home', 'messages', 'delivery_reports', 'customers', 'debt', 'finance', 'company_attendance', 'payroll', 'employee_reviews']),
  production: buildPermissionSet(['home', 'messages', 'company_attendance', 'payroll', 'employee_reviews']),
  warehouse: buildPermissionSet(['home', 'messages', 'order_requests', 'warehouse_import', 'warehouse_dispatch', 'company_attendance', 'payroll', 'employee_reviews'])
};

const getRolePermissionActionItems = (module = {}) => (
  module.actions || (module.details || []).map((label, index) => ({ id: `detail_${index}`, label }))
);

const buildPermissionActionSet = (enabledModuleIds = []) => ROLE_PERMISSION_MODULES.reduce((acc, module) => {
  const moduleEnabled = enabledModuleIds === true || enabledModuleIds.includes(module.id);
  acc[module.id] = getRolePermissionActionItems(module).reduce((actionAcc, action) => {
    actionAcc[action.id] = moduleEnabled;
    return actionAcc;
  }, {});
  return acc;
}, {});

const DEFAULT_ROLE_PERMISSION_ACTIONS = Object.entries(DEFAULT_ROLE_PERMISSIONS).reduce((acc, [departmentKey, permissionSet]) => {
  const enabledModuleIds = ROLE_PERMISSION_MODULES.filter(module => permissionSet?.[module.id]).map(module => module.id);
  acc[departmentKey] = buildPermissionActionSet(enabledModuleIds);
  return acc;
}, {});

const getEmployeeRolePermissionKey = (employee = null, currentUser = null) => {
  const position = normalizeEmployeePosition(employee?.position || '');
  if (isOwnerAccountUser(employee, currentUser)) return 'owner';
  if (position === 'Kế toán & nhân sự') return 'accounting';
  if (isSalesPosition(position)) return 'sales';
  if (position === 'Tài xế') return 'driver';
  if (position === 'Sản xuất') return 'production';
  if (position === WAREHOUSE_EXPORT_POSITION) return 'warehouse';
  return 'production';
};

const normalizePermissionSetForDepartment = (source = {}, departmentKey = 'production') => {
  const defaults = DEFAULT_ROLE_PERMISSIONS[departmentKey] || {};
  return ROLE_PERMISSION_MODULES.reduce((moduleAcc, module) => {
    moduleAcc[module.id] = departmentKey === 'owner'
      ? true
      : (source?.[module.id] !== undefined ? Boolean(source[module.id]) : Boolean(defaults[module.id]));
    return moduleAcc;
  }, {});
};

const normalizeRolePermissions = (source = {}) => ROLE_PERMISSION_DEPARTMENTS.reduce((acc, department) => {
  acc[department.key] = normalizePermissionSetForDepartment(source?.[department.key] || {}, department.key);
  return acc;
}, {});

const normalizePermissionActionSetForDepartment = (source = {}, permissionSet = {}, departmentKey = 'production') => {
  const defaults = DEFAULT_ROLE_PERMISSION_ACTIONS[departmentKey] || {};
  const normalizedPermissionSet = normalizePermissionSetForDepartment(permissionSet || {}, departmentKey);
  return ROLE_PERMISSION_MODULES.reduce((moduleAcc, module) => {
    const incomingModuleActions = source?.[module.id] || {};
    const defaultModuleActions = defaults?.[module.id] || {};
    const moduleEnabled = departmentKey === 'owner' || Boolean(normalizedPermissionSet?.[module.id]);
    moduleAcc[module.id] = getRolePermissionActionItems(module).reduce((actionAcc, action) => {
      actionAcc[action.id] = departmentKey === 'owner'
        ? true
        : (
          incomingModuleActions[action.id] !== undefined
            ? Boolean(incomingModuleActions[action.id])
            : (
              moduleEnabled
                ? (defaultModuleActions[action.id] !== undefined ? Boolean(defaultModuleActions[action.id]) : true)
                : false
            )
        );
      return actionAcc;
    }, {});
    return moduleAcc;
  }, {});
};

const normalizeRolePermissionActions = (source = {}, permissionSource = {}) => {
  const normalizedPermissions = normalizeRolePermissions(permissionSource || {});
  return ROLE_PERMISSION_DEPARTMENTS.reduce((acc, department) => {
    acc[department.key] = normalizePermissionActionSetForDepartment(
      source?.[department.key] || {},
      normalizedPermissions?.[department.key] || {},
      department.key
    );
    return acc;
  }, {});
};

const getCompanyRolePermissions = (company = null) => normalizeRolePermissions(company?.rolePermissions || {});

const getCompanyRolePermissionActions = (company = null) => normalizeRolePermissionActions(company?.rolePermissionActions || {}, company?.rolePermissions || {});

const getCompanyEffectiveRolePermissions = (company = null, employee = null, currentUser = null) => {
  const roleKey = getEmployeeRolePermissionKey(employee, currentUser);
  if (roleKey === 'owner') return normalizePermissionSetForDepartment({}, 'owner');
  const hasEmployeeOverride = Boolean(employee?.id && Object.prototype.hasOwnProperty.call(company?.employeeRolePermissions || {}, employee.id));
  if (hasEmployeeOverride) {
    return normalizePermissionSetForDepartment(company?.employeeRolePermissions?.[employee.id] || {}, roleKey);
  }
  return getCompanyRolePermissions(company)?.[roleKey] || normalizePermissionSetForDepartment({}, roleKey);
};

const getCompanyEffectiveRolePermissionActions = (company = null, employee = null, currentUser = null) => {
  const roleKey = getEmployeeRolePermissionKey(employee, currentUser);
  const permissions = getCompanyEffectiveRolePermissions(company, employee, currentUser);
  if (roleKey === 'owner') return normalizePermissionActionSetForDepartment({}, permissions, 'owner');
  const hasEmployeeOverride = Boolean(employee?.id && Object.prototype.hasOwnProperty.call(company?.employeeRolePermissions || {}, employee.id));
  if (hasEmployeeOverride) {
    return normalizePermissionActionSetForDepartment(company?.employeeRolePermissionActions?.[employee.id] || {}, permissions, roleKey);
  }
  return getCompanyRolePermissionActions(company)?.[roleKey] || normalizePermissionActionSetForDepartment({}, permissions, roleKey);
};

const hasCompanyRolePermissionAction = ({ company, employee, currentUser }, permissionId, actionId) => {
  if (!permissionId || !actionId) return false;
  const roleKey = getEmployeeRolePermissionKey(employee, currentUser);
  if (roleKey === 'owner') return true;
  const permissionActions = getCompanyEffectiveRolePermissionActions(company, employee, currentUser);
  return Boolean(permissionActions?.[permissionId]?.[actionId]);
};

const POSITION_SHIFT_DEFAULTS = {
  'Kinh doanh': { shiftName: 'Ca kinh doanh', shiftStart: '08:00', shiftEnd: '17:00', graceMinutes: 10, missingAlertMinutes: 30 },
  [SALES_COLLABORATOR_POSITION]: { shiftName: 'Ca cộng tác viên', shiftStart: '08:00', shiftEnd: '17:00', graceMinutes: 10, missingAlertMinutes: 30 },
  'Kế toán & nhân sự': { shiftName: 'Ca hành chính', shiftStart: '08:00', shiftEnd: '17:00', graceMinutes: 5, missingAlertMinutes: 20 },
  'Tài xế': { shiftName: 'Ca giao hàng', shiftStart: '06:30', shiftEnd: '16:30', graceMinutes: 10, missingAlertMinutes: 20 },
  'Sản xuất': { shiftName: 'Ca sản xuất', shiftStart: '07:30', shiftEnd: '16:30', graceMinutes: 10, missingAlertMinutes: 20 },
  [WAREHOUSE_EXPORT_POSITION]: { shiftName: 'Ca xuất kho', shiftStart: '06:30', shiftEnd: '16:30', graceMinutes: 10, missingAlertMinutes: 20 },
  'Chủ doanh nghiệp': { shiftName: 'Điều hành linh hoạt', shiftStart: '08:00', shiftEnd: '17:00', graceMinutes: 0, missingAlertMinutes: 30 }
};

const resolveSalaryMonthDays = (employee = {}, monthKey = getTodayString().substring(0, 7)) => {
  const parsed = parseInt(employee?.salaryMonthDays, 10);
  return parsed > 0 ? parsed : getActualCalendarDaysInMonth(monthKey);
};

const parseMinutesInput = (val, fallback = 0) => {
  if (val === '' || val === undefined || val === null) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const normalizeLatePenaltyTiers = (tiers = DEFAULT_LATE_PENALTY_TIERS) => {
  const source = Array.isArray(tiers) && tiers.length > 0 ? tiers : DEFAULT_LATE_PENALTY_TIERS;
  return source
    .map((tier, index) => {
      const lateMinutes = Math.max(0, parseMinutesInput(tier?.lateMinutes ?? tier?.minutes, 0));
      const action = tier?.action === 'no_salary' ? 'no_salary' : 'fine';
      const penaltyAmount = action === 'no_salary' ? 0 : (parseInputCurrency(tier?.penaltyAmount ?? tier?.amount ?? 0) || 0);
      return {
        id: tier?.id || `late_${lateMinutes || index}`,
        lateMinutes,
        penaltyAmount,
        action
      };
    })
    .filter(tier => tier.lateMinutes > 0)
    .sort((a, b) => a.lateMinutes - b.lateMinutes);
};

const getEmployeeLatePenaltyTiers = (employee = {}) => normalizeLatePenaltyTiers(
  Object.prototype.hasOwnProperty.call(employee || {}, 'latePenaltyTiers')
    ? employee.latePenaltyTiers
    : DEFAULT_LATE_PENALTY_TIERS
);

const resolveLatePenaltyForMinutes = (lateMinutes = 0, tiers = DEFAULT_LATE_PENALTY_TIERS) => {
  const normalizedMinutes = Math.max(0, parseMinutesInput(lateMinutes, 0));
  if (normalizedMinutes <= 0) return { lateMinutes: normalizedMinutes, penaltyAmount: 0, noSalaryDay: false, matchedTier: null };
  const normalizedTiers = normalizeLatePenaltyTiers(tiers);
  // Each row is the lower bound of a range. The selected row is the
  // highest configured bound that the actual late duration reaches.
  let matchedTierIndex = -1;
  normalizedTiers.forEach((tier, index) => {
    if (normalizedMinutes >= tier.lateMinutes) matchedTierIndex = index;
  });
  const matchedTier = matchedTierIndex >= 0 ? normalizedTiers[matchedTierIndex] : null;
  if (!matchedTier) return { lateMinutes: normalizedMinutes, penaltyAmount: 0, noSalaryDay: false, matchedTier: null };
  const nextTier = normalizedTiers[matchedTierIndex + 1] || null;
  return {
    lateMinutes: normalizedMinutes,
    penaltyAmount: matchedTier.action === 'fine' ? roundMoneyValue(matchedTier.penaltyAmount || 0) : 0,
    noSalaryDay: matchedTier.action === 'no_salary',
    matchedTier: {
      ...matchedTier,
      maxLateMinutes: nextTier ? nextTier.lateMinutes - 1 : null
    }
  };
};

const parseAttendanceTimestamp = (value = null) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const calculateAttendanceTiming = (employee = {}, entry = {}) => {
  const normalizedEntry = normalizeAttendanceRecordForWorkDate(entry, employee, entry?.date);
  const checkInDate = parseAttendanceTimestamp(normalizedEntry?.checkIn);
  const checkOutDate = parseAttendanceTimestamp(normalizedEntry?.checkOut);
  if (!checkInDate || !entry?.date) {
    return { lateMinutes: 0, earlyOvertimeMinutes: 0, afterShiftOvertimeMinutes: 0, autoOvertimeMinutes: 0, latePenaltyAmount: 0, noSalaryDay: false, matchedLateTier: null };
  }
  const shiftPolicy = resolveEmployeeShiftPolicy(employee);
  const { start: shiftStart, end: shiftEnd } = buildShiftRangeDateTimes(entry.date, shiftPolicy.shiftStart, shiftPolicy.shiftEnd);
  if (Number.isNaN(shiftStart.getTime()) || Number.isNaN(shiftEnd.getTime())) {
    return { lateMinutes: 0, earlyOvertimeMinutes: 0, afterShiftOvertimeMinutes: 0, autoOvertimeMinutes: 0, latePenaltyAmount: 0, noSalaryDay: false, matchedLateTier: null };
  }
  const diffMinutes = Math.round((checkInDate.getTime() - shiftStart.getTime()) / 60000);
  const lateMinutes = Math.max(0, diffMinutes);
  const earlyOvertimeMinutes = employee?.autoEarlyOvertimeEnabled === false ? 0 : Math.max(0, -diffMinutes);
  const afterShiftOvertimeMinutes = employee?.autoLateCheckoutOvertimeEnabled === false || !checkOutDate
    ? 0
    : Math.max(0, Math.round((checkOutDate.getTime() - shiftEnd.getTime()) / 60000));
  const latePenalty = resolveLatePenaltyForMinutes(lateMinutes, getEmployeeLatePenaltyTiers(employee));
  return {
    lateMinutes,
    earlyOvertimeMinutes,
    afterShiftOvertimeMinutes,
    autoOvertimeMinutes: earlyOvertimeMinutes + afterShiftOvertimeMinutes,
    latePenaltyAmount: latePenalty.penaltyAmount || 0,
    noSalaryDay: latePenalty.noSalaryDay,
    matchedLateTier: latePenalty.matchedTier
  };
};

const parseDateInputValue = (dateStr) => {
  const parsed = new Date(`${dateStr || getTodayString()}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(`${getTodayString()}T12:00:00`) : parsed;
};

const addMonthsClamped = (date, monthsToAdd = 0) => {
  const baseDate = new Date(date);
  const targetDay = baseDate.getDate();
  baseDate.setDate(1);
  baseDate.setMonth(baseDate.getMonth() + monthsToAdd);
  const lastDayOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
  baseDate.setDate(Math.min(targetDay, lastDayOfMonth));
  return baseDate;
};

const resolveProbationEndDate = (startDate, probationDuration = 0, probationUnit = 'days') => {
  const durationValue = parseInt(probationDuration, 10);
  if (!startDate || Number.isNaN(durationValue) || durationValue <= 0) return null;

  const probationStart = parseDateInputValue(startDate);
  let probationExclusiveEnd = new Date(probationStart);

  if (probationUnit === 'days') {
    probationExclusiveEnd.setDate(probationExclusiveEnd.getDate() + durationValue);
  } else if (probationUnit === 'weeks') {
    probationExclusiveEnd.setDate(probationExclusiveEnd.getDate() + (durationValue * 7));
  } else if (probationUnit === 'months') {
    probationExclusiveEnd = addMonthsClamped(probationStart, durationValue);
  }

  const probationEndDate = new Date(probationExclusiveEnd);
  probationEndDate.setDate(probationEndDate.getDate() - 1);
  probationEndDate.setHours(23, 59, 59, 999);
  return probationEndDate;
};

const normalizeTimeInputValue = (timeStr = '') => {
  const raw = `${timeStr || ''}`.trim();
  const match = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return '';
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const timeStringToMinutes = (timeStr = '08:00') => {
  const safeTime = normalizeTimeInputValue(timeStr) || '08:00';
  const [hours, minutes] = safeTime.split(':').map(Number);
  return (hours * 60) + minutes;
};

const isOvernightShiftRange = (shiftStart = '08:00', shiftEnd = '17:00') => (
  timeStringToMinutes(shiftEnd) <= timeStringToMinutes(shiftStart)
);

const getPositionShiftDefaults = (position = '') => ({
  ...DEFAULT_SHIFT_POLICY,
  ...(POSITION_SHIFT_DEFAULTS[normalizeEmployeePosition(position)] || {})
});

const resolveEmployeeShiftPolicy = (employee = {}) => {
  const defaults = getPositionShiftDefaults(employee?.position);
  return {
    shiftName: employee?.shiftName || defaults.shiftName,
    shiftStart: normalizeTimeInputValue(employee?.shiftStart) || defaults.shiftStart,
    shiftEnd: normalizeTimeInputValue(employee?.shiftEnd) || defaults.shiftEnd,
    graceMinutes: parseMinutesInput(employee?.graceMinutes, defaults.graceMinutes),
    missingAlertMinutes: parseMinutesInput(employee?.missingAlertMinutes, defaults.missingAlertMinutes)
  };
};

const buildShiftDateTime = (dateStr, timeStr) => new Date(`${dateStr}T${normalizeTimeInputValue(timeStr) || '00:00'}:00`);

const buildShiftRangeDateTimes = (dateStr, shiftStart = '08:00', shiftEnd = '17:00') => {
  const start = buildShiftDateTime(dateStr, shiftStart);
  const end = buildShiftDateTime(dateStr, shiftEnd);
  if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && isOvernightShiftRange(shiftStart, shiftEnd)) {
    // Ca qua dem duoc tinh vao ngay ket thuc ca: 22:00 ngay 20 -> 11:00 ngay 21 la cong ngay 21.
    start.setDate(start.getDate() - 1);
  }
  return { start, end };
};

const getAttendanceLocalDateKey = (value) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getAttendanceDateKeyOffset = (dateStr, days = 0) => {
  const [year, month, day] = `${dateStr || ''}`.split('-').map(Number);
  if (![year, month, day].every(Number.isFinite)) return `${dateStr || ''}`;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return getAttendanceLocalDateKey(date);
};

const normalizeAttendanceTimestampForWorkDate = (value, workDate, employee = {}, field = 'checkIn') => {
  const parsed = parseAttendanceTimestamp(value);
  if (!parsed || !workDate) return parsed;

  const shiftPolicy = resolveEmployeeShiftPolicy(employee);
  if (!isOvernightShiftRange(shiftPolicy.shiftStart, shiftPolicy.shiftEnd)) return parsed;

  const timeMinutes = parsed.getHours() * 60 + parsed.getMinutes();
  const shiftStartMinutes = timeStringToMinutes(shiftPolicy.shiftStart);
  const shiftEndMinutes = timeStringToMinutes(shiftPolicy.shiftEnd);
  const actualDateKey = getAttendanceLocalDateKey(parsed);
  const previousDateKey = getAttendanceDateKeyOffset(workDate, -1);
  const nextDateKey = getAttendanceDateKeyOffset(workDate, 1);

  // Older overnight records may contain the timestamp on the calendar day
  // the shift starts, although their attendance date is the shift end day.
  // Normalize only at read time so existing Firestore data remains untouched.
  if (field === 'checkIn' && actualDateKey === workDate && timeMinutes >= shiftStartMinutes) {
    const normalized = new Date(parsed.getTime());
    normalized.setDate(normalized.getDate() - 1);
    return normalized;
  }

  if (field === 'checkOut' && actualDateKey === nextDateKey && timeMinutes <= shiftEndMinutes) {
    const normalized = new Date(parsed.getTime());
    normalized.setDate(normalized.getDate() - 1);
    return normalized;
  }

  // Keep this explicit for readability and to document the intended range:
  // a work date of 23/07 owns 23:00 on 22/07 through 11:00 on 23/07.
  if (field === 'checkIn' && actualDateKey === previousDateKey && timeMinutes >= shiftStartMinutes) return parsed;
  return parsed;
};

const normalizeAttendanceRecordForWorkDate = (record, employee = {}, workDate = '') => {
  if (!record || !workDate) return record;
  return {
    ...record,
    checkIn: record.checkIn
      ? normalizeAttendanceTimestampForWorkDate(record.checkIn, workDate, employee, 'checkIn')
      : record.checkIn,
    checkOut: record.checkOut
      ? normalizeAttendanceTimestampForWorkDate(record.checkOut, workDate, employee, 'checkOut')
      : record.checkOut
  };
};

const calculateCommission = (revenue, target, rate) => {
  const actualRevenue = revenue || 0;
  const targetRevenue = target || 0;
  const commissionRate = rate || 0;
  const exceededRevenue = Math.max(0, actualRevenue - targetRevenue);
  return exceededRevenue * commissionRate;
};

const calculateDirectSalesCommission = (employee = {}, revenue = 0) => {
  const commissionRate = parseFloat(employee?.commissionRate) || 0;
  if (!commissionRate) return 0;
  return roundMoneyValue(calculateCommission(revenue || 0, employee?.targetRevenue || 0, commissionRate));
};

const buildSalesDownlineCommissionRows = (leaderEmpId, employees = [], orders = [], customers = [], monthKey = getTodayString().substring(0, 7)) => {
  const leaderKey = `${leaderEmpId || ''}`.trim();
  if (!leaderKey) return [];
  return (employees || [])
    .filter(employee => !employee?.isArchived && employee.id !== leaderKey && isEmployeeSalesPosition(employee) && getSalesLeaderId(employee) === leaderKey)
    .map(employee => {
      const revenue = calculateRevenueForMonth(employee.id, orders, customers, monthKey);
      const commissionPercent = getSalesLeaderCommissionPercent(employee);
      const commission = roundMoneyValue(revenue * (commissionPercent / 100));
      return {
        employeeId: employee.id,
        employeeName: employee.name || 'Nhân sự kinh doanh',
        revenue: roundMoneyValue(revenue),
        commissionPercent,
        commission
      };
    })
    .filter(row => row.revenue > 0 || row.commissionPercent > 0);
};

const getExperienceCycleMeta = (period = 'months') => {
  if (period === 'quarters') return { monthsPerCycle: 3, label: 'quý' };
  if (period === 'years') return { monthsPerCycle: 12, label: 'năm' };
  return { monthsPerCycle: 1, label: 'tháng' };
};

const getMonthEndDateInputValue = (monthKey = getTodayString().substring(0, 7)) => {
  const safeMonthKey = /^\d{4}-\d{2}$/.test(`${monthKey}`) ? `${monthKey}` : getTodayString().substring(0, 7);
  const [year, month] = safeMonthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${safeMonthKey}-${String(lastDay).padStart(2, '0')}`;
};

const getActualCalendarDaysInMonth = (monthKey = getTodayString().substring(0, 7)) => {
  const safeMonthKey = /^\d{4}-\d{2}$/.test(`${monthKey}`) ? `${monthKey}` : getTodayString().substring(0, 7);
  const [year, month] = safeMonthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
};

const calculateExperienceSalaryAtDate = (startDate, amount, period = 'months', referenceDate = getTodayString()) => {
  const cycleMeta = getExperienceCycleMeta(period);
  if (!startDate) {
    return { total: 0, expMonths: 0, experienceCycles: 0, experienceCycleLabel: cycleMeta.label };
  }

  const start = parseDateInputValue(startDate);
  const now = parseDateInputValue(referenceDate);
  let expMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());

  if (now.getDate() < start.getDate()) expMonths -= 1;
  if (expMonths < 0) expMonths = 0;

  const experienceCycles = amount > 0 ? Math.floor(expMonths / cycleMeta.monthsPerCycle) : 0;

  return {
    total: experienceCycles * (amount || 0),
    expMonths,
    experienceCycles,
    experienceCycleLabel: cycleMeta.label
  };
};

const getCustomerDebt = (customerOrId, allOrders, allPayments, warehouseImports = []) => buildCustomerReconciledLedger(customerOrId, allOrders, allPayments, warehouseImports).currentDebt;

const calculateRevenueForMonth = (empId, orders, customers = [], monthKey = getTodayString().substring(0, 7)) => {
  return calculateEmployeeSalesRevenueForMonth({
    employeeId: empId,
    orders,
    customers,
    monthKey
  });
};

const calculateMonthRevenue = (empId, orders, customers = [], monthKey = getTodayString().substring(0, 7)) => (
  calculateRevenueForMonth(empId, orders, customers, monthKey)
);

const buildSalaryDetails = (empId, employees, attendance, financials, performance, allCustomers = [], allOrders = [], allPayments = [], holidays = [], monthKey = getTodayString().substring(0, 7), options = {}) => {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return null;

  const isSalesCollaborator = isSalesCollaboratorPosition(emp.position);
  const monthlyPerformanceKey = `${monthKey}_${empId}`;
  const legacyPerformance = performance[empId] || {};
  const monthlyPerformance = performance[monthlyPerformanceKey] || {};
  const perf = {
    ...legacyPerformance,
    ...monthlyPerformance,
    revenue: monthlyPerformance.revenue ?? legacyPerformance.revenue ?? 0,
    overtime: monthlyPerformance.overtime ?? legacyPerformance.overtime ?? 0
  };
  const salaryMonthDays = resolveSalaryMonthDays(emp, monthKey);
  const basicSalary = parseLooseMoneyValue(emp.basicSalary);
  const supportSalary = parseLooseMoneyValue(emp.supportSalary);
  const responsibilitySalary = parseLooseMoneyValue(emp.responsibilitySalary);
  const experienceSalary = parseLooseMoneyValue(emp.experienceSalary);
  const basicSalaryMonthDays = salaryMonthDays;
  const supportSalaryMonthDays = basicSalaryMonthDays;
  const dailyBaseWage = basicSalary / basicSalaryMonthDays;
  const dailySupportWage = supportSalary / supportSalaryMonthDays;
  const probationRate = (emp.probationRate !== undefined ? emp.probationRate : 100) / 100;

  let workDaysProbation = 0;
  let workDaysOfficial = 0;
  let holidayBonus = 0;
  const holidayRecords = [];
  let latePenaltyTotal = 0;
  let earlyOvertimeMinutesTotal = 0;
  let afterShiftOvertimeMinutesTotal = 0;

  const probationEndDate = resolveProbationEndDate(emp.startDate, emp.probationDuration, emp.probationUnit);

  const attendanceEntries = getWorkRoleMonthEntries(attendance, emp, emp.position, monthKey, calculateAttendanceTiming);

  attendanceEntries.forEach(entry => {
    if (entry.status === 'present' || entry.status === 'late') {
      latePenaltyTotal += entry.latePenaltyAmount || 0;
      earlyOvertimeMinutesTotal += entry.earlyOvertimeMinutes || 0;
      afterShiftOvertimeMinutesTotal += entry.afterShiftOvertimeMinutes || 0;
      if (entry.noSalaryDay) return;

      const workDate = parseDateInputValue(entry.date);
      if (probationEndDate && workDate <= probationEndDate) workDaysProbation += 1;
      else workDaysOfficial += 1;

      const matchedHolidays = holidays.filter(h => h.date === entry.date && !h.isArchived);
      matchedHolidays.forEach(isHoliday => {
        const amount = isHoliday.type === 'fixed'
          ? parseLooseMoneyValue(isHoliday.value)
          : dailyBaseWage * (parseLooseMoneyValue(isHoliday.value) / 100);
        holidayBonus += amount;
        holidayRecords.push({
          id: isHoliday.id || `${entry.date}-${isHoliday.name || 'holiday'}`,
          date: entry.date,
          name: isHoliday.name || 'Ngày lễ',
          type: isHoliday.type || 'percentage',
           value: parseLooseMoneyValue(isHoliday.value),
          amount: roundMoneyValue(amount)
        });
      });
    }
  });

  const workDays = workDaysProbation + workDaysOfficial;
  const baseSalaryCalc = roundMoneyValue((workDaysProbation * dailyBaseWage * probationRate) + (workDaysOfficial * dailyBaseWage));
  const supportSalaryCalc = roundMoneyValue((workDaysProbation * dailySupportWage * probationRate) + (workDaysOfficial * dailySupportWage));
  const responsibilitySalaryCalc = isSalesCollaborator ? 0 : roundMoneyValue((responsibilitySalary / basicSalaryMonthDays) * workDays);
  const roleSalaryRows = normalizeEmployeeRoleSalaryComponents(emp.roleSalaryComponents || emp.departmentSalaryComponents || emp.salaryByDepartment)
    .map(row => {
      const entries = row.position === emp.position ? [] : getWorkRoleMonthEntries(attendance, emp, row.position, monthKey, calculateAttendanceTiming);
      attendanceEntries.push(...entries);
      const days = calculateWorkRoleSalary(parseLooseMoneyValue(row.amount), entries, salaryMonthDays, probationEndDate, probationRate);
      return { ...row, ...days, calculatedAmount: isSalesCollaborator ? 0 : days.calculatedAmount };
    });
  const roleSalaryCalc = isSalesCollaborator ? 0 : roundMoneyValue(roleSalaryRows.reduce((sum, row) => sum + (row.calculatedAmount || 0), 0));
  attendanceEntries.sort((a, b) => a.date.localeCompare(b.date) || a.workRole.localeCompare(b.workRole, 'vi'));

  const experienceDetails = calculateExperienceSalaryAtDate(
    emp.startDate,
    experienceSalary,
    emp.experienceSalaryPeriod || 'months',
    getMonthEndDateInputValue(monthKey)
  );
  const experienceSalaryCalc = roundMoneyValue((experienceDetails.total / salaryMonthDays) * workDays);
  const expMonths = experienceDetails.expMonths;
  const experienceCycles = experienceDetails.experienceCycles;
  const experienceCycleLabel = experienceDetails.experienceCycleLabel;

  const effectiveRevenue = isEmployeeSalesPosition(emp)
    ? calculateRevenueForMonth(empId, allOrders, allCustomers, monthKey)
    : (perf.revenue || 0);
  const directCommission = calculateDirectSalesCommission(emp, effectiveRevenue || 0);
  const downlineCommissionRows = isEmployeeSalesPosition(emp)
    ? buildSalesDownlineCommissionRows(empId, employees, allOrders, allCustomers, monthKey)
    : [];
  const downlineCommission = roundMoneyValue(downlineCommissionRows.reduce((sum, row) => sum + (row.commission || 0), 0));
  const commission = roundMoneyValue(directCommission + downlineCommission);
  const tieredBonus = 0;
  const earlyOvertimeHours = roundMoneyValue((earlyOvertimeMinutesTotal / 60) * 100) / 100;
  const afterShiftOvertimeHours = roundMoneyValue((afterShiftOvertimeMinutesTotal / 60) * 100) / 100;
  const automaticOvertimeHours = afterShiftOvertimeHours;
  const approvedOvertimeHours = parseFloat(perf.overtime || 0) || 0;
  const overtimeRate = parseLooseMoneyValue(emp.overtimeRate);
  const overtimePay = isSalesCollaborator ? 0 : roundMoneyValue((approvedOvertimeHours + automaticOvertimeHours) * overtimeRate);

  const monthlyFinancials = financials
    .filter(f => (
      f.empId === empId
      && !f.isArchived
      && (f.type === 'advance'
        ? isSalaryAdvanceInMonth(f, monthKey)
        : (!f.date || f.date.startsWith(monthKey)))
    ))
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const bonusRecords = monthlyFinancials.filter(record => record.type === 'bonus');
  const penaltyRecords = monthlyFinancials.filter(record => record.type === 'penalty');
  const advanceRecords = monthlyFinancials.filter(record => record.type === 'advance');
  const employeePurchaseRecords = monthlyFinancials.filter(record => record.type === 'employee_purchase');

  let totalBonus = bonusRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);
  const totalManualPenalty = penaltyRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);
  const latePenaltyRecords = attendanceEntries
    .filter(entry => entry.isPrimaryRole && ((entry.latePenaltyAmount || 0) > 0 || entry.noSalaryDay))
    .map(entry => ({
      id: `late-${entry.date}-${empId}`,
      type: 'late_penalty',
      date: entry.date,
      amount: entry.latePenaltyAmount || 0,
      reason: entry.noSalaryDay
        ? `Đi muộn ${entry.lateMinutes} phút - không tính lương ngày này`
        : `Đi muộn ${entry.lateMinutes} phút`,
      lateMinutes: entry.lateMinutes || 0,
      noSalaryDay: Boolean(entry.noSalaryDay)
    }));
  const totalPenalty = totalManualPenalty + latePenaltyTotal;
  const totalAdvance = advanceRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);
  const totalEmployeePurchase = employeePurchaseRecords.reduce((sum, record) => sum + parseLooseMoneyValue(record.amount), 0);

  holidayBonus = isSalesCollaborator ? 0 : roundMoneyValue(holidayBonus);
  totalBonus += holidayBonus;
  totalBonus = roundMoneyValue(totalBonus);
  const roundedTotalPenalty = roundMoneyValue(totalPenalty);
  const roundedTotalAdvance = roundMoneyValue(totalAdvance);
  const roundedTotalEmployeePurchase = roundMoneyValue(totalEmployeePurchase);

  let badDebt = 0;
  if (!options.skipDebt && isEmployeeSalesPosition(emp)) {
    const myCustomers = allCustomers.filter(c => c.empId === empId);
    badDebt = myCustomers.reduce((sum, cus) => sum + (
      options.customerDebtByRecord?.has(cus)
        ? options.customerDebtByRecord.get(cus)
        : getCustomerDebt(cus, allOrders, allPayments)
    ), 0);
    if (badDebt < 0) badDebt = 0;
  }
  badDebt = roundMoneyValue(badDebt);

  const grossSalary = roundMoneyValue(baseSalaryCalc + supportSalaryCalc + responsibilitySalaryCalc + roleSalaryCalc + experienceSalaryCalc + commission + tieredBonus + overtimePay + totalBonus);
  const deductionTotal = roundMoneyValue(roundedTotalPenalty + roundedTotalAdvance + roundedTotalEmployeePurchase + badDebt);
  const netSalary = roundMoneyValue(grossSalary - deductionTotal);

  return {
    monthKey,
    workDays,
    workDaysProbation: isSalesCollaborator ? 0 : workDaysProbation,
    workDaysOfficial: isSalesCollaborator ? 0 : workDaysOfficial,
    expMonths,
    experienceCycles,
    experienceCycleLabel,
    perf: { ...perf, revenue: effectiveRevenue, overtime: approvedOvertimeHours, earlyOvertimeHours, afterShiftOvertimeHours, automaticOvertimeHours },
    salesRevenue: roundMoneyValue(effectiveRevenue || 0),
    baseSalaryCalc,
    supportSalary: supportSalaryCalc,
    responsibilitySalary: responsibilitySalaryCalc,
    roleSalary: roleSalaryCalc,
    roleSalaryRows,
    experienceSalary: experienceSalaryCalc,
    directCommission,
    downlineCommission,
    downlineCommissionRows,
    commission,
    tieredBonus,
    overtimePay,
    approvedOvertimeHours,
    earlyOvertimeHours,
    earlyOvertimeMinutes: earlyOvertimeMinutesTotal,
    afterShiftOvertimeHours,
    afterShiftOvertimeMinutes: afterShiftOvertimeMinutesTotal,
    automaticOvertimeHours,
    totalBonus,
    holidayBonus,
    latePenaltyTotal: roundMoneyValue(latePenaltyTotal),
    totalPenalty: roundedTotalPenalty,
    totalAdvance: roundedTotalAdvance,
    totalEmployeePurchase: roundedTotalEmployeePurchase,
    badDebt,
    grossSalary,
    deductionTotal,
    netSalary,
    attendanceEntries,
    bonusRecords,
    penaltyRecords,
    latePenaltyRecords,
    holidayRecords,
    advanceRecords,
    employeePurchaseRecords
  };
};

const EMPLOYEE_REVIEW_BONUS_BY_CRITERIA_STAR = {
  0: 0,
  1: 10000,
  2: 20000,
  3: 30000,
  4: 50000,
  5: 100000
};

const normalizeEmployeeReviewMonthKey = (value) => {
  const raw = `${value || ''}`.trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const dateKey = getDateKeyFromAnyValue(raw) || getTodayString();
  return `${dateKey}`.slice(0, 7);
};

const getEmployeeReviewStars = (score = 0) => {
  const value = Math.max(0, Math.min(100, Number(score || 0)));
  if (value <= 0) return 0;
  if (value >= 90) return 5;
  if (value >= 80) return 4;
  if (value >= 65) return 3;
  if (value >= 50) return 2;
  return 1;
};

const getEmployeeAttendanceEntriesForMonth = (attendance = {}, empId = '', monthKey = '', companyId = '') => {
  const records = Array.isArray(attendance)
    ? attendance.map(record => ({ key: record?.id || '', record }))
    : Object.entries(attendance || {}).map(([key, record]) => ({ key, record }));

  return records
    // Payroll/reporting asks for each employee separately. Avoid cloning every
    // other employee's full record on each call; retain the original complete
    // normalization/month/company predicates for the candidate records below.
    .filter(({key,record})=>{
      const declaredId=record?.employeeId || record?.empId || record?.targetEmployeeId;
      if (declaredId) return `${declaredId}` === `${empId || ''}`;
      const match=`${key || record?.id || ''}`.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
      return `${match?.[2] || ''}` === `${empId || ''}`;
    })
    .map(({ key, record }) => {
      // Attendance payroll rows are keyed by work date and employee. Prefer
      // that document identity so legacy record.date values cannot move the
      // same check-in into a different shift day during evaluation.
      const documentId = `${key || record?.id || ''}`;
      const documentIdMatch = documentId.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
      const employeeId = record?.empId
        || record?.employeeId
        || record?.targetEmployeeId
        || documentIdMatch?.[2]
        || '';
      const date = documentIdMatch?.[1]
        || record?.date
        || record?.dateKey
        || record?.monthKey
        || documentIdMatch?.[1]
        || record?.createdAt
        || record?.updatedAt
        || getEntityTimestamp(record);
      return {
        ...(record || {}),
        id: documentId || record?.id,
        employeeId: record?.employeeId || employeeId,
        date: documentIdMatch?.[1] || record?.date || date
      };
    })
    .filter(record => (
      `${record?.employeeId || record?.empId || ''}` === `${empId || ''}` &&
      normalizeEmployeeReviewMonthKey(record?.date || record?.dateKey || record?.createdAt || getEntityTimestamp(record)) === monthKey &&
      (!companyId || `${record?.companyId || record?.appId || record?.tenantId || ''}` === `${companyId}`)
    ));
};

const isEmployeeReviewLeaveRecord = (record = {}) => {
  const status = `${record?.status || record?.type || ''}`.trim().toLowerCase();
  return Boolean(
    record?.leave
    || record?.isLeave
    || record?.leaveType
    || ['leave', 'approved_leave', 'unapproved_leave', 'absent'].includes(status)
  );
};

const getEmployeeReviewOrderAmount = (order = {}) => (
  parseLooseMoneyValue(order.totalAmount ?? order.total ?? order.amount ?? order.finalAmount ?? order.grandTotal ?? order.revenue ?? 0)
);

const isOrderRelatedToEmployeeReview = (order = {}, empId = '') => {
  const employeeId = `${empId || ''}`;
  if (!employeeId) return false;
  return [
    order.empId,
    order.employeeId,
    order.salesEmployeeId,
    order.createdByEmpId,
    order.createdBy,
    order.ownerEmpId,
    order.salesPersonId
  ].some(id => `${id || ''}` === employeeId);
};

const isDeliveryReportRelatedToEmployeeReview = (report = {}, empId = '') => {
  const employeeId = `${empId || ''}`;
  if (!employeeId) return false;
  return [
    report.empId,
    report.employeeId,
    report.driverId,
    report.createdByEmpId,
    report.createdBy
  ].some(id => `${id || ''}` === employeeId);
};

const EMPLOYEE_PEER_REVIEW_CRITERIA = [
  {
    id: 'commitment',
    label: 'Cam kết',
    hint: 'Giữ lời hứa, theo việc đến cùng.'
  },
  {
    id: 'initiative',
    label: 'Chủ động',
    hint: 'Tự phát hiện việc cần làm, không chờ nhắc.'
  },
  {
    id: 'ownership',
    label: 'Ownership',
    hint: 'Dám nhận trách nhiệm, không đổ lỗi.'
  },
  {
    id: 'support',
    label: 'Hỗ trợ',
    hint: 'Sẵn sàng hỗ trợ đồng đội.'
  },
  {
    id: 'knowledge_sharing',
    label: 'Chia sẻ tri thức',
    hint: 'Chia sẻ kinh nghiệm, quy trình và cách làm tốt.'
  },
  {
    id: 'respect',
    label: 'Tôn trọng',
    hint: 'Tôn trọng đồng nghiệp, khách hàng và quy trình chung.'
  },
  {
    id: 'alignment',
    label: 'Đồng thuận',
    hint: 'Phối hợp vì mục tiêu chung, không kéo nhóm lệch hướng.'
  },
  {
    id: 'communication',
    label: 'Giao tiếp',
    hint: 'Nói rõ, nghe kỹ, trao đổi lịch sự.'
  },
  {
    id: 'positive_spirit',
    label: 'Tích cực',
    hint: 'Giữ tinh thần xây dựng, không tạo ganh ghét.'
  },
  {
    id: 'connection',
    label: 'Kết nối',
    hint: 'Tạo sự gắn kết giữa các bộ phận.'
  }
];

const clampEmployeeReviewStar = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(5, Math.max(0, parsed));
};

const getEmployeeReviewCriterionBonus = (score = 0) => {
  const value = clampEmployeeReviewStar(score, 0);
  const lowerStar = Math.floor(value);
  const upperStar = Math.ceil(value);
  const lowerBonus = EMPLOYEE_REVIEW_BONUS_BY_CRITERIA_STAR[lowerStar] || 0;
  if (lowerStar === upperStar) return lowerBonus;
  const upperBonus = EMPLOYEE_REVIEW_BONUS_BY_CRITERIA_STAR[upperStar] || lowerBonus;
  const bonus = lowerBonus + ((upperBonus - lowerBonus) * (value - lowerStar));
  return Math.round(bonus / 1000) * 1000;
};

const getEmployeeReviewCriteriaBonusTotal = (criteriaScores = {}, criteriaList = EMPLOYEE_PEER_REVIEW_CRITERIA) => (
  (criteriaList || EMPLOYEE_PEER_REVIEW_CRITERIA).reduce((sum, criteria) => (
    sum + getEmployeeReviewCriterionBonus(criteriaScores?.[criteria.id])
  ), 0)
);

const buildDefaultEmployeeReviewCriteriaScores = (rating = 0) => (
  EMPLOYEE_PEER_REVIEW_CRITERIA.reduce((acc, criteria) => {
    acc[criteria.id] = clampEmployeeReviewStar(rating, 0);
    return acc;
  }, {})
);

const getEmployeeReviewCriteriaAverage = (criteriaScores = {}) => {
  const scores = EMPLOYEE_PEER_REVIEW_CRITERIA
    .map(criteria => clampEmployeeReviewStar(criteriaScores?.[criteria.id], 0));
  if (!scores.length) return 0;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
};

const getEmployeeReviewRatingValue = (review = {}) => {
  if (review.rating !== undefined || review.score !== undefined) {
    return clampEmployeeReviewStar(review.rating ?? review.score, 0);
  }
  if (review.criteriaAverage !== undefined) {
    return clampEmployeeReviewStar(review.criteriaAverage, 0);
  }
  return getEmployeeReviewCriteriaAverage(review.criteriaScores || review.criteria || {});
};

const summarizeEmployeeReviews = (reviews = [], empId = '', monthKey = '', source = 'peer') => {
  const filtered = (reviews || []).filter(item => (
    `${item?.targetEmployeeId || ''}` === `${empId || ''}` &&
    normalizeEmployeeReviewMonthKey(item?.monthKey || item?.date || item?.createdAt) === monthKey &&
    (!source || `${item?.source || 'peer'}` === source)
  ));
  const totalStars = filtered.reduce((sum, item) => sum + getEmployeeReviewRatingValue(item), 0);
  const avgStars = filtered.length ? totalStars / filtered.length : 0;
  const reviewerIds = new Set(
    filtered
      .map(item => `${item?.reviewerEmployeeId || ''}`.trim())
      .filter(Boolean)
  );
  return {
    items: filtered,
    count: filtered.length,
    reviewerCount: reviewerIds.size || filtered.length,
    avgStars,
    score: avgStars ? Math.max(0, Math.min(100, avgStars * 20)) : 0,
    latestReason: filtered.slice().sort((a, b) => (getEntityTimestamp(b) || 0) - (getEntityTimestamp(a) || 0))[0]?.reason || ''
  };
};

const calculateEmployeeSystemReview = (emp = {}, {
  attendance = {},
  orders = [],
  deliveryReports = [],
  monthKey = '',
  companyId = '',
  reviewOrdersByEmployee = null,
  reviewReportsByEmployee = null
} = {}) => {
  const employeeId = emp?.id || '';
  const attendanceEntries = getEmployeeAttendanceEntriesForMonth(attendance, employeeId, monthKey, companyId);
  const workDays = attendanceEntries.filter(record => record?.checkIn || record?.status === 'present' || record?.type === 'work').length;
  const leaveDays = new Set(
    attendanceEntries
      .filter(isEmployeeReviewLeaveRecord)
      .map(record => getDateKeyFromAnyValue(record?.date || record?.dateKey || record?.createdAt || getEntityTimestamp(record)))
      .filter(Boolean)
  ).size;
  const lateCount = attendanceEntries.filter(record => {
    if (isEmployeeReviewLeaveRecord(record)) return false;
    const checkInValue = record?.checkIn || record?.checkInAt || record?.timeIn;
    if (checkInValue) return calculateAttendanceTiming(emp, record).lateMinutes > 0;
    return parseMinutesInput(record?.lateMinutes ?? record?.minutesLate ?? record?.late, 0) > 0;
  }).length;
  const missingCheckOut = attendanceEntries.filter(record => (record?.checkIn || record?.checkInAt) && !(record?.checkOut || record?.checkOutAt)).length;
  const candidateOrders = reviewOrdersByEmployee instanceof Map ? reviewOrdersByEmployee.get(`${employeeId}`) || [] : orders || [];
  const monthOrders = candidateOrders.filter(order => (
    isOrderRelatedToEmployeeReview(order, employeeId) &&
    normalizeEmployeeReviewMonthKey(order.date || order.createdAt || getEntityTimestamp(order)) === monthKey &&
    (!companyId || `${order?.companyId || order?.appId || order?.tenantId || ''}` === `${companyId}`)
  ));
  const revenue = monthOrders.reduce((sum, order) => sum + getEmployeeReviewOrderAmount(order), 0);
  const candidateReports = reviewReportsByEmployee instanceof Map ? reviewReportsByEmployee.get(`${employeeId}`) || [] : deliveryReports || [];
  const monthReports = candidateReports.filter(report => (
    isDeliveryReportRelatedToEmployeeReview(report, employeeId) &&
    normalizeEmployeeReviewMonthKey(report.date || report.createdAt || getEntityTimestamp(report)) === monthKey &&
    (!companyId || `${report?.companyId || report?.appId || report?.tenantId || ''}` === `${companyId}`)
  ));
  const deliveryCount = monthReports.length;
  const attendanceScore = Math.max(0, 40 - (lateCount * 2) - (missingCheckOut * 3) - leaveDays);
  const disciplineScore = Math.max(0, 20 - lateCount - (missingCheckOut * 2));
  const responsibilityScore = Math.max(0, 20 - (missingCheckOut * 2));
  const workloadScore = revenue > 0 || deliveryCount > 0 || workDays > 0 ? 20 : 14;
  const score = Math.max(0, Math.min(100, attendanceScore + disciplineScore + responsibilityScore + workloadScore));
  const strengths = [];
  const warnings = [];
  if (workDays > 0) strengths.push(`${workDays} ngày có chấm công`);
  if (revenue > 0) strengths.push(`Doanh thu ${formatCurrency(revenue)} đ`);
  if (deliveryCount > 0) strengths.push(`${deliveryCount} báo cáo giao hàng`);
  if (lateCount > 0) warnings.push(`${lateCount} lần đi muộn`);
  if (missingCheckOut > 0) warnings.push(`${missingCheckOut} lần thiếu chấm ra`);
  return {
    score,
    stars: getEmployeeReviewStars(score),
    workDays,
    leaveDays,
    lateCount,
    missingCheckOut,
    revenue,
    deliveryCount,
    strengths,
    warnings
  };
};

const buildEmployeeReviewSummary = (emp = {}, context = {}) => {
  const monthKey = normalizeEmployeeReviewMonthKey(context.monthKey || getTodayString());
  const companyId = context.companyId || context.currentCompany?.id || context.currentCompany?.companyId || emp?.companyId || '';
  const effectiveEmployee = applyEmployeePayrollPolicyForMonth(emp, monthKey);
  const system = calculateEmployeeSystemReview(effectiveEmployee, { ...context, monthKey, companyId });
  const peer = summarizeEmployeeReviews(context.reviews || [], emp.id, monthKey, 'peer');
  const customer = summarizeEmployeeReviews(context.reviews || [], emp.id, monthKey, 'customer');
  const systemCriteriaScores = buildEmployeeSystemReviewCriteriaScores(system);
  const peerCriteriaScores = summarizeEmployeeReviewCriteriaScores(peer.items || []);
  const customerCriteriaScores = summarizeEmployeeReviewCriteriaScores(customer.items || []);
  const peerBonus = peer.count ? getEmployeeReviewCriteriaBonusTotal(peerCriteriaScores) : 0;
  const customerBonus = customer.count ? getEmployeeReviewCriteriaBonusTotal(customerCriteriaScores) : 0;
  const finalCriteriaScores = mergeEmployeeReviewCriteriaScores({
    system: systemCriteriaScores,
    peer: peerCriteriaScores,
    customer: customerCriteriaScores,
    hasPeer: peer.count > 0,
    hasCustomer: customer.count > 0
  });
  const finalCriteriaAverage = getEmployeeReviewCriteriaAverage(finalCriteriaScores);
  const finalScore = Math.round(finalCriteriaAverage * 20);
  const stars = getEmployeeReviewStars(finalScore);
  const attendanceLoaded = context.attendanceLoaded !== undefined
    ? context.attendanceLoaded
    : context.attendance !== null && context.attendance !== undefined;
  const complaintsLoaded = context.complaintsLoaded !== undefined
    ? context.complaintsLoaded
    : context.complaints !== null && context.complaints !== undefined;
  const automaticEvaluation = emp?.id ? calculateEmployeeAutomaticEvaluation({
    employeeId: effectiveEmployee.id,
    companyId,
    monthKey,
    attendanceEntries: attendanceLoaded
      ? getEmployeeAttendanceEntriesForMonth(context.attendance, emp.id, monthKey, companyId)
      : null,
    complaints: complaintsLoaded ? context.complaints : null,
    shiftPolicy: resolveEmployeeShiftPolicy(effectiveEmployee)
  }) : null;
  const evaluationSummary13 = emp?.id ? buildEvaluationSummary13({
    employeeId: emp.id,
    companyId,
    monthKey,
    manualCriteria: context.criteriaList || getEmployeeReviewCriteriaList(context.currentCompany || {}),
    manualCriteriaScores: finalCriteriaScores,
    automaticEvaluation
  }) : null;
  return {
    employee: emp,
    monthKey,
    system,
    peer,
    customer,
    peerBonus,
    customerBonus,
    finalCriteriaScores,
    finalCriteriaAverage,
    finalScore,
    stars,
    bonus: getEmployeeReviewCriteriaBonusTotal(finalCriteriaScores),
    evaluationSummary13
  };
};

const normalizeEmployeeReviewCriteriaLabels = (labels = {}, fallbackCompany = {}) => {
  const safeLabels = labels && typeof labels === 'object' && !Array.isArray(labels) ? labels : {};
  const fallbackLabels = fallbackCompany?.employeeReviewCriteriaLabels && typeof fallbackCompany.employeeReviewCriteriaLabels === 'object'
    ? fallbackCompany.employeeReviewCriteriaLabels
    : {};
  return EMPLOYEE_PEER_REVIEW_CRITERIA.reduce((acc, criteria) => {
    const rawLabel = safeLabels?.[criteria.id] ?? fallbackLabels?.[criteria.id] ?? criteria.label;
    acc[criteria.id] = `${rawLabel || ''}`.trim() || criteria.label;
    return acc;
  }, {});
};

const getEmployeeReviewCriteriaList = (company = {}) => {
  const customLabels = normalizeEmployeeReviewCriteriaLabels(company?.employeeReviewCriteriaLabels || {}, company);
  return EMPLOYEE_PEER_REVIEW_CRITERIA.map(criteria => ({
    ...criteria,
    label: customLabels?.[criteria.id] || criteria.label
  }));
};

const summarizeEmployeeReviewCriteriaScores = (reviews = [], criteriaList = EMPLOYEE_PEER_REVIEW_CRITERIA) => {
  if (!reviews.length) return buildDefaultEmployeeReviewCriteriaScores(0);
  const totals = {};
  const counts = {};
  criteriaList.forEach(criteria => {
    totals[criteria.id] = 0;
    counts[criteria.id] = 0;
  });
  reviews.forEach((review) => {
    const fallbackRating = getEmployeeReviewRatingValue(review);
    criteriaList.forEach((criteria) => {
      const value = clampEmployeeReviewStar(
        (review.criteriaScores || review.criteria || {})?.[criteria.id],
        fallbackRating
      );
      if (Number.isFinite(value)) {
        totals[criteria.id] += value;
        counts[criteria.id] += 1;
      }
    });
  });
  return criteriaList.reduce((acc, criteria) => {
    acc[criteria.id] = counts[criteria.id] ? Number((totals[criteria.id] / counts[criteria.id]).toFixed(2)) : 0;
    return acc;
  }, {});
};

const buildEmployeeSystemReviewCriteriaScores = (system = {}) => {
  const latePenalty = Math.min(2, Number(system.lateCount || 0) * 0.35);
  const missingPenalty = Math.min(2, Number(system.missingCheckOut || 0) * 0.45);
  const workBonus = Math.min(1.2, Number(system.workDays || 0) / 22);
  const deliveryBonus = Math.min(0.8, Number(system.deliveryCount || 0) / 30);
  const revenueBonus = Math.min(0.8, parseLooseMoneyValue(system.revenue) / 100000000);
  const base = Math.max(0, Math.min(5, 3.2 + workBonus + deliveryBonus + revenueBonus - latePenalty - missingPenalty));
  return {
    commitment: Number(base.toFixed(2)),
    initiative: Number(Math.max(0, Math.min(5, base + revenueBonus - 0.2)).toFixed(2)),
    ownership: Number(Math.max(0, Math.min(5, base - missingPenalty + 0.2)).toFixed(2)),
    support: Number(Math.max(0, Math.min(5, 3.5 + deliveryBonus)).toFixed(2)),
    knowledge_sharing: Number(Math.max(0, Math.min(5, 3 + (deliveryBonus / 2))).toFixed(2)),
    respect: Number(Math.max(0, Math.min(5, 4 - (latePenalty / 2))).toFixed(2)),
    alignment: Number(Math.max(0, Math.min(5, 3.5 + (workBonus / 2))).toFixed(2)),
    communication: Number(Math.max(0, Math.min(5, 3.6 + (deliveryBonus / 2))).toFixed(2)),
    positive_spirit: Number(Math.max(0, Math.min(5, 3.5 + (workBonus / 3))).toFixed(2)),
    connection: Number(Math.max(0, Math.min(5, 3.3 + (deliveryBonus / 2))).toFixed(2))
  };
};

const mergeEmployeeReviewCriteriaScores = ({ system = {}, peer = {}, customer = {}, hasPeer = false, hasCustomer = false } = {}) => {
  const weights = {
    system: hasPeer || hasCustomer ? 0.6 : 1,
    peer: hasPeer ? 0.25 : 0,
    customer: hasCustomer ? 0.15 : 0
  };
  const totalWeight = weights.system + weights.peer + weights.customer || 1;
  return EMPLOYEE_PEER_REVIEW_CRITERIA.reduce((acc, criteria) => {
    const value = ((system[criteria.id] || 0) * weights.system) + ((peer[criteria.id] || 0) * weights.peer) + ((customer[criteria.id] || 0) * weights.customer);
    acc[criteria.id] = Number((value / totalWeight).toFixed(2));
    return acc;
  }, {});
};

const EMPTY_PAYROLL_VIEW = Object.freeze({ rows:Object.freeze([]), evaluations:new Map(), detailsByEmployee:new Map() });

const buildPayrollViewProjectionSteps = function* ({
  isPayrollLocked, currentMonth, employeeReviews, orders, deliveryReports,
  complaintsLoaded, customerComplaints, payrollCompanyId, attendance, attendanceLoaded,
  currentCompany, employees, visibleSalaryEmployees, payrollDebtCarryovers,
  payrollPolicyEmployees, financials, performance, customers, payments, holidays
}) {
  if (isPayrollLocked) return EMPTY_PAYROLL_VIEW;
  // Prepare the complete month off the render stack, with the legacy predicates.
  const filterRows = function* (rows, include) {
    const result=[];let count=0;
    for (const row of rows || []) {
      if (include(row)) result.push(row);
      if (++count % 16 === 0) yield;
    }
    return result;
  };
  const reviewsForMonth=yield* filterRows(employeeReviews,review => (
    normalizeEmployeeReviewMonthKey(review?.monthKey || review?.date || review?.createdAt) === currentMonth
  ));
  const ordersForMonth=yield* filterRows(orders,order => (
    normalizeEmployeeReviewMonthKey(order?.date || order?.createdAt || getEntityTimestamp(order)) === currentMonth
  ));
  const deliveryReportsForMonth=yield* filterRows(deliveryReports,report => (
    normalizeEmployeeReviewMonthKey(report?.date || report?.createdAt || getEntityTimestamp(report)) === currentMonth
  ));
  const complaintsForMonth=complaintsLoaded && Array.isArray(customerComplaints)
    ? yield* filterRows(customerComplaints,complaint => {
      const companyId=complaint?.companyId || complaint?.appId || complaint?.tenantId || '';
      return (!payrollCompanyId || `${companyId}` === `${payrollCompanyId}`)
        && normalizeEmployeeReviewMonthKey(complaint?.monthKey || complaint?.date || complaint?.createdAt || complaint?.updatedAt || getEntityTimestamp(complaint)) === currentMonth;
    }) : null;
  const attendanceForMonth={};let count=0;
  for (const key of Object.keys(attendance || {})) {
    const record=attendance[key];
    if (`${key || ''}`.startsWith(currentMonth)
      || normalizeEmployeeReviewMonthKey(record?.date || record?.dateKey || record?.createdAt) === currentMonth) {
      Object.defineProperty(attendanceForMonth,key,{value:record,enumerable:true,writable:true,configurable:true});
    }
    if (++count % 16 === 0) yield;
  }
  const context={attendance:attendanceForMonth,orders:ordersForMonth,deliveryReports:deliveryReportsForMonth,
    ...buildEmployeeReviewSourceIndexes(ordersForMonth,deliveryReportsForMonth),
    reviews:reviewsForMonth,complaints:complaintsForMonth,attendanceLoaded:Boolean(attendanceLoaded),
    complaintsLoaded:Boolean(complaintsLoaded && Array.isArray(customerComplaints)),companyId:payrollCompanyId,
    currentCompany,criteriaList:getEmployeeReviewCriteriaList(currentCompany),monthKey:currentMonth};
  yield;
  const evaluations=new Map();
  for (const emp of employees || []) {
    if (emp?.id && !emp.isArchived) evaluations.set(emp.id,projectEvaluationSummaryToPayroll(
      buildEmployeeReviewSummary(emp,context),{employeeId:emp.id,monthKey:currentMonth}
    ));
    yield;
  }
  const openingDebt=new Map();
  for (const emp of visibleSalaryEmployees || []) {
    openingDebt.set(emp.id,getEmployeePayrollOpeningDebt(payrollDebtCarryovers,payrollCompanyId,currentMonth,emp.id));
    yield;
  }
  const salesIds=new Set((payrollPolicyEmployees || []).filter(isEmployeeSalesPosition).map(emp=>emp.id));
  const customerDebtByRecord=new Map();
  for (const customer of customers || []) {
    if (salesIds.has(customer.empId)) customerDebtByRecord.set(customer,getCustomerDebt(customer,orders,payments));
    // Yield between customer ledgers; do not round/clamp individual balances.
    yield;
  }
  const detailsByEmployee=new Map();
  for (const emp of payrollPolicyEmployees || []) {
    const base=buildSalaryDetails(emp.id,payrollPolicyEmployees,attendance,financials,performance,customers,orders,payments,holidays,currentMonth,{customerDebtByRecord});
    detailsByEmployee.set(emp.id,applyPayrollOpeningDebtToSalaryDetails(
      applyEvaluationBonusToSalaryDetails(base,evaluations.get(emp.id)),openingDebt.get(emp.id) || 0
    ));
    yield;
  }
  const rows=[];
  for (const emp of visibleSalaryEmployees || []) {
    const details=detailsByEmployee.get(emp.id);
    if (details) rows.push({emp,details});
    yield;
  }
  return {rows,evaluations,detailsByEmployee};
};

export {buildPayrollViewProjectionSteps,hasCompanyRolePermissionAction,isOwnerAccountUser,isAccountingPosition,isOwnerPosition,calculateMonthRevenue,withSalesRevenueIndex};

export{getEmployeeRolePermissionKey,ROLE_PERMISSION_DEPARTMENTS};
