import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { Check, Download, Eye, FileDown, Monitor, Printer, Smartphone, X } from 'lucide-react';
import InvoiceTemplateEngine from './InvoiceTemplateEngine.jsx';
import { buildInvoiceDemo, DEFAULT_INVOICE_TEMPLATE_ID, INVOICE_TEMPLATES, normalizeInvoiceTemplateId } from './invoiceTemplateModel.js';
import './invoiceTemplateWorkspace.css';

const scenarios = [
  ['base', 'Cơ bản'], ['discount', 'Giảm giá'], ['promotion', 'Khuyến mãi'], ['fee', 'Phụ phí'],
  ['combined', 'Đầy đủ'], ['old-debt', 'Nợ cũ'], ['partial', 'Thu một phần'], ['paid', 'Đã thanh toán'],
];

export async function invoiceNodeToPngBlob(node) {
  if (!node) throw new Error('Chưa có bản xem trước hóa đơn.');
  const { toBlob } = await import('html-to-image');
  await document.fonts?.ready;
  const blob = await toBlob(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#ffffff',
    skipFonts: true,
    imagePlaceholder: '/brand/hd-manager-logo.png',
  });
  if (!blob) throw new Error('Không tạo được ảnh hóa đơn.');
  return blob;
}

export async function renderInvoiceImageBlob(model, templateId) {
  const host = document.createElement('div');
  host.className = 'invoice-preview-container';
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;z-index:-1;pointer-events:none;';
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<InvoiceTemplateEngine model={model} templateId={templateId} />));
    await Promise.all(Array.from(host.querySelectorAll('img')).map(async (image) => {
      if (image.complete) return;
      await Promise.race([
        new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; }),
        new Promise((resolve) => window.setTimeout(resolve, 5000)),
      ]);
    }));
    return await invoiceNodeToPngBlob(host.querySelector('.invoice-document'));
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function invoiceNodeToPdfBlob(node, paper = 'a4') {
  const exportHost = document.createElement('div');
  exportHost.className = 'invoice-preview-container';
  exportHost.style.cssText = `position:fixed;left:-10000px;top:0;width:${paper === 'a5' ? 560 : 794}px;container-type:inline-size;container-name:invoice-preview;`;
  exportHost.append(node.cloneNode(true));
  document.body.append(exportHost);
  let png;
  try {
    await Promise.all(Array.from(exportHost.querySelectorAll('img')).map(async (image) => {
      if (image.complete) return;
      await Promise.race([new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; }), new Promise((resolve) => window.setTimeout(resolve, 5000))]);
    }));
    png = await invoiceNodeToPngBlob(exportHost.querySelector('.invoice-document'));
  } finally {
    exportHost.remove();
  }
  const { jsPDF } = await import('jspdf');
  const imageUrl = URL.createObjectURL(png);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: paper });
    const pageWidth = paper === 'a5' ? 148 : 210;
    const pageHeight = paper === 'a5' ? 210 : 297;
    const scaledHeight = (image.height / image.width) * pageWidth;
    let remaining = scaledHeight;
    let y = 0;
    while (remaining > 0) {
      pdf.addImage(image, 'PNG', 0, y, pageWidth, scaledHeight);
      remaining -= pageHeight;
      if (remaining > 0) { pdf.addPage(); y -= pageHeight; }
    }
    return pdf.output('blob');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

export function downloadInvoiceBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function InvoicePreview({ model, templateId, title, onClose, onShare, readOnly = false }) {
  const [mode, setMode] = useState('phone');
  const [paper, setPaper] = useState(templateId === 'template-06' ? 'a5' : 'a4');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const documentRef = useRef(null);
  const exportFile = async (kind) => {
    try {
      setBusy(kind);
      setError('');
      const blob = kind === 'pdf'
        ? await invoiceNodeToPdfBlob(documentRef.current, paper)
        : await invoiceNodeToPngBlob(documentRef.current);
      downloadInvoiceBlob(blob, `${model.invoiceCode || 'hoa-don'}.${kind === 'pdf' ? 'pdf' : 'png'}`);
    } catch (cause) {
      setError(cause?.message || 'Không xuất được hóa đơn.');
    } finally {
      setBusy('');
    }
  };

  return createPortal(<div className="invoice-preview-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div className="invoice-preview-dialog">
      <header className="invoice-preview-toolbar">
        <div><strong>{title}</strong><span>{model.invoiceCode}</span></div>
        <button type="button" title="Đóng" aria-label="Đóng xem trước" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="invoice-preview-controls">
        <div className="invoice-preview-segment" aria-label="Chế độ xem">
          <button type="button" aria-pressed={mode === 'phone'} onClick={() => setMode('phone')} title="Xem trên điện thoại"><Smartphone size={17} />Điện thoại</button>
          <button type="button" aria-pressed={mode === 'desktop'} onClick={() => setMode('desktop')} title="Xem trên máy tính"><Monitor size={17} />Máy tính</button>
          <button type="button" aria-pressed={mode === 'print'} onClick={() => setMode('print')} title="Xem bản in"><Printer size={17} />Bản in</button>
        </div>
        <select aria-label="Khổ giấy" value={paper} onChange={(event) => setPaper(event.target.value)}><option value="a4">A4</option><option value="a5">A5</option></select>
      </div>
      <div className={`invoice-preview-canvas invoice-preview-canvas--${mode} invoice-preview-canvas--${paper}`}>
        <div className="invoice-print-target invoice-preview-container" ref={documentRef}><InvoiceTemplateEngine model={model} templateId={templateId} paper={paper} /></div>
      </div>
      <style media="print">{`@page { size: ${paper.toUpperCase()} portrait; margin: 8mm; }`}</style>
      {error && <p className="invoice-preview-error" role="alert">{error}</p>}
      <footer className="invoice-preview-actions">
        <button type="button" disabled={Boolean(busy)} onClick={() => window.print()}><Printer size={17} />In</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => exportFile('pdf')}><FileDown size={17} />{busy === 'pdf' ? 'Đang xuất...' : 'PDF'}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => exportFile('png')}><Download size={17} />Ảnh</button>
        {!readOnly && onShare && <button type="button" disabled={Boolean(busy)} onClick={onShare}>Chia sẻ</button>}
      </footer>
    </div>
  </div>, document.body);
}

