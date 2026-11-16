import { getWarehouseWeightEntryTotal } from '../../utils/warehouseWeightEntries.js';

/** @param {string | number | null | undefined} value */
function weight(value) {
  if (value == null || value === '') return 0;
  const text = String(value).trim();
  if (!/^\d+(?:[.,]\d{0,3})?$/.test(text)) throw new Error('Số kg không hợp lệ; tối đa 3 số lẻ.');
  const number = Number(text.replace(',', '.'));
  if (!Number.isSafeInteger(Math.round(number * 1000))) throw new Error('Số kg vượt giới hạn.');
  return number;
}

/**
 * Validate new weight intents, never silently repair a historical document.
 * A measurement-only edit replaces the total, not adds to the previous total.
 * @param {{weightKg?: string | number | null, totalKg?: string | number | null, weightEntries?: readonly (string | number | null | undefined)[]}} patch
 * @param {{weightKg?: string | number | null, totalKg?: string | number | null, weightEntries?: readonly (string | number | null | undefined)[]} | null} [previous]
 */
export function resolveDispatchWeightWrite(patch, previous = null) {
  const editsEntries = Object.hasOwn(patch, 'weightEntries');
  const editsTotal = Object.hasOwn(patch, 'weightKg') || Object.hasOwn(patch, 'totalKg');
  const merged = { ...previous, ...patch };
  const storedWeight = weight(merged.weightKg ?? merged.totalKg);
  if (previous && !editsEntries && !editsTotal) return { weightKg: storedWeight };
  const rawEntries = merged.weightEntries ?? [];
  if (!Array.isArray(rawEntries)) throw new Error('Các lần cân không hợp lệ.');
  const entries = rawEntries.map(weight).filter(value => value > 0);
  const total = getWarehouseWeightEntryTotal(entries);
  const expected = editsTotal ? weight(patch.weightKg ?? patch.totalKg) : storedWeight;
  if (entries.length && (editsTotal || !editsEntries) && Math.round(expected * 1000) !== Math.round(total * 1000)) {
    throw new Error('Tổng kg không khớp các lần cân. Hãy mở lại các lần cân để đối chiếu trước khi lưu.');
  }
  return { weightKg: entries.length || (editsEntries && !editsTotal) ? total : expected, ...(editsEntries ? { weightEntries: entries } : {}) };
}
