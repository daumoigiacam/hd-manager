import { createRoot } from 'react-dom/client';
import QRCode from 'qrcode';
import InvoiceTemplateEngine from '../../src/features/invoice-templates/InvoiceTemplateEngine.jsx';
import { buildInvoiceDemo } from '../../src/features/invoice-templates/invoiceTemplateModel.js';

const query = new URLSearchParams(window.location.search);
const templateId = query.get('template') || 'template-01';
const scenario = query.get('scenario') || 'base';
const model = buildInvoiceDemo(scenario, templateId);
window.__invoiceModel = model;
model.payment.qr = await QRCode.toDataURL(JSON.stringify({ account: model.payment.accountNumber, amount: model.payment.totalReceivable, memo: model.payment.transferContent }));
document.body.style.cssText = 'margin:0;background:#eef3f9;';
createRoot(document.getElementById('root')).render(<div className="invoice-preview-container invoice-print-target" style={{ width: '100%', containerType: 'inline-size', containerName: 'invoice-preview' }}><InvoiceTemplateEngine model={model} templateId={templateId} paper={query.get('paper') || 'a4'} /></div>);
