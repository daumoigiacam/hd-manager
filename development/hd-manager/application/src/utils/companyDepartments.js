const normalizeDepartmentName = (value) =>
  `${value || ''}`.trim().replace(/\s+/g, ' ');

const departmentNameKey = (value) =>
  normalizeDepartmentName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi');

const makeDepartmentId = (name, index) => {
  const slug = departmentNameKey(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `department_${slug || index + 1}`;
};

export const normalizeCompanyDepartments = (source = []) => {
  if (!Array.isArray(source)) return [];
  const ids = new Set();
  const names = new Set();
  return source.reduce((departments, item, index) => {
    const name = normalizeDepartmentName(
      typeof item === 'string' ? item : item?.name || item?.label,
    );
    const nameKey = departmentNameKey(name);
    if (!name || names.has(nameKey)) return departments;
    const requestedId = `${typeof item === 'object' ? item?.id || '' : ''}`.trim();
    let id = requestedId || makeDepartmentId(name, index);
    let suffix = 2;
    while (ids.has(id)) id = `${requestedId || makeDepartmentId(name, index)}_${suffix++}`;
    ids.add(id);
    names.add(nameKey);
    departments.push({
      id,
      name,
      createdAt:
        typeof item === 'object' ? `${item?.createdAt || ''}` : '',
      updatedAt:
        typeof item === 'object' ? `${item?.updatedAt || ''}` : '',
    });
    return departments;
  }, []);
};

export const upsertCompanyDepartment = (
  source,
  { id = '', name = '', now = '', nextId = '' } = {},
) => {
  const departments = normalizeCompanyDepartments(source);
  const normalizedName = normalizeDepartmentName(name);
  if (!normalizedName) return { departments, error: 'Vui lòng nhập tên bộ phận.' };
  const duplicate = departments.find(
    (department) =>
      department.id !== id &&
      departmentNameKey(department.name) === departmentNameKey(normalizedName),
  );
  if (duplicate)
    return { departments, error: 'Tên bộ phận này đã tồn tại.' };
  if (id && !departments.some((department) => department.id === id))
    return { departments, error: 'Không tìm thấy bộ phận cần chỉnh sửa.' };

  if (id) {
    return {
      departments: departments.map((department) =>
        department.id === id
          ? { ...department, name: normalizedName, updatedAt: now }
          : department,
      ),
      error: '',
    };
  }

  const newId = `${nextId || `department_${Date.now().toString(36)}`}`;
  if (departments.some((department) => department.id === newId))
    return { departments, error: 'Mã bộ phận đã tồn tại, vui lòng thử lại.' };
  return {
    departments: [
      ...departments,
      { id: newId, name: normalizedName, createdAt: now, updatedAt: now },
    ],
    error: '',
  };
};

export const removeCompanyDepartment = (
  source,
  { id = '', assignedDepartmentIds = [] } = {},
) => {
  const departments = normalizeCompanyDepartments(source);
  if (!departments.some((department) => department.id === id))
    return { departments, error: 'Không tìm thấy bộ phận cần xóa.' };
  if (assignedDepartmentIds.includes(id))
    return {
      departments,
      error: 'Bộ phận đang có nhân sự. Hãy chuyển nhân sự sang bộ phận khác trước.',
    };
  return {
    departments: departments.filter((department) => department.id !== id),
    error: '',
  };
};
