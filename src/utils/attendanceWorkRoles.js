export function getWorkRoleRecord(record, primaryPosition, position = primaryPosition) {
  if (!record) return null;
  if (record.workRoles?.[position]) return record.workRoles[position];
  return position === primaryPosition && (!record.workRole || record.workRole === position)
    && (record.status || record.checkIn || record.checkOut) ? record : null;
}

export function buildWorkRoleAttendancePatch(employee, positions, position, fields) {
  const role = position || employee.position;
  if (!positions.includes(role)) throw new Error('Công việc chưa được phân công cho nhân sự này.');
  const record = { ...fields, workRole: role };
  return role === employee.position ? record : { workRoles: { [role]: record } };
}

export function employeeForWorkRole(employee = {}, position = employee?.position) {
  employee ||= {};
  if (position === employee.position) return employee;
  const components = employee.roleSalaryComponents || employee.departmentSalaryComponents || employee.salaryByDepartment;
  const component = (Array.isArray(components) ? components : [])
    .find(row => (row?.position || row?.department || row?.role) === position) || {};
  return {
    ...employee, position,
    shiftName: component.shiftName || '', shiftStart: component.shiftStart || '', shiftEnd: component.shiftEnd || '',
    graceMinutes: component.graceMinutes, missingAlertMinutes: component.missingAlertMinutes,
  };
}

export function attendanceForWorkRole(attendance = {}, employee = {}, position = employee?.position) {
  employee ||= {};
  return Object.fromEntries(Object.entries(attendance).map(([key, record]) => {
    if (!key.endsWith(`_${employee.id}`)) return [key, record];
    const roleRecord = getWorkRoleRecord(record, employee.position, position);
    return [key, roleRecord ? { ...roleRecord, companyId: record.companyId || roleRecord.companyId } : null];
  }));
}

export function getWorkRoleMonthEntries(attendance, employee, position, monthKey, calculateTiming) {
  const roleEmployee = employeeForWorkRole(employee, position);
  return Object.entries(attendance || {})
    .filter(([key, record]) => key.endsWith(`_${employee.id}`) && key.startsWith(`${monthKey}-`)
      && (!record?.companyId || !employee.companyId || record.companyId === employee.companyId))
    .flatMap(([key, record]) => {
      const roleRecord = getWorkRoleRecord(record, employee.position, position);
      if (!roleRecord) return [];
      const entry = {
        date: key.slice(0, 10), workRole: position, isPrimaryRole: position === employee.position,
        status: roleRecord.status || 'missing', checkIn: roleRecord.checkIn || null, checkOut: roleRecord.checkOut || null,
        checkInMethod: roleRecord.checkInMethod || '', checkOutMethod: roleRecord.checkOutMethod || '',
      };
      return [{ ...entry, ...calculateTiming(roleEmployee, entry) }];
    }).sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateWorkRoleSalary(amount, entries, monthDays, probationEndDate, probationRate = 1) {
  const cutoff = probationEndDate ? new Date(probationEndDate).getTime() : NaN;
  let workDaysProbation = 0;
  let workDaysOfficial = 0;
  for (const entry of entries) {
    if (!['present', 'late'].includes(entry.status) || entry.noSalaryDay) continue;
    if (new Date(`${entry.date}T00:00:00`).getTime() <= cutoff) workDaysProbation++;
    else workDaysOfficial++;
  }
  return {
    workDays: workDaysProbation + workDaysOfficial, workDaysProbation, workDaysOfficial,
    calculatedAmount: monthDays > 0 ? Math.round((amount / monthDays) * (workDaysOfficial + workDaysProbation * probationRate)) : 0,
  };
}
