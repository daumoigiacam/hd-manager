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

export function formatDeliveryTime(value) {
  if (!value) return '--:--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const matched = `${value}`.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
    return matched?.[0] || '--:--';
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
} = {}) {
  const normalizedKeyword = `${keyword}`.trim().toLocaleLowerCase('vi-VN');
  const normalizedArea = `${area}`.trim().toLocaleLowerCase('vi-VN');
  const normalizedMethod = `${paymentMethod}`.trim().toLocaleLowerCase('vi-VN');

  return (groups || []).filter((group) => {
    const completed = isDeliveryGroupCompleted(group);
    if (tab === 'pending' && completed) return false;
    if (tab === 'completed' && !completed) return false;
    if (normalizedKeyword) {
      const searchable = [group.customerName, group.phone, group.area, group.address]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('vi-VN');
      if (!searchable.includes(normalizedKeyword)) return false;
    }
    if (normalizedArea !== 'all' && !`${group.area || group.address || ''}`.toLocaleLowerCase('vi-VN').includes(normalizedArea)) return false;
    if (normalizedMethod !== 'all' && !`${group.collectedMethod || ''}`.toLocaleLowerCase('vi-VN').includes(normalizedMethod)) return false;
    return true;
  });
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
