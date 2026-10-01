const asIso = (value = new Date()) => {
  if (value == null || value === '') return null;
  try {
    let date;
    if (typeof value.toDate === 'function') date = value.toDate();
    else if (typeof value === 'object' && ('seconds' in value || '_seconds' in value)) {
      date = new Date(Number(value.seconds ?? value._seconds) * 1000
        + Number(value.nanoseconds ?? value._nanoseconds ?? 0) / 1e6);
    } else date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
};

module.exports = { asIso };
