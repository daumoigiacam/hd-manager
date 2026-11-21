import {parseAssetNumber} from './assetMutationIntegrity.js';

const fuelAmount = draft => {
  try {
    return Math.round(parseAssetNumber(draft.liters) * parseAssetNumber(draft.unitPrice, {money: true}));
  } catch {
    return null;
  }
};

// An invoice total entered explicitly remains authoritative. Older fuel logs
// whose total equals litres × price continue to follow those two inputs.
export function updateAssetCostDraft(draft, field, value) {
  const next = {...draft, [field]: value};
  if (field === 'amount') return {...next, amountMode: value === '' ? 'calculated' : 'manual'};
  if (!['liters', 'unitPrice'].includes(field) || next.type !== 'fuel') return next;
  let automatic = draft.amountMode === 'calculated' || draft.amount === '';
  if (!draft.amountMode && !automatic) {
    try { automatic = parseAssetNumber(draft.amount, {money: true}) === fuelAmount(draft); } catch { /* Keep invalid input for validation. */ }
  }
  if (!automatic) return next;
  const amount = fuelAmount(next);
  return {...next, amountMode: 'calculated', amount: amount === null || amount === 0 ? '' : amount};
}
