export function calculateLoyaltyPoints(amount, settings = {}) {
  const revenue = Math.max(0, Number(amount) || 0);
  const value = Math.max(1, Number(settings.redeemValuePerPoint) || 1000);
  const rate = Math.min(100, Math.max(0, Number(settings.revenuePercent) || 0));
  return Math.floor(settings.earnMode === 'revenue_percent'
    ? revenue * rate / 100 / value
    : revenue / Math.max(1, Number(settings.earnAmountPerPoint) || 100000));
}
