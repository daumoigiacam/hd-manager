export function buildDebtBalanceShare(customer, updatedAt = new Date()) {
  const debt = Number(customer?.ledger?.currentDebt);
  const credit = Number(customer?.ledger?.creditBalance);
  if (!Number.isFinite(debt) || !Number.isFinite(credit) || debt < 0 || credit < 0) {
    throw new Error('Chưa có số dư công nợ hợp lệ. Vui lòng kiểm tra lại.');
  }
  const name = `${customer.name || 'Khách hàng'}`.trim();
  const money = value => `${new Intl.NumberFormat('vi-VN').format(value)} VNĐ`;
  const balance = debt > 0
    ? `Số tiền còn phải thanh toán: ${money(debt)}.`
    : credit > 0 ? `Số tiền công ty còn nợ khách hàng: ${money(credit)}.` : 'Công nợ hiện tại: 0 VNĐ.';
  return {
    title: `Công nợ - ${name}`,
    text: ['THÔNG BÁO CÔNG NỢ', `Khách hàng: ${name}`, balance,
      `Cập nhật: ${updatedAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
      'Anh/chị vui lòng đối chiếu và phản hồi nếu có chênh lệch. Cảm ơn anh/chị.'].join('\n'),
    dialogTitle: 'Chia sẻ công nợ',
  };
}
