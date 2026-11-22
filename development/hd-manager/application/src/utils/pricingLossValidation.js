// Validate dimensional constraints without changing stored standards or formulas.
export function assertPricingLossStandards(rules = {}) {
  const groups = rules.lossStageGroups && Object.keys(rules.lossStageGroups).length
    ? rules.lossStageGroups : {current: rules.lossStages || []};
  const number = value => typeof value === 'number' ? value : Number(String(value ?? '').trim().replace(',', '.'));
  for (const [group, stages] of Object.entries(groups)) {
    for (const [index, stage] of (Array.isArray(stages) ? stages : []).entries()) {
      const input = number(stage.inputWeight), output = number(stage.outputWeight);
      const hasLoss = stage.lossWeight !== undefined && stage.lossWeight !== null && String(stage.lossWeight).trim() !== '';
      const loss = hasLoss ? number(stage.lossWeight) : input - output;
      if (![input, output, loss].every(Number.isFinite) || input < 0 || output < 0 || loss < 0 || output > input || loss > input) {
        const error = new Error(`Định mức ${stage.name || `dòng ${index + 1}`} (${group}): kg hao hụt và kg đầu ra phải từ 0 đến kg đầu vào. Vui lòng chỉnh lại trước khi lưu.`);
        error.code = 'pricing_invalid_loss_standard';
        throw error;
      }
    }
  }
  return rules;
}
