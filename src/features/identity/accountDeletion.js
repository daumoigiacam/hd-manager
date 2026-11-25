export const ACCOUNT_DELETION_CONFIRMATION = 'XOA TAI KHOAN';

export const normalizeAccountDeletionConfirmation = (value = '') => `${value}`
  .trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'D').replace(/\s+/g, ' ').toUpperCase();

export const validateAccountDeletion = ({ password = '', confirmation = '' }) => {
  if (!password) return 'Nhập mật khẩu hiện tại để xác nhận xóa tài khoản.';
  if (normalizeAccountDeletionConfirmation(confirmation) !== ACCOUNT_DELETION_CONFIRMATION) {
    return 'Nhập đúng cụm từ XOA TAI KHOAN để xác nhận.';
  }
  return '';
};
