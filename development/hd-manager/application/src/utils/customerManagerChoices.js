export function customerManagerChoices(salesEmployees = [], employees = [], selectedId = '') {
  if (!selectedId || salesEmployees.some(row => row.id === selectedId)) return salesEmployees;
  const assigned = employees.find(row => row.id === selectedId);
  return assigned ? [...salesEmployees, assigned] : [...salesEmployees, { id: selectedId, name: 'Nhân sự phụ trách hiện tại' }];
}
