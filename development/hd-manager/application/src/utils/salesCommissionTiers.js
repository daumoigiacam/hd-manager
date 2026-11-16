export const MAX_COMMISSION_TIERS = 5;
export const COMMISSION_POLICY_KEYS = Object.freeze(['commissionTiers','commissionRate','commissionBaseMode','targetRevenue',
  'payrollPolicies','salaryPolicyHistory','salaryPolicyVersion','salaryPolicyEffectiveFrom']);

export function normalizeSalesCommissionTiers(value = [], baseRate = 0) {
  if (!Array.isArray(value) || value.length > MAX_COMMISSION_TIERS) throw Error('Chỉ được cấu hình tối đa 5 mốc hoa hồng.');
  if (!value.length) return [];
  if (!Number.isFinite(baseRate) || baseRate < 0 || baseRate > 1) throw Error('Tỷ lệ hoa hồng cơ bản phải từ 0 đến 100%.');
  const tiers = value.map(tier => {
    if (!tier || !Number.isSafeInteger(tier.minExcessRevenue) || tier.minExcessRevenue <= 0) throw Error('Mỗi mốc phải có số doanh thu vượt chỉ tiêu lớn hơn 0.');
    if (!Number.isFinite(tier.rate) || tier.rate < 0 || tier.rate > 1) throw Error('Tỷ lệ của mỗi mốc phải từ 0 đến 100%.');
    return {minExcessRevenue:tier.minExcessRevenue,rate:tier.rate};
  }).sort((a,b)=>a.minExcessRevenue-b.minExcessRevenue);
  for (let i=0;i<tiers.length;i++) {
    if (i && tiers[i].minExcessRevenue === tiers[i-1].minExcessRevenue) throw Error('Các mốc doanh thu không được trùng nhau.');
    if (tiers[i].rate < (i ? tiers[i-1].rate : baseRate)) throw Error('Tỷ lệ hoa hồng của mốc sau không được thấp hơn mốc trước.');
  }
  return tiers;
}

export function commissionTiersToDraft(tiers = []) {
  return Array.isArray(tiers) ? tiers.map(tier=>({minExcessRevenue:tier.minExcessRevenue,
    ratePercent:Number.isFinite(tier.rate) ? String(Number((tier.rate*100).toFixed(6))) : ''})) : [];
}
export function commissionTiersFromDraft(rows = [], baseRate = 0) {
  return normalizeSalesCommissionTiers(rows.map(row=>{
    const text=String(row.ratePercent??'').trim().replace(',','.');
    if (!/^\d+(\.\d+)?$/.test(text)) throw Error('Vui lòng nhập tỷ lệ % hợp lệ cho từng mốc.');
    return {minExcessRevenue:Number(row.minExcessRevenue),rate:Number(text)/100};
  }),baseRate);
}
export function salesCommissionBreakdown(revenue, target, baseRate, tiers = []) {
  const actual=Number(revenue),goal=Number(target);
  if (!Number.isFinite(actual) || !Number.isFinite(goal)) throw Error('Doanh thu hoặc chỉ tiêu chưa hợp lệ.');
  const excessRevenue=Math.max(0,actual-goal),normalized=normalizeSalesCommissionTiers(tiers,baseRate);
  let rate=baseRate,matchedThreshold=null;
  for (const tier of normalized) if (excessRevenue >= tier.minExcessRevenue) {rate=tier.rate;matchedThreshold=tier.minExcessRevenue;} else break;
  return {excessRevenue,rate,matchedThreshold,amount:excessRevenue*rate};
}
export function preserveCommissionPolicyFields(payload, employee) {
  for (const key of COMMISSION_POLICY_KEYS) {
    if (Object.hasOwn(employee||{},key)) payload[key]=employee[key];
    else delete payload[key];
  }
  return payload;
}
