import { CheckCircle2, Circle, FileText, MapPin, Package, Phone, QrCode, Truck, UserRound, Wallet } from 'lucide-react';
import { normalizeInvoiceTemplateId } from './invoiceTemplateModel.js';
import './invoiceTemplates.css';

const money = (value) => `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)} đ`;
const quantity = (value) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(Number(value) || 0);
const dateLabel = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
    : `${value || ''}`;
};
const statusLabel = (model) => {
  if (model.payment.invoiceDebt <= 0) return 'ĐÃ THANH TOÁN';
  if (model.payment.paid > 0) return 'THANH TOÁN MỘT PHẦN';
  return 'CHƯA THANH TOÁN';
};

function Brand({ model, compact = false }) {
  return <div className={`invoice-brand ${compact ? 'invoice-brand--compact' : ''}`}>
    {model.company.logo ? <img src={model.company.logo} alt="Logo công ty" /> : <span className="invoice-brand__fallback">HD</span>}
    <div><strong>{model.company.name}</strong><span>{model.company.slogan}</span></div>
  </div>;
}

function Heading({ model, compact = false }) {
  return <div className={`invoice-heading ${compact ? 'invoice-heading--compact' : ''}`}>
    <strong>HÓA ĐƠN BÁN HÀNG</strong>
    <span>#{model.invoiceCode} <i aria-hidden="true">·</i> {dateLabel(model.createdAt)}</span>
    <small className={`invoice-heading__status ${model.payment.invoiceDebt <= 0 ? 'is-paid' : ''}`}>{statusLabel(model)}</small>
  </div>;
}

function Customer({ model, employee = true }) {
  return <section className="invoice-customer" aria-label="Thông tin khách hàng">
    <div className="invoice-customer__icon"><UserRound size={20} /></div>
    <div className="invoice-customer__main"><small>Khách hàng</small><strong>{model.customer.name}</strong>
      {model.customer.phone && <span><Phone size={12} />{model.customer.phone}</span>}
      {model.customer.address && <span><MapPin size={12} />{model.customer.address}</span>}
    </div>
    {employee && <div className="invoice-customer__aside">
      {model.employee.name && <span>Nhân viên <b>{model.employee.name}</b></span>}
      {model.delivery.driver && <span>Người giao <b>{model.delivery.driver}</b></span>}
      <span>Trạng thái <b className={`invoice-status ${model.payment.invoiceDebt <= 0 ? 'invoice-status--paid' : ''}`}>{statusLabel(model)}</b></span>
    </div>}
  </section>;
}

function ProductImage({ item }) {
  return <div className="invoice-product-image">
    {item.image ? <img src={item.image} alt={item.productName} loading="eager" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.parentElement.classList.add('invoice-product-image--missing'); }} /> : <Package size={21} />}
  </div>;
}

function Items({ model, numbered = false }) {
  return <section className="invoice-items" aria-label="Sản phẩm">
    <div className="invoice-items__head"><span>{numbered ? 'STT · Sản phẩm' : 'Sản phẩm'}</span><span>SL / ĐVT</span><span>Đơn giá</span><span>Thành tiền</span></div>
    {model.items.map((item, index) => <div className="invoice-items__row" key={item.id || index}>
      <div className="invoice-items__product">{numbered && <small>{index + 1}</small>}<ProductImage item={item} /><strong>{item.productName}</strong></div>
      <span>{quantity(item.quantity)} {item.unit}</span><span>{money(item.unitPrice)}</span><b>{money(item.amount)}</b>
    </div>)}
    {model.items.length === 0 && <p className="invoice-items__empty">Chưa có sản phẩm.</p>}
  </section>;
}

