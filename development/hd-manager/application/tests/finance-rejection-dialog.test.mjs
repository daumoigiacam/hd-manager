import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { transformSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const declaration = parse(source, { sourceType: 'module', plugins: ['jsx'] }).program.body
  .find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'FinanceView');
assert.ok(declaration, 'Use the active FinanceView, not FinanceViewLegacy/Home');
const code = transformSync(source.slice(declaration.start, declaration.end), { loader: 'jsx', jsx: 'automatic', format: 'cjs' }).code;
const day = '2026-11-21';
const nodes = (node, predicate, result = []) => {
  if (!node || typeof node !== 'object') return result;
  if (predicate(node)) result.push(node);
  React.Children.forEach(node.props?.children, child => nodes(child, predicate, result));
  return result;
};
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : React.Children.toArray(node?.props?.children).map(text).join('');
const dialog = tree => nodes(tree, node => node.props?.role === 'dialog' && node.props['aria-label'] === 'Không duyệt thu chi')[0];
const input = (tree, label) => nodes(tree, node => node.type === 'input' && node.props['aria-label'] === label)[0];

function fixture(kind = 'payment', save = async () => {}, permission = true) {
  const slots = [], calls = [];
  let index = 0;
  const state = initial => {
    const slot = index++;
    if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
    return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
  };
  const noop = () => null;
  const normalize = value => String(value ?? '');
  const env = {
    React, useState: state, useRef: initial => state({ current: initial })[0], useMemo: calculate => calculate(), useEffect() {},
    useAppScreenBack() {}, useDismissSearchOnOutsideClick() {},
    usePagedList: rows => ({ items: rows, page: 1, pageSize: 20, totalItems: rows.length, totalPages: 1 }), ListPagination: noop,
    ExpenseCategoryPicker: noop, MinusCircle: noop, Plus: noop, PlusCircle: noop, Search: noop, Trash2: noop, X: noop,
    getTodayString: () => day, getDateRangeForPeriod: date => ({ startDate: date, endDate: date }), buildPeriodLabel: () => day,
    financeOrderCodeCache: () => ({ complete: false }), buildOrderMemoCandidates: () => [], buildCustomerLedgerMap: () => ({}),
    normalizeLookupText: value => normalize(value).toLowerCase(), compareVietnameseText: (left, right) => left.localeCompare(right),
    getCustomerDisplayName: row => row.name, getAssetDisplayLabel: row => row.name || '', normalizeCustomerPhone: normalize,
    isEmployeeDriverPosition: () => false, isFuelExpenseCategory: () => false, isPayosPaymentRecord: () => false,
    isCustomerDebtRepayment: () => false, requiresCashflowApproval: row => row.requiresApproval,
    isCashflowOfficial: row => row.approvalStatus === 'approved',
    getCashflowApprovalMeta: row => ({ status: row.approvalStatus, label: 'Chờ xác nhận', classes: '' }),
    CASHFLOW_APPROVAL_STATUS: { approved: 'approved', pending: 'pending_handover', rejected: 'rejected' },
    resolveCashflowDateKey: row => row.date, getEntityTimestamp: row => Date.parse(row.date),
    getPaymentMethodLabel: row => row.method || 'Tiền mặt', getPaymentSourceLabel: () => 'Tài xế thu', getPaymentReceivingBankLabel: () => '',
    formatCurrency: normalize, formatInputCurrency: normalize, parseLooseMoneyValue: Number,
    parseInputCurrency: value => Number(String(value).replace(/\D/g, '')), parseDateInputValue: value => new Date(value),
    normalizeExpenseCategoryLabel: normalize, normalizeLeadingLabel: normalize, capitalizeFirst: normalize, capitalizeFirstPreservingSpacing: normalize,
    getFriendlyFirebaseErrorMessage: error => error.message, changeExpenseCategory: noop, crypto: globalThis.crypto,
    window: { alert: message => assert.fail(message), confirm: () => true },
  };
  const View = Function('require', ...Object.keys(env), `${code};return FinanceView;`)(createRequire(import.meta.url), ...Object.values(env));
  const original = Object.freeze({ id: 'voucher-1', amount: 50000, date: day, customerId: 'customer', empId: 'employee',
    note: 'Original draft', category: 'Nhiên liệu', method: 'Tiền mặt', requiresApproval: true, approvalStatus: 'pending_handover' });
  const edit = type => async (id, patch) => { calls.push({ type, id, patch }); return save(type, id, patch); };
  const props = { isAccounting: true, employee: { id: 'employee', companyId: 'tenant' },
    expenses: kind === 'expense' ? [original] : [], payments: kind === 'payment' ? [original] : [], orders: [],
    employees: [{ id: 'employee', name: 'Kế toán' }], customers: [{ id: 'customer', name: 'Khách QA' }],
    canApproveCashflow: permission, onEditExpense: edit('expense'), onEditPayment: edit('payment') };
  const render = () => { index = 0; return View(props); };
  const open = () => {
    const tree = render();
    assert.equal(dialog(tree), undefined);
    const button = nodes(tree, node => node.type === 'button' && text(node) === 'Không duyệt')[0];
    assert.ok(button, 'The actual transaction row exposes Không duyệt');
    button.props.onClick({ stopPropagation() {} });
    const opened = render();
    assert.ok(dialog(opened), 'Opening rejection must render an accessible dialog');
    return opened;
  };
  return { render, open, calls, original };
}

