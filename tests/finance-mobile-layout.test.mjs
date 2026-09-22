import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const financeStart = app.indexOf('function FinanceView(');
const financeEnd = app.indexOf('function DebtManagementViewLegacy', financeStart);
assert(financeStart >= 0 && financeEnd > financeStart, 'FinanceView source must be available.');
const finance = app.slice(financeStart, financeEnd);

assert.match(finance, /flex items-center justify-between gap-3[\s\S]*?T\u1ed5ng k\u1ebft ng\u00e0y[\s\S]*?!text-white/);
assert.doesNotMatch(finance, /Ch\u00eanh l\u1ec7ch thu chi trong ng\u00e0y/);
assert.doesNotMatch(finance, /groupedCashflowJournal/);
assert.match(finance, />Danh s\u00e1ch thu chi<\/h3>/);
assert.match(finance, /filteredTransactions\.map\(transaction =>/);
assert.match(finance, /const timestampDiff = getCashflowSortTimestamp\(b\) - getCashflowSortTimestamp\(a\)/);
assert.match(finance, /bottom-\[calc\(76px\+env\(safe-area-inset-bottom\)\)\]/);
assert.match(finance, /aria-label="M\u1edf thao t\u00e1c thu chi"/);
assert.match(finance, /showCashflowCreateMenu/);
assert.match(finance, /Kho\u1ea3n thu/);
assert.match(finance, /Kho\u1ea3n chi/);

console.log('Finance mobile layout tests passed.');
