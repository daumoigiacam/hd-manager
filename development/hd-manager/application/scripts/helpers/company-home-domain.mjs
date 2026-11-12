import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {extractEmployeeHomeDomain} from './employee-home-domain-extraction.mjs';
export const COMPANY_HOME_ROOTS=['buildDashboardPayrollCostRows','buildCustomerReconciledLedgerMap','isCashflowOfficial','resolveCashflowDateKey','hasCompanyRolePermissionAction','getLockedPayrollPeriod','buildOrderDuplicateSignature'];
export function companyHomeDomainPlugin(roots=COMPANY_HOME_ROOTS){const id='\0hd-company-home-domain';return {name:'hd-company-home-domain',resolveId(name){if(name==='@hd/company-home-domain')return id;},async load(name){if(name!==id)return;const file=path.resolve('src/App.jsx');this.addWatchFile(file);return 'import {BusinessDate as Date} from '+JSON.stringify(path.resolve('src/utils/businessDate.js').replaceAll('\\','/'))+';\n'+extractEmployeeHomeDomain(await readFile(file,'utf8'),path.dirname(file),roots);}};}
