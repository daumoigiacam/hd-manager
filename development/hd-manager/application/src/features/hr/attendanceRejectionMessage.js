const messages=Object.freeze({
 'outside-shift':'Ngoài thời gian ca làm được phép. Kiểm tra ca và gửi yêu cầu mới trong thời gian hợp lệ.',
 'payroll-period-locked':'Kỳ lương đã khóa. Không sửa giờ công của kỳ đã khóa; cần xử lý theo quy trình điều chỉnh.',
 'check-in-required':'Chưa có giờ vào ca hợp lệ hoặc ngày công đã ghi nghỉ. Kiểm tra bản công gốc trước khi gửi lại.',
 'existing-work-times':'Ngày này đã có giờ công, không được ghi nghỉ đè lên giờ đã lưu.',
 'work-role-not-assigned':'Công việc chưa được phân công cho nhân viên này.',
 'outside-location':'Vị trí hiện tại ngoài phạm vi chấm công được phép.',
 'company-wifi-required':'Chưa kết nối đúng WiFi công ty đã cấu hình.',
});
export function attendanceRejectionMessage(receipt){
 if(receipt?.outcome!=='rejected')return '';
 return Object.hasOwn(messages,receipt.rejectionCode)?messages[receipt.rejectionCode]:'Máy chủ từ chối theo kiểm tra gốc. Kiểm tra ca, thiết bị và quyền trước khi xử lý lại.';
}
