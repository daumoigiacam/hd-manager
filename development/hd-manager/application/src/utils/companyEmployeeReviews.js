// A company feature preference, never a payroll policy or historical rewrite.
// Existing companies keep their behavior until the owner explicitly opts out.
export const isEmployeeReviewEnabled = company => company?.employeeReviewsEnabled !== false;

export function employeeReviewFeaturePatch(enabled, actorEmployeeId, serverTime) {
  if (typeof enabled !== 'boolean') throw new Error('Trạng thái Đánh giá chưa hợp lệ.');
  if (!actorEmployeeId) throw new Error('Không xác định được người thay đổi cấu hình.');
  return {employeeReviewsEnabled:enabled,employeeReviewsUpdatedByEmpId:actorEmployeeId,employeeReviewsUpdatedAt:serverTime};
}
