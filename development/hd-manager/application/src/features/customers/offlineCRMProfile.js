// Product forms include financial defaults. Never silently discard a meaningful
// change that the offline profile command cannot authorize.
export const crmProfileFields = ['name','phone','address','customerHonorific','note','notes','customerGroup','zaloContact','zaloGroupLink','location','locationUrl','locationInput','locationLat','locationLng','mapLocation','locationUpdatedAt','locationSource'];
const empty = value => value == null || value === '' || value === false || value === 0 || (Array.isArray(value) && value.length === 0);
export function offlineCRMProfile(input, previous = {}, managerId = '') {
 const result = {};
 for (const [key,value] of Object.entries(input)) {
  if (crmProfileFields.includes(key)) { result[key] = value; continue; }
  if (key === 'clientMutationId') continue;
  if (key === 'empId' && value === (previous.empId || managerId)) continue;
  if (JSON.stringify(value) === JSON.stringify(previous[key])) continue;
  if (empty(value) && empty(previous[key])) continue;
  if (key === 'debtLimitMode' && value === 'no_debt' && !previous[key]) continue;
  throw new Error(`Chưa thể lưu Offline trường ${key}. Thông tin chưa được lưu; cần luồng có quyền tương ứng.`);
 }
 return result;
}
