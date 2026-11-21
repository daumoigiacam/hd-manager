export function settingsInteger(value, {min = 0, max = Number.MAX_SAFE_INTEGER, blank = null, label = 'Giá trị'} = {}) {
  const raw = String(value ?? '').trim();
  if (!raw && blank !== null) return blank;
  if (!/^\d+$/.test(raw)) throw new Error(max === Number.MAX_SAFE_INTEGER
    ? `${label} phải là số nguyên ${min > 0 ? 'dương' : 'không âm'}.`
    : `${label} phải là số nguyên từ ${min} đến ${max}.`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} chưa hợp lệ.`);
  return parsed;
}

export function settingsMoney(value, label) {
  const raw = String(value ?? '').trim();
  // Currency inputs display Vietnamese thousands groups; never strip a minus or arbitrary text.
  if (!/^(?:\d+|\d{1,3}(?:[. ]\d{3})+)$/.test(raw)) throw new Error(`${label} phải là số tiền nguyên dương.`);
  return settingsInteger(raw.replace(/[. ]/g, ''), {min: 1, label});
}

export function settingsPercent(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(raw)) throw new Error('Tỷ lệ tích điểm phải từ 0 đến 100%.');
  const parsed = Number(raw.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error('Tỷ lệ tích điểm phải từ 0 đến 100%.');
  return parsed;
}
