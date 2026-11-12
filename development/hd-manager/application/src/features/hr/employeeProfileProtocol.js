import {normalizeEmployeePosition,isOwnerPosition} from '../payroll/payrollOriginalShared.js';
// Same phone normalization/lookup declarations as the current App. No account,
// salary, shift or permission field is writable through this profile protocol.
const normalizeCustomerPhone = (value = '') => `${value}`.replace(/\D/g, '');
const normalizeEmployeeLoginPhone = (value = '') => {
  const digits = normalizeCustomerPhone(value);
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) return `0${digits.slice(2)}`;
  if (!digits.startsWith('0') && digits.length === 9) return `0${digits}`;
  return digits;
};
const buildPhoneLookupVariants = (value = '') => {
  const digits = normalizeCustomerPhone(value);
  const canonical = normalizeEmployeeLoginPhone(value);
  const withoutLeadingZeros = digits.replace(/^0+/, '');
  const variants = new Set([digits, canonical, withoutLeadingZeros].filter(Boolean));
  if (canonical?.startsWith('0')) variants.add(`84${canonical.slice(1)}`);
  if (digits?.startsWith('84') && digits.length >= 10) variants.add(`0${digits.slice(2)}`);
  if (withoutLeadingZeros) {
    variants.add(`0${withoutLeadingZeros}`);
    variants.add(`84${withoutLeadingZeros}`);
  }
  return [...variants].filter(Boolean);
};
const isSameLoginPhone = (left = '', right = '') => {
  const leftVariants = new Set(buildPhoneLookupVariants(left));
  return buildPhoneLookupVariants(right).some(variant => leftVariants.has(variant));
};
export {normalizeEmployeeLoginPhone,isSameLoginPhone};
export const employeeProfileActions=Object.freeze({'employeeProfile.create':'create_employee','employeeProfile.update':'edit_employee','employeeProfile.archive':'delete_employee'});
export const employeeProfileFields=Object.freeze(['name','phone','address','email','department','employeeCode']);
const fail=message=>{throw Error(message);};
export function profileInput(input){
 if(!input||Array.isArray(input)||typeof input!=='object'||Object.keys(input).some(key=>!employeeProfileFields.includes(key)))fail('Chỉ hỗ trợ trường hồ sơ; không ghi quyền, lương hoặc ca làm.');
 const result={};for(const key of employeeProfileFields){if(typeof input[key]!=='string'||input[key].length>(key==='address'?1000:200))fail('Trường hồ sơ không hợp lệ.');result[key]=input[key].trim();}
 result.phone=normalizeEmployeeLoginPhone(result.phone);if(!result.name||!result.phone)fail('Nhập họ tên và số điện thoại hợp lệ.');return result;
}
export function assertEditableEmployee(document,tenant){if(!document||document.companyId!==tenant||document.isArchived||document.role==='super_admin'||isOwnerPosition(document.position))fail('Không thay đổi/xóa chủ doanh nghiệp hoặc hồ sơ ngoài công ty qua luồng này.');}
export function newProfile(input,{id,tenant,position}){
 const normalized=normalizeEmployeePosition(position);if(!normalized||isOwnerPosition(normalized)||normalized==='Cộng tác viên kinh doanh')fail('Vai trò này cần quy trình cấp quyền/chính sách riêng.');
 return {...profileInput(input),position:normalized,role:'employee',id,companyId:tenant};
}
