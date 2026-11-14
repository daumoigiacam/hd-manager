// Bind the existing salary workflow to HD Manager's Firestore cashflow only.
import {createPayrollSettlements} from './payrollSettlements.cjs';
import {createPayrollCashflowSource} from './payrollCashflowSource.cjs';
import {getCompanyBankAccounts} from '../development/hd-manager/application/src/features/settings/companyBankAccounts.js';
import {plainPayroll} from '../development/hd-manager/application/src/features/payroll/offlinePayrollProtocol.js';
import {applyPayrollAdjustmentsToSnapshots} from '../development/hd-manager/application/src/utils/payrollAdjustment.js';
import {inspectPayrollSnapshot} from '../development/hd-manager/application/src/utils/payrollSnapshotIntegrity.js';
import {deriveSalarySettlementAccess} from '../development/hd-manager/application/src/features/payroll/payrollSettlementPolicy.js';
export function deriveFirestoreSalaryAccess(subject,hasAction){
 const access=deriveSalarySettlementAccess(subject,hasAction);
 const approveFinancial=hasAction(subject,'finance','approve_driver_cashflow')===true;
 return {...access,pay:access.pay&&approveFinancial,approveFinancial,position:subject.employee?.position||subject.employee?.role||'staff'};
}
export function createFirestorePayrollSettlements(options){
 return createPayrollSettlements({...options,
  financialSource:createPayrollCashflowSource({...options,getCompanyBankAccounts}),
  loadDomain:async()=>({plainPayroll,applyPayrollAdjustmentsToSnapshots,inspectPayrollSnapshot})});
}
