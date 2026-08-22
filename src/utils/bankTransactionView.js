const parseTimestamp = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return parseTimestamp(value.toDate());
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getFallbackTimestamp = (transaction = {}) => [
  transaction.createdAt,
  transaction.updatedAt,
  transaction.timestamp
].map(parseTimestamp).find(Boolean) || 0;

export const getBankTransactionTimestamp = (transaction = {}) => {
  const transactionTimestamp = [
    transaction.transactionDateTime,
    transaction.transactionDate,
    transaction.date,
    transaction.bookingDate
  ].map(parseTimestamp).find(Boolean);
  return transactionTimestamp || getFallbackTimestamp(transaction);
};

export const sortBankTransactionsByTransactionDate = (transactions = []) => (
  (Array.isArray(transactions) ? transactions : [])
    .slice()
    .sort((left, right) => {
      const dateDifference = getBankTransactionTimestamp(right) - getBankTransactionTimestamp(left);
      if (dateDifference !== 0) return dateDifference;
      return getFallbackTimestamp(right) - getFallbackTimestamp(left);
    })
);
