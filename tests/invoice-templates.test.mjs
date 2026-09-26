import assert from 'node:assert/strict';
import {
  buildInvoiceDemo,
  buildInvoiceViewModel,
  DEFAULT_INVOICE_TEMPLATE_ID,
  INVOICE_TEMPLATES,
  normalizeInvoiceTemplateId,
  resolveInvoiceTemplateId,
} from '../src/features/invoice-templates/invoiceTemplateModel.js';

assert.equal(INVOICE_TEMPLATES.length, 10);
assert.equal(new Set(INVOICE_TEMPLATES.map((template) => template.id)).size, 10);
assert.equal(normalizeInvoiceTemplateId('invalid'), DEFAULT_INVOICE_TEMPLATE_ID);
assert.equal(resolveInvoiceTemplateId({ invoiceTemplateId: 'template-07' }, {}), 'template-07');
assert.equal(resolveInvoiceTemplateId({ invoiceTemplateId: 'template-07' }, { invoiceTemplateOverride: 'template-03' }), 'template-03');
assert.equal(resolveInvoiceTemplateId({ invoiceTemplateId: 'template-07' }, { invoiceTemplateOverride: null }), 'template-07');

const expected = {
  base: [1818000, 0, 0], discount: [1718000, 0, 0], promotion: [1768000, 0, 0],
  fee: [1848000, 0, 0], combined: [1698000, 500000, 200000],
  'old-debt': [1818000, 0, 200000], partial: [1818000, 500000, 0], paid: [1818000, 1818000, 0],
};
for (const template of INVOICE_TEMPLATES) {
  for (const [scenario, [total, paid, oldDebt]] of Object.entries(expected)) {
    const model = buildInvoiceDemo(scenario, template.id);
    assert.equal(model.templateId, template.id, `${template.id} ${scenario} template`);
    assert.equal(model.pricing.subtotal, 1818000, `${template.id} ${scenario} subtotal`);
    assert.equal(model.pricing.grandTotal, total, `${template.id} ${scenario} total`);
    assert.equal(model.payment.paid, paid, `${template.id} ${scenario} paid`);
    assert.equal(model.payment.invoiceDebt, total - paid, `${template.id} ${scenario} invoice debt`);
    assert.equal(model.payment.oldDebt, oldDebt, `${template.id} ${scenario} old debt`);
    assert.equal(model.payment.totalReceivable, total - paid + oldDebt, `${template.id} ${scenario} receivable`);
    assert.equal(model.items[0].quantity, 30.3);
    assert.equal(model.items[0].unitPrice, 60000);
    assert.equal(model.items[0].amount, 1818000);
    assert.equal(model.pricing.discountAmount > 0, ['discount', 'combined'].includes(scenario));
    assert.equal(model.pricing.promotionAmount > 0, ['promotion', 'combined'].includes(scenario));
    assert.equal(model.pricing.fees.length > 0, ['fee', 'combined'].includes(scenario));
  }
}

const preserved = buildInvoiceViewModel({
  company: { invoiceTemplateId: 'template-09', name: 'Công ty thử' },
  customer: { name: 'Khách A' },
  order: { id: 'x', amount: 1698000, discountType: 'percent', discountValue: 5, discountAmount: 100000, promotionAmount: 50000 },
  items: [{ productName: 'Hàng A', quantity: 30.3, unit: 'kg', unitPrice: 60000, amount: 1818000 }],
  fees: [{ name: 'Phí giao hàng', amount: 30000 }],
  payment: { paid: 500000, invoiceDebt: 1198000, oldDebt: 200000, totalReceivable: 1398000 },
});
assert.equal(preserved.pricing.grandTotal, 1698000);
assert.equal(preserved.pricing.discountType, 'percent');
assert.equal(preserved.pricing.discountValue, 5);
assert.equal(preserved.payment.totalReceivable, 1398000);
assert.equal(preserved.company.name, 'Công ty thử');
assert.equal(preserved.customer.name, 'Khách A');
console.log('Invoice templates: 10 layouts x 8 pricing/payment cases passed.');