function Pricing({ model, large = false }) {
  const { pricing, payment } = model;
  return <section className={`invoice-pricing ${large ? 'invoice-pricing--large' : ''}`} aria-label="Tổng hợp thanh toán">
    <div className="invoice-pricing__subtotal"><span>Tiền hàng</span><b>{money(pricing.subtotal)}</b></div>
    {pricing.discountAmount > 0 && <div className="invoice-pricing__adjust"><span>{pricing.discountType === 'percent' && pricing.discountValue ? `Chiết khấu ${quantity(pricing.discountValue)}%` : 'Giảm giá'}</span><b>-{money(pricing.discountAmount)}</b></div>}
    {pricing.promotionAmount > 0 && <div className="invoice-pricing__adjust"><span>{pricing.promotionName ? `Khuyến mãi · ${pricing.promotionName}` : 'Khuyến mãi'}</span><b>-{money(pricing.promotionAmount)}</b></div>}
    {pricing.fees.map((fee, index) => <div className="invoice-pricing__fee" key={`${fee.name}-${index}`}><span>{fee.name}</span><b>+{money(fee.amount)}</b></div>)}
    <div className="invoice-pricing__total"><span>Tổng cộng</span><strong>{money(pricing.grandTotal)}</strong></div>
    <div className="invoice-pricing__paid"><span>Đã thu</span><b>{money(payment.paid)}</b></div>
    {payment.oldDebt > 0 && <div className="invoice-pricing__olddebt"><span>Công nợ cũ</span><b>{money(payment.oldDebt)}</b></div>}
    <div className="invoice-pricing__due"><span>{payment.oldDebt > 0 ? 'Tổng phải thu' : 'Còn phải thu'}</span><strong>{money(payment.totalReceivable)}</strong></div>
    {payment.oldDebt > 0 && <div className="invoice-pricing__sub"><span>Còn nợ đơn này</span><b>{money(payment.invoiceDebt)}</b></div>}
  </section>;
}

function Bank({ model, compact = false }) {
  const { payment } = model;
  const hasBank = Boolean(payment.bankName || payment.accountNumber);
  return <section className={`invoice-bank ${compact ? 'invoice-bank--compact' : ''}`} aria-label="Thanh toán chuyển khoản">
    <div className="invoice-bank__qr">{payment.qr ? <img src={payment.qr} alt={`QR thanh toán ${money(payment.totalReceivable)}`} /> : <QrCode size={46} aria-label="Chưa có mã QR" />}</div>
    <div className="invoice-bank__details"><strong>{hasBank ? payment.bankName || 'Ngân hàng' : 'Chưa cấu hình tài khoản nhận tiền'}</strong>
      {payment.accountName && <span>{payment.accountName}</span>}
      {payment.accountNumber && <b>{payment.accountNumber}</b>}
      {payment.transferContent && <small>Nội dung: {payment.transferContent}</small>}
      {payment.totalReceivable > 0 && <small>Số tiền: {money(payment.totalReceivable)}</small>}
    </div>
  </section>;
}

function Footer({ model, signature = false }) {
  const signatureImage = /^(data:image\/|https?:\/\/|\/)/i.test(model.signature || '');
  return <footer className="invoice-footer">
    <p>Cảm ơn quý khách đã tin tưởng!</p>
    {signature && <div className="invoice-signature"><span>Người lập đơn</span>{signatureImage ? <img src={model.signature} alt="Chữ ký người lập đơn" /> : <strong>{model.signature || model.employee.name || model.company.name}</strong>}</div>}
    <div className="invoice-footer__company">{model.company.name}{model.company.phone ? ` · ${model.company.phone}` : ''}{model.company.address ? ` · ${model.company.address}` : ''}</div>
  </footer>;
}

function PaymentHero({ model, label = 'TỔNG CỘNG' }) {
  return <div className="invoice-payment-hero"><span>{label}</span><strong>{money(model.pricing.grandTotal)}</strong><small>{statusLabel(model)}</small></div>;
}

function Timeline({ model }) {
  const delivered = ['delivered', 'completed', 'paid'].includes(model.delivery.status.toLowerCase());
  const paid = model.payment.invoiceDebt <= 0;
  const stages = [
    { label: 'Tạo đơn', icon: CheckCircle2, done: true, detail: dateLabel(model.createdAt) },
    { label: 'Giao hàng', icon: Truck, done: delivered, detail: dateLabel(model.delivery.deliveredAt) },
    { label: 'Thanh toán', icon: Wallet, done: paid, detail: model.payment.paid > 0 ? money(model.payment.paid) : '' },
    { label: 'Hoàn tất', icon: paid ? CheckCircle2 : Circle, done: paid, detail: '' },
  ];
  return <section className="invoice-timeline" aria-label="Tiến trình đơn hàng">{stages.map(({ label, icon: Icon, done, detail }) => <div key={label} className={done ? 'is-done' : ''}><Icon size={18} /><strong>{label}</strong><small>{detail || '—'}</small></div>)}</section>;
}

