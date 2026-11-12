const asNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const DELIVERY_STATUS_TABS = [
  { id: 'pending', label: 'Chờ giao' },
  { id: 'completed', label: 'Đã giao' },
  { id: 'all', label: 'Tất cả' },
];

export function formatDeliveryMoney(value) {
  return `${Math.round(asNumber(value)).toLocaleString('vi-VN')} đ`;
}

export function formatDeliveryCompactMoney(value) {
  const amount = Math.max(0, Math.round(asNumber(value)));
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} Tỷ`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} Tr`;
  }
  if (amount >= 100_000) {
    return `${(amount / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} Tr`;
  }
  return formatDeliveryMoney(amount);
}

export function formatDeliveryTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const matched = `${value}`.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    return matched?.[0] || '';
  }
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function formatDeliveryDay(value) {
  const parsed = value ? new Date(`${value}T12:00:00`) : new Date();
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed).replace(/^./, (letter) => letter.toUpperCase());
}

const normalizeText = (value) => `${value || ''}`
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/gi, 'd')
  .trim()
  .toLocaleLowerCase('vi-VN');

function toTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function localDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayBounds(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const start = date.getTime();
  date.setDate(date.getDate() + 1);
  return [start, date.getTime() - 1];
}

export function getDeliveryInitial(name = '') {
  const words = `${name}`.trim().split(/\s+/).filter(Boolean);
  return (words.at(-1)?.[0] || words[0]?.[0] || 'K').toUpperCase();
}

export function isDeliveryGroupCompleted(group = {}) {
  return Number(group.pendingCount || 0) === 0 && Number(group.reportCount || 0) > 0;
}

export function filterDeliveryWorkspaceGroups(groups = [], {
  tab = 'all',
  keyword = '',
  area = 'all',
  paymentMethod = 'all',
  period = 'all',
  fromDate = '',
  toDate = '',
  referenceDate = '',
} = {}) {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedArea = normalizeText(area);
  const normalizedMethod = normalizeText(paymentMethod);
  const reference = dayBounds(referenceDate || localDateKey(Date.now()));
  const sevenDayStart = reference ? reference[0] - 6 * 24 * 60 * 60 * 1000 : 0;
  const rangeStart = fromDate ? dayBounds(fromDate)?.[0] : 0;
  const rangeEnd = toDate ? dayBounds(toDate)?.[1] : 0;

  return (groups || []).filter((group) => {
    const completed = isDeliveryGroupCompleted(group);
    if (tab === 'pending' && completed) return false;
    if (tab === 'completed' && !completed) return false;
    if (normalizedKeyword) {
      const searchable = [group.customerName, group.phone, group.area, group.address]
        .filter(Boolean)
        .join(' ')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLocaleLowerCase('vi-VN');
      if (!searchable.includes(normalizedKeyword)) return false;
    }
    if (normalizedArea && normalizedArea !== 'all' && !normalizeText(group.area || group.address).includes(normalizedArea)) return false;
    if (normalizedMethod && normalizedMethod !== 'all' && !normalizeText(group.collectedMethod).includes(normalizedMethod)) return false;
    if (period !== 'all') {
      const timestamp = toTimestamp(group.latestTimestamp || group.time);
      if (!timestamp) return false;
      if (period === 'today' && localDateKey(timestamp) !== (referenceDate || localDateKey(Date.now()))) return false;
      if (period === '7days' && (!reference || timestamp < sevenDayStart || timestamp > reference[1])) return false;
      if (period === 'range') {
        if (rangeStart && timestamp < rangeStart) return false;
        if (rangeEnd && timestamp > rangeEnd) return false;
      }
    }
    return true;
  });
}

export function getDeliveryActivityByHour(groups = [], workingDate = '') {
  const slots = [6, 9, 12, 15, 18, 21].map((hour) => ({ label: `${hour}h`, count: 0 }));
  const dateKey = workingDate || localDateKey(Date.now());
  (groups || []).forEach((group) => {
    const timestamp = toTimestamp(group.latestTimestamp || group.time);
    if (!timestamp || localDateKey(timestamp) !== dateKey) return;
    const hour = new Date(timestamp).getHours();
    const slotIndex = Math.min(slots.length - 1, Math.max(0, Math.floor((hour - 6) / 3)));
    slots[slotIndex].count += Math.max(1, Number(group.reportCount || group.pendingCount || 1));
  });
  return slots;
}

export function getDeliveryWorkspaceStats(groups = []) {
  const pending = (groups || []).filter((group) => !isDeliveryGroupCompleted(group));
  const completed = (groups || []).filter(isDeliveryGroupCompleted);
  return {
    required: (groups || []).reduce((total, group) => total + Math.max(0, Number(group.rowCount || group.pendingCount || 0)), 0),
    waiting: pending.reduce((total, group) => total + Math.max(0, Number(group.pendingCount || 0)), 0),
    completed: completed.reduce((total, group) => total + Math.max(0, Number(group.reportCount || 0)), 0),
  };
}
