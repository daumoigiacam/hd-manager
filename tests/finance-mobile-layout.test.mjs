import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const financeStart = app.indexOf('function FinanceView(');
const financeEnd = app.indexOf('function DebtManagementViewLegacy', financeStart);
assert(financeStart >= 0 && financeEnd > financeStart, 'FinanceView source must be available.');
const finance = app.slice(financeStart, financeEnd);
const footer = readFileSync(new URL('../src/utils/footerNavigation.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

assert.match(app, /activeTab === 'finance' \? 'T\u1ed5ng k\u1ebft ng\u00e0y'/);
assert.match(app, /activeTab !== 'debt' && activeTab !== 'finance' && renderGlobalSearchTrigger\(\)/);
assert.match(finance, /finance-summary-metrics grid grid-cols-3 divide-x divide-white\/20/);
assert.match(styles, /\.mobile-app-shell \.finance-summary-metrics\s*\{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(finance, /label: 'T\u1ed5ng thu'[\s\S]*?label: 'T\u1ed5ng chi'[\s\S]*?label: 'L\u1ee3i nhu\u1eadn'/);
assert.doesNotMatch(finance, /Ch\u00eanh l\u1ec7ch thu chi trong ng\u00e0y/);
assert.doesNotMatch(finance, /groupedCashflowJournal/);
assert.match(finance, />Danh s\u00e1ch thu chi<\/h3>/);
assert.match(finance, /filteredTransactions\.map\(transaction =>/);
assert.match(finance, /const timestampDiff = getCashflowSortTimestamp\(b\) - getCashflowSortTimestamp\(a\)/);
assert.doesNotMatch(finance, /showCashflowCreateMenu/);
assert.match(finance, /relative hidden md:block[\s\S]*?aria-label="M\u1edf thao t\u00e1c thu chi"/);
assert.match(finance, /quickActionIntent\.type === 'income'/);
assert.match(finance, /quickActionIntent\.type === 'expense'/);
assert.match(app, /activeTab !== 'finance' && \(!canShowFloatingQuickActionButton \|\| !floatingQuickActionEnabled\)/);
assert.match(footer, /finance: Object\.freeze\(\['quick_create_income', 'quick_create_expense'\]\)/);

console.log('Finance mobile layout tests passed.');