function InvoiceTemplate01({ model }) {
  return <><header className="invoice-header"><Brand model={model} /><Heading model={model} /></header><Customer model={model} employee={false} /><Items model={model} /><Pricing model={model} /><Bank model={model} /><Footer model={model} /></>;
}
function InvoiceTemplate02({ model }) {
  return <><header className="invoice-header invoice-header--band"><Brand model={model} /><Heading model={model} /></header><Customer model={model} /><Items model={model} /><PaymentHero model={model} /><Pricing model={model} /><Bank model={model} /><Footer model={model} /></>;
}
function InvoiceTemplate03({ model }) {
  return <><header className="invoice-header invoice-header--warm"><Brand model={model} /><Heading model={model} /></header><Customer model={model} /><Items model={model} /><div className="invoice-template03__summary"><Pricing model={model} large /><Bank model={model} /></div><Footer model={model} /></>;
}
function InvoiceTemplate04({ model }) {
  return <><header className="invoice-header"><Brand model={model} /><Heading model={model} /></header><Timeline model={model} /><Customer model={model} /><Items model={model} /><div className="invoice-two-col"><Pricing model={model} /><Bank model={model} compact /></div><Footer model={model} /></>;
}
function InvoiceTemplate05({ model }) {
  return <><header className="invoice-header invoice-header--photo"><Brand model={model} /><Heading model={model} /><PaymentHero model={model} label="TỔNG THANH TOÁN" /></header><Customer model={model} /><Items model={model} /><div className="invoice-two-col"><Pricing model={model} /><Bank model={model} /></div><Footer model={model} /></>;
}
function InvoiceTemplate06({ model }) {
  return <><header className="invoice-header"><Brand model={model} compact /><Heading model={model} compact /></header><Customer model={model} employee={false} /><Items model={model} numbered /><Pricing model={model} /><Bank model={model} compact /><Footer model={model} signature /></>;
}
function InvoiceTemplate07({ model }) {
  return <><header className="invoice-header"><Brand model={model} /><Heading model={model} /></header><Customer model={model} /><Items model={model} numbered /><div className="invoice-two-col"><p className="invoice-quote">Cảm ơn quý khách<br />đã tin tưởng!</p><Pricing model={model} /></div><Bank model={model} /><Footer model={model} signature /></>;
}
function InvoiceTemplate08({ model }) {
  const heroImage = model.items.find((item) => item.image)?.image || '/invoice/white-chicken-farm.webp';
  return <div className="invoice-template08__split"><aside className="invoice-template08__visual"><Brand model={model} /><p>Tươi ngon mỗi ngày<br />Kết nối bền lâu</p>{heroImage ? <img src={heroImage} alt="Sản phẩm nổi bật" /> : <Package size={80} />}<div>{model.company.phone}<br />{model.company.address}</div></aside><main><Heading model={model} /><Customer model={model} /><Items model={model} /><Pricing model={model} large /><Bank model={model} /><Footer model={model} /></main></div>;
}
function InvoiceTemplate09({ model }) {
  return <><header className="invoice-header"><Brand model={model} /><Heading model={model} /></header><div className="invoice-template09__rule" /><Customer model={model} /><Items model={model} numbered /><div className="invoice-two-col"><Pricing model={model} /><Bank model={model} compact /></div><Footer model={model} signature /></>;
}
function InvoiceTemplate10({ model }) {
  return <><header className="invoice-header invoice-header--corporate"><Brand model={model} /><Heading model={model} /></header><Customer model={model} /><Items model={model} numbered /><div className="invoice-two-col invoice-template10__payment"><Bank model={model} /><Pricing model={model} /></div><Footer model={model} signature /></>;
}

const COMPONENTS = {
  'template-01': InvoiceTemplate01, 'template-02': InvoiceTemplate02,
  'template-03': InvoiceTemplate03, 'template-04': InvoiceTemplate04,
  'template-05': InvoiceTemplate05, 'template-06': InvoiceTemplate06,
  'template-07': InvoiceTemplate07, 'template-08': InvoiceTemplate08,
  'template-09': InvoiceTemplate09, 'template-10': InvoiceTemplate10,
};

export default function InvoiceTemplateEngine({ model, templateId, paper = 'a4' }) {
  if (!model) return null;
  const id = normalizeInvoiceTemplateId(templateId || model.templateId);
  const Component = COMPONENTS[id];
  return <article className={`invoice-document invoice-document--${id} invoice-document--${paper}`} data-invoice-template={id} aria-label={`Hóa đơn ${model.invoiceCode}`}>
    <Component model={model} />
    {model.note && <div className="invoice-note"><FileText size={15} />{model.note}</div>}
  </article>;
}

export { money as formatInvoiceMoney };
