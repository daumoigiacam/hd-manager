export function normalizeVpsEmployee(item) {
  return { ...item, name: item.fullName ?? item.name ?? '',
    startDate: item.hireDate ? item.hireDate.slice(0, 10) : item.startDate ?? '',
    isArchived: Boolean(item.deletedAt || item.status === 'TERMINATED'),
    vpsEmployee: true,
  };
}

export function applyVpsEmployeeProfile(item, result, companyId) {
  if (!result?.id || result.id !== item.id || result.companyId !== companyId || !result.version) {
    throw new Error('VPS employee scope/version mismatch.');
  }
  return { ...item, ...result.profile, id: item.id, companyId,
    userId: result.userId, identityStatus: result.identityStatus,
    vpsProfileVersion: result.version, vpsEmployee: true,
  };
}

export async function hydrateVpsEmployeeProfiles(api, items, companyId, permissions = []) {
  if (!permissions.includes('hr.payroll.read')) return items;
  const hydrated = [];
  // Keep the request fan-out bounded and never replace a failed profile with zero salary.
  for (let offset = 0; offset < items.length; offset += 4) {
    const batch = await Promise.all(items.slice(offset, offset + 4).map(async item => {
      if (item.companyId !== companyId) throw new Error('VPS employee tenant mismatch.');
      return applyVpsEmployeeProfile(item, await api.getManagerEmployee(item.id), companyId);
    }));
    hydrated.push(...batch);
  }
  return hydrated;
}

export async function saveVpsEmployeeProfile(api, companyId, item, profile, requestId) {
  if (!companyId) throw new Error('VPS tenant context required.');
  if (item && (item.companyId !== companyId || !item.vpsProfileVersion)) {
    throw new Error('Ho so nhan su chua tai day du. Hay mo lai ho so truoc khi luu.');
  }
  const result = item
    ? await api.updateManagerEmployee(item.id, { version: item.vpsProfileVersion, profile })
    : await api.createManagerEmployee({ requestId, profile });
  return applyVpsEmployeeProfile(item ?? { id: result.id }, result, companyId);
}
