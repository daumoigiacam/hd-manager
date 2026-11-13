// Reuses the server's complete monthly reader and canonical fingerprint.
// Called inside the payroll transaction; never trusts a UI/page fingerprint.
async function bindPayrollTimesheets({tx,readContext,actor,monthKey,snapshots}) {
 const bindings=[];
 for(const snapshot of snapshots){
  const view=await readContext(tx,actor,snapshot.employeeId,monthKey);
  const confirmation=view.confirmation;
  if(!view.sourceComplete||view.sourceChanged||!confirmation?.employeeConfirmedAt||!confirmation.managerConfirmedAt||confirmation.status!=='MANAGER_CONFIRMED'||confirmation.sourceFingerprint!==view.sourceFingerprint||confirmation.revision!==view.revision){
   throw Object.assign(Error('Bảng công chưa được hai bên xác nhận hoặc nguồn đã thay đổi: '+snapshot.employeeId),{code:'payroll-timesheet-not-confirmed'});
  }
  bindings.push({payrollSnapshotId:snapshot.id,timesheetId:view.entityId,employeeId:view.employeeId,monthKey,sourceFingerprint:view.sourceFingerprint,snapshotVersion:view.revision,fingerprintAlgorithm:'attendance-period-canonical-json-sha256-v1',employeeConfirmedAt:confirmation.employeeConfirmedAt,employeeConfirmedBy:confirmation.employeeConfirmedBy,managerConfirmedAt:confirmation.managerConfirmedAt,managerConfirmedBy:confirmation.managerConfirmedBy});
 }
 return bindings;
}
module.exports={bindPayrollTimesheets};
