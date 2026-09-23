import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const foundation = readFileSync(new URL('../src/design-system/foundation.css', import.meta.url), 'utf8');
const debtStart = app.indexOf('function DebtManagementView(');
const debtEnd = app.indexOf('function CustomerPortalView(', debtStart);

assert(debtStart >= 0, 'Debt management view must exist.');
assert(debtEnd > debtStart, 'Debt management view must have a stable boundary.');

const debtView = app.slice(debtStart, debtEnd);

assert.match(debtView, /-mx-4 grid grid-cols-2 overflow-hidden/, 'Debt totals must run edge-to-edge in two halves.');
assert.equal((debtView.match(/min-h-\[96px\]/g) || []).length, 2, 'Debt totals must use two compact 96px panels.');
assert.equal((debtView.match(/text-\[12px\]/g) || []).length, 2, 'Debt total amounts must use 12px text.');
assert.doesNotMatch(debtView, /fontFamily:/, 'Debt totals must inherit the single shared platform font stack.');
assert.match(foundation, /--hd-font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,/, 'The shared platform font stack must resolve to Roboto on Android.');
assert.match(debtView, /<span>Khách nợ<\/span>[\s\S]*?debtCustomerCount} khách/, 'Receivable title and customer count must share one row.');
assert.match(debtView, /creditCustomerCount} khách[\s\S]*?<span>Nợ khách<\/span>/, 'Credit title and customer count must share one row.');
assert.doesNotMatch(debtView, /Tổng công nợ toàn bộ khách/, 'The legacy total-debt helper text must not render.');
assert.doesNotMatch(debtView, /Tiền dư cần theo dõi/, 'The legacy credit helper text must not render.');
assert.doesNotMatch(debtView, /Trở về danh sách/, 'Customer debt detail must start with customer information, not a return row.');

console.log('Debt overview layout tests passed.');