export function InvoiceTemplateSettings({ company, onApply, buildQrDataUrl, canApply = false }) {
  const activeId = normalizeInvoiceTemplateId(company?.invoiceTemplateId);
  const [selectedId, setSelectedId] = useState(activeId);
  const [scenario, setScenario] = useState('base');
  const [demoQr, setDemoQr] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => setSelectedId(activeId), [activeId]);
  const demoModel = useMemo(() => buildInvoiceDemo(scenario, selectedId), [scenario, selectedId]);
  useEffect(() => {
    let cancelled = false;
    if (!buildQrDataUrl) { setDemoQr(''); return () => { cancelled = true; }; }
    Promise.resolve(buildQrDataUrl(demoModel.payment))
      .then((url) => { if (!cancelled) setDemoQr(url); })
      .catch(() => { if (!cancelled) setDemoQr(''); });
    return () => { cancelled = true; };
  }, [buildQrDataUrl, demoModel]);
  const previewModel = useMemo(() => ({ ...demoModel, payment: { ...demoModel.payment, qr: demoQr } }), [demoModel, demoQr]);
  const apply = async () => {
    if (!canApply) { setStatus('Bạn chưa có quyền thay đổi mẫu hóa đơn của công ty.'); return; }
    setSaving(true);
    setStatus('');
    try {
      const result = await onApply({ invoiceTemplateId: selectedId });
      setStatus(result?.success ? 'Đã áp dụng mẫu cho hóa đơn của công ty.' : result?.message || 'Không thể lưu mẫu hóa đơn.');
    } catch (error) {
      setStatus(error?.message || 'Không thể lưu mẫu hóa đơn.');
    } finally { setSaving(false); }
  };
  return <section className="invoice-settings" aria-label="Mẫu hóa đơn">
    <div className="invoice-settings__heading"><div><h2>Mẫu hóa đơn</h2><p>Chọn mẫu hiển thị cho hóa đơn bán hàng</p></div><span>{INVOICE_TEMPLATES.length} mẫu</span></div>
    <div className="invoice-settings__grid">{INVOICE_TEMPLATES.map((template, index) => <button key={template.id} type="button" className={`invoice-settings__option invoice-settings__option--${template.tone} ${selectedId === template.id ? 'is-selected' : ''}`} onClick={() => { setSelectedId(template.id); setStatus(''); }} aria-pressed={selectedId === template.id}>
      <span className="invoice-settings__thumbnail"><span /><i /><i /><i /><strong>{String(index + 1).padStart(2, '0')}</strong></span>
      <span className="invoice-settings__option-body"><strong>Mẫu {String(index + 1).padStart(2, '0')} · {template.name}</strong><small>{template.description}</small></span>
      {selectedId === template.id && <Check size={17} aria-label="Đã chọn" />}
      {activeId === template.id && <span className="invoice-settings__active">Đang sử dụng</span>}
    </button>)}</div>
    <div className="invoice-settings__bottom">
      <label>Trường hợp xem trước<select value={scenario} onChange={(event) => setScenario(event.target.value)}>{scenarios.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div><button type="button" className="invoice-settings__secondary" onClick={() => setPreviewOpen(true)}><Eye size={17} />Xem trước</button><button type="button" className="invoice-settings__primary" onClick={apply} disabled={!canApply || saving || selectedId === activeId}>{saving ? 'Đang lưu...' : 'Áp dụng'}</button></div>
    </div>
    {status && <p className="invoice-settings__status" role="status">{status}</p>}
    {previewOpen && <InvoicePreview title={`${INVOICE_TEMPLATES.find((item) => item.id === selectedId)?.name || ''} · Hóa đơn mẫu`} model={previewModel} templateId={selectedId} onClose={() => setPreviewOpen(false)} readOnly />}
  </section>;
}

export { InvoicePreview };
export { DEFAULT_INVOICE_TEMPLATE_ID };
