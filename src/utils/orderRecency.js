const parseTimestampNumber = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) < 100_000_000_000 ? value * 1000 : value;
};

const parseVietnameseDateTime = (value) => {
  const match = `${value || ''}`.trim().match(
    /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (!match) return 0;

  const [, day, month, year, hour = '0', minute = '0', second = '0'] = match;
  const timestamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const parseOrderRecencyValue = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value?.toDate === 'function') {
    return parseOrderRecencyValue(value.toDate());
  }
  if (typeof value === 'object') {
    const seconds = Number(value.seconds ?? value._seconds);
    const nanoseconds = Number(value.nanoseconds ?? value._nanoseconds ?? 0);
    if (Number.isFinite(seconds)) return (seconds * 1000) + Math.floor(nanoseconds / 1_000_000);
  }
  if (typeof value === 'number') return parseTimestampNumber(value);

  const text = `${value}`.trim();
  if (!text) return 0;
  if (/^\d{10,13}$/.test(text)) return parseTimestampNumber(Number(text));

  const vietnameseTimestamp = parseVietnameseDateTime(text);
  if (vietnameseTimestamp) return vietnameseTimestamp;

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const getOrderRecencyTimestamp = (order = {}) => {
  const candidates = [
    order.createdAt,
    order.requestedAt,
    order.orderCreatedAt,
    order.sourceCreatedAt,
    order.timestamp,
    order.date,
    order.orderDate,
    order.requestDateKey,
    order.requestDate
  ];

  for (const candidate of candidates) {
    const timestamp = parseOrderRecencyValue(candidate);
    if (timestamp) return timestamp;
  }
  return 0;
};

export const compareOrdersByNewest = (left = {}, right = {}) => {
  const timestampDifference = getOrderRecencyTimestamp(right) - getOrderRecencyTimestamp(left);
  if (timestampDifference !== 0) return timestampDifference;
  return `${right.id || ''}`.localeCompare(`${left.id || ''}`);
};

export const sortOrdersByNewest = (orders = []) => [...orders].sort(compareOrdersByNewest);
