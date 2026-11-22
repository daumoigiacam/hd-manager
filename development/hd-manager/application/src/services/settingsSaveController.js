// One immutable command per draft, retained after an uncertain acknowledgement.
export function createSettingsSaveController({isCurrent, makeId = () => crypto.randomUUID(), now = () => new Date().toISOString()}) {
  const intents = new Map(), busy = new Set();
  const error = (code, message) => Object.assign(new Error(message), {code});
  return {
    isBusy: scope => busy.has(scope),
    async save({scope, patch, baseCompany, save}) {
      if (!isCurrent(scope)) throw error('settings/stale-scope', 'Phiên cài đặt đã thay đổi. Vui lòng mở lại.');
      if (busy.has(scope)) throw error('settings/save-busy', 'Đang chờ xác nhận lần lưu trước.');
      if (typeof save !== 'function') throw error('settings/unavailable', 'Chưa có kết nối lưu cài đặt.');
      const keys = Object.keys(patch).sort();
      const expectedSettings = Object.fromEntries(keys.map(key => [key,
        Object.prototype.hasOwnProperty.call(baseCompany || {}, key)
          ? {exists: true, value: baseCompany[key]} : {exists: false}]));
      const signature = JSON.stringify([patch, expectedSettings]), key = JSON.stringify([scope, keys]);
      let intent = intents.get(key);
      if (!intent || intent.signature !== signature) {
        const [payload, expected] = JSON.parse(signature);
        intent = {signature, payload, options: {clientCommandId: makeId(), clientMutationAt: now(), expectedSettings: expected}};
        intents.set(key, intent);
      }
      busy.add(scope);
      try {
        const receipt = await save(intent.payload, intent.options);
        if (!isCurrent(scope)) throw error('settings/stale-scope', 'Phiên cài đặt đã thay đổi.');
        if (receipt?.success !== true || receipt.confirmed !== true || receipt.queued || receipt.pending) {
          throw error('settings/unconfirmed', receipt?.message || 'Máy chủ chưa xác nhận cài đặt. Vui lòng kiểm tra kết nối rồi lưu lại.');
        }
        return receipt;
      } finally { busy.delete(scope); }
    }
  };
}
