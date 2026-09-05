import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from '@babel/parser';

const output = process.argv[2];
if (!output || !output.endsWith('.cjs')) throw Error('ORACLE_OUTPUT_PATH_REQUIRED');
const commit = '4fc19c19d53446add92576d47eb116f3fc0eb45a';
const source = execFileSync('git', ['show', `${commit}:src/App.jsx`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const names = new Set(['roundMoneyValue', 'parseLooseMoneyValue', 'normalizeCustomerOpeningDebtAmount', 'getCustomerOpeningDebtAmount', 'getCustomerOpeningDebtDate', 'buildCustomerOpeningDebtOrder', 'buildCustomerLedger', 'compareLedgerItems', 'CASHFLOW_APPROVAL_STATUS', 'UNCONFIRMED_PAYMENT_STATUSES', 'PAYMENT_INTENT_SOURCE_TYPES', 'isUnconfirmedPaymentIntent', 'requiresCashflowApproval', 'isCashflowOfficial', 'parseVietnameseDateTimeString', 'parseEntityTimestampValue', 'getEntityTimestamp', 'getDateKeyFromAnyValue', 'getPaymentRawPayosData', 'getPaymentDateCandidates', 'getPaymentDateSource', 'getPaymentDateKey', 'getPaymentTimestamp', 'toDateInputString', 'applyCustomerSupplierReconciliation']);
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
const declarations = [];
for (const node of ast.program.body) {
  if (node.type !== 'VariableDeclaration') continue;
  for (const d of node.declarations) if (d.id.type === 'Identifier' && names.delete(d.id.name)) declarations.push(`const ${source.slice(d.start, d.end)};`);
}
if (names.size) throw Error('EXACT_LEGACY_FUNCTIONS_REQUIRED');
// Labels have no financial effect; missing opening dates may not become today.
const code = `// Generated unchanged monetary functions from ${commit}:src/App.jsx\nconst getCustomerDisplayName = c => c.name;\nconst getTodayString = () => { throw Error('OPENING_DATE_REQUIRED'); };\n${declarations.join('\n')}\nmodule.exports = { buildCustomerLedger, applyCustomerSupplierReconciliation, getPaymentDateCandidates };\n`;
writeFileSync(output, code, { flag: 'wx' });
process.stdout.write(JSON.stringify({ sourceCommit: commit, sourceFile: 'src/App.jsx', functions: declarations.length, oracleSHA256: createHash('sha256').update(code).digest('hex') }) + '\n');
