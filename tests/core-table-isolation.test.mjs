import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';

test('extracted request rows retain grouping, permissions, selection and original cell commands', { timeout: 10000 }, async () => {
  const source = await readFile(new URL('../src/features/orders/OrderRequestTableRows.jsx', import.meta.url), 'utf8');
  const compiled = await transformWithEsbuild(source, 'OrderRequestTableRows.jsx', { jsx: 'transform' });
  const body = compiled.code.replace(/^import .*;\s*$/gm, '').replace('export default', 'return');
  const Icon = () => null;
  const Component = new Function('React', 'Check', 'X', body)(React, Icon, Icon);
  assert.equal(Component.$$typeof, Symbol.for('react.memo'));
  const calls = [];
  const row = { rowKey: 'r-0', requestId: 'r', customerName: 'Customer', productName: 'Product',
    quantity: 3, quantityUnit: 'Kg', unitPrice: 42, warehouseDispatchStatus: 'dispatched' };
  const props = {
    visibleRequestSalesGroups: [{ key: 'sales', salesName: 'Sales', customerGroups: [{ key: 'c', rows: [row, { ...row, rowKey: 'r-1' }] }] }],
    isOwnerAccount: true, selectedRowKey: row.rowKey, canEditGeneral: false, canEditQuantity: false,
    canEditSizePrice: false, canDelete: false,
    openOrderCellEditor: (...args) => calls.push(args), updateCustomerPortalOrderApproval: (...args) => calls.push(args),
    formatOrderRequestBranchLabel: r => r.branchName, getOrderRequestRowProductLabel: r => r.productName,
    formatDateLabel: v => v, getOrderRequestRowNoteText: r => r.note,
    formatSheetQuantity: (q, unit) => `${q} ${unit}`, formatOrderRequestSizeCell: () => '', formatCurrency: v => `${v}`,
  };
  const html = renderToStaticMarkup(React.createElement(Component, props));
  assert.match(html, /rowSpan="2"/i);
  assert.match(html, /3 Kg/);
  assert.match(html, /bg-emerald-50\/70/);
  const buttons = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!React.isValidElement(node)) return;
    if (node.type === 'button') buttons.push(node);
    visit(node.props.children);
  };
  visit(Component.type(props));
  assert.ok(buttons.length > 0 && buttons.every(button => button.props.disabled));
  const price = buttons.find(button => button.props.children === '42');
  assert.ok(price);
  const event = {};
  price.props.onClick(event);
  assert.deepEqual(calls, [[row, 'unitPrice', event]]);
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /openOrderCellEditor=\{openRequestTableCell\}/);
  assert.match(app, /const openRequestTableCell = useCurrentCallback\(openOrderCellEditor\)/);
});
