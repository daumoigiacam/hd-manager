// Frozen from measured Acceptance 7dd524b4, before employee-first filtering.
export const buildBaselineAttendanceCollector = ({normalizeEmployeeReviewMonthKey,getEntityTimestamp}) => ((attendance = {}, empId = '', monthKey = '', companyId = '') => {
  const records = Array.isArray(attendance)
    ? attendance.map(record => ({ key: record?.id || '', record }))
    : Object.entries(attendance || {}).map(([key, record]) => ({ key, record }));

  return records
    .map(({ key, record }) => {
      // Attendance payroll rows are keyed by work date and employee. Prefer
      // that document identity so legacy record.date values cannot move the
      // same check-in into a different shift day during evaluation.
      const documentId = `${key || record?.id || ''}`;
      const documentIdMatch = documentId.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/);
      const employeeId = record?.empId
        || record?.employeeId
        || record?.targetEmployeeId
        || documentIdMatch?.[2]
        || '';
      const date = documentIdMatch?.[1]
        || record?.date
        || record?.dateKey
        || record?.monthKey
        || documentIdMatch?.[1]
        || record?.createdAt
        || record?.updatedAt
        || getEntityTimestamp(record);
      return {
        ...(record || {}),
        id: documentId || record?.id,
        employeeId: record?.employeeId || employeeId,
        date: documentIdMatch?.[1] || record?.date || date
      };
    })
    .filter(record => (
      `${record?.employeeId || record?.empId || ''}` === `${empId || ''}` &&
      normalizeEmployeeReviewMonthKey(record?.date || record?.dateKey || record?.createdAt || getEntityTimestamp(record)) === monthKey &&
      (!companyId || `${record?.companyId || record?.appId || record?.tenantId || ''}` === `${companyId}`)
    ));
});
