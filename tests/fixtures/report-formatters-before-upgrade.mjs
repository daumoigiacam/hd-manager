// Frozen display helpers before this upgrade. SHA256 dc5382ee766c67ad55ac980aef51d7dbbf600c7efb89271f57f145480d1d88de
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export const formatVnd = (value) => `${Math.round(number(value)).toLocaleString('vi-VN')} đ`;

export const formatCompactVnd = (value) => {
  const amount = number(value);
  const magnitude = Math.abs(amount);
  if (magnitude >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ`;
  if (magnitude >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  return formatVnd(amount);
};

export const formatPercent = (value) => `${number(value).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
