const normalizeMonthCandidate = (value = '') => {
  const text = `${value || ''}`.trim();
  const match = text.match(/^(\d{4})-(\d{2})/);
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : '';
};

export const normalizeSalaryAdvanceMonth = (value = '') => normalizeMonthCandidate(value);

export const getSalaryAdvanceMonth = (record = {}) => {
  const candidates = [
    record.salaryMonth,
    record.deductionMonth,
    record.payrollMonth,
    record.date,
    record.createdAt
  ];
  for (const candidate of candidates) {
    const monthKey = normalizeMonthCandidate(candidate);
    if (monthKey) return monthKey;
  }
  return '';
};

export const isSalaryAdvanceInMonth = (record = {}, monthKey = '') => {
  const expectedMonth = normalizeMonthCandidate(monthKey);
  return Boolean(expectedMonth) && getSalaryAdvanceMonth(record) === expectedMonth;
};