test('active FinanceView renders the accessible rejection dialog after the actual row action for income and expense', () => {
  for (const kind of ['payment', 'expense']) {
    const f = fixture(kind), tree = f.open(), modal = dialog(tree);
    const html = renderToStaticMarkup(tree);
    assert.equal(modal.props['aria-modal'], 'true');
    assert.match(html, /role="dialog"/);
    assert.match(html, /aria-label="Không duyệt thu chi"/);
    assert.equal(input(modal, 'Số tiền thực tế').props.value, '50000');
    assert.equal(input(modal, 'Ghi chú không duyệt').props.value, 'Original draft');
    assert.equal(Boolean(input(modal, 'Loại chi')), kind === 'expense');
    assert.equal(f.calls.length, 0, 'Opening the dialog must not mutate the voucher');
  }
});

test('actual rejection submit retains dialog and edited draft on server failure and renders an alert', async () => {
  for (const kind of ['payment', 'expense']) {
    let attempts = 0;
    const f = fixture(kind, async () => { if (attempts++ === 0) throw new Error('Server rejected save'); });
    let modal = dialog(f.open());
    input(modal, 'Số tiền thực tế').props.onChange({ target: { value: '47000' } });
    input(modal, 'Ghi chú không duyệt').props.onChange({ target: { value: 'Keep this draft' } });
    if (kind === 'expense') input(modal, 'Loại chi').props.onChange({ target: { value: 'Chi cầu đường' } });
    modal = dialog(f.render());
    await modal.props.onSubmit({ preventDefault() {} });
    const tree = f.render();
    modal = dialog(tree);
    assert.ok(modal);
    assert.equal(input(modal, 'Số tiền thực tế').props.value, '47000');
    assert.equal(input(modal, 'Ghi chú không duyệt').props.value, 'Keep this draft');
    if (kind === 'expense') assert.equal(input(modal, 'Loại chi').props.value, 'Chi cầu đường');
    assert.match(renderToStaticMarkup(tree), /role="alert"[^>]*>Server rejected save/);
    assert.deepEqual(f.calls[0], { type: kind, id: 'voucher-1', patch: {
      amount: 47000, approvalStatus: 'rejected', ...(kind === 'expense' ? { category: 'Chi cầu đường' } : {}), note: 'Keep this draft',
    } });
    assert.equal(f.original.amount, 50000);
    assert.equal(f.original.approvalStatus, 'pending_handover');
    assert.equal(input(modal, 'Số tiền thực tế').props.disabled, false);
    await modal.props.onSubmit({ preventDefault() {} });
    assert.equal(f.calls.length, 2, 'Failure must release the guard so the retained draft can be retried');
    assert.equal(dialog(f.render()), undefined);
  }
});

test('actual in-flight guard prevents double-submit and close while saving, then releases on confirmed success', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const f = fixture('payment', () => pending);
  const modal = dialog(f.open());
  const saving = modal.props.onSubmit({ preventDefault() {} });
  await modal.props.onSubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1);
  const busy = dialog(f.render());
  assert.ok(busy);
  for (const node of nodes(busy, node => node.type === 'input' || node.type === 'button')) assert.equal(node.props.disabled, true);
  const cancel = nodes(busy, node => node.type === 'button' && text(node) === 'Hủy')[0];
  cancel.props.onClick();
  assert.ok(dialog(f.render()), 'Even a programmatic close cannot discard an in-flight draft');
  resolve(); await saving;
  assert.equal(dialog(f.render()), undefined);
  const reopened = dialog(f.open());
  await reopened.props.onSubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 2, 'The guard must release after confirmed success');
  assert.equal(dialog(f.render()), undefined);
});

test('invalid rejection amount keeps the dialog open without a write; absent approval permission hides the action', async () => {
  const f = fixture();
  let modal = dialog(f.open());
  input(modal, 'Số tiền thực tế').props.onChange({ target: { value: '' } });
  modal = dialog(f.render());
  await modal.props.onSubmit({ preventDefault() {} });
  assert.ok(dialog(f.render()));
  assert.equal(f.calls.length, 0);
  assert.match(renderToStaticMarkup(f.render()), /Số tiền thực tế phải lớn hơn 0/);
  const denied = fixture('payment', async () => {}, false).render();
  assert.equal(dialog(denied), undefined);
  assert.equal(nodes(denied, node => node.type === 'button' && text(node) === 'Không duyệt').length, 0);
});
