export const CUSTOMER_RECONCILIATION_FILTERS = Object.freeze({
  ALL: 'all',
  COMPANY_PURCHASE: 'company_purchase',
  CUSTOMER_PURCHASE: 'customer_purchase'
});

const FILTER_VALUES = new Set(Object.values(CUSTOMER_RECONCILIATION_FILTERS));

export const normalizeCustomerReconciliationFilter = (value) => (
  FILTER_VALUES.has(value) ? value : CUSTOMER_RECONCILIATION_FILTERS.ALL
);

export const getCustomerReconciliationFilterLabel = (value) => {
  const normalized = normalizeCustomerReconciliationFilter(value);
  if (normalized === CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE) return 'Công ty mua';
  if (normalized === CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE) return 'Khách mua';
  return 'Tất cả giao dịch';
};

export const getCustomerReconciliationDirectionLabel = (direction) => {
  if (direction === CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE) return 'Công ty mua';
  if (direction === CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE) return 'Khách mua';
  if (direction === 'payment') return 'Thanh toán / cấn trừ';
  if (direction === 'pending') return 'Chờ đối soát';
  return 'Khác';
};

export const filterCustomerReconciliationRows = (rows, filter) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const normalized = normalizeCustomerReconciliationFilter(filter);
  if (normalized === CUSTOMER_RECONCILIATION_FILTERS.ALL) return safeRows;
  return safeRows.filter(row => row?.direction === normalized);
};

export const summarizeCustomerReconciliationRows = (rows) => (
  (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
    const amount = Math.max(0, Number(row?.amount) || 0);
    summary.count += 1;
    if (row?.direction === CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE) summary.companyPurchaseAmount += amount;
    else if (row?.direction === CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE) summary.customerPurchaseAmount += amount;
    else if (row?.direction === 'payment') summary.paymentAmount += amount;
    else if (row?.direction === 'pending') summary.pendingAmount += amount;
    return summary;
  }, {
    count: 0,
    companyPurchaseAmount: 0,
    customerPurchaseAmount: 0,
    paymentAmount: 0,
    pendingAmount: 0
  })
);

export const paginateCustomerReconciliationRows = (rows, pageSize = 14) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || 14));
  const pages = [];
  for (let index = 0; index < safeRows.length; index += safePageSize) {
    pages.push(safeRows.slice(index, index + safePageSize));
  }
  return pages;
};

const sanitizeFileSegment = (value, fallback) => {
  const safe = `${value || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return safe || fallback;
};

export const buildCustomerReconciliationExportFileName = ({
  customerName,
  filter,
  extension,
  dateKey
} = {}) => {
  const safeCustomer = sanitizeFileSegment(customerName, 'khach-hang');
  const safeFilter = sanitizeFileSegment(getCustomerReconciliationFilterLabel(filter), 'tat-ca');
  const safeDate = `${dateKey || new Date().toISOString().slice(0, 10)}`.replace(/[^0-9-]/g, '') || 'bao-cao';
  const safeExtension = `${extension || 'xlsx'}`.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'xlsx';
  return `doi-soat-${safeCustomer}-${safeFilter}-${safeDate}.${safeExtension}`;
};

const escapeXml = (value) => `${value ?? ''}`
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const columnName = (index) => {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const createCellXml = (cell, rowIndex, columnIndex) => {
  const ref = `${columnName(columnIndex)}${rowIndex}`;
  const style = Number.isFinite(cell?.style) ? ` s="${cell.style}"` : '';
  if (cell?.type === 'number') {
    return `<c r="${ref}"${style} t="n"><v>${Number(cell.value) || 0}</v></c>`;
  }
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell?.value)}</t></is></c>`;
};

const createSheetXml = (rows) => {
  const rowXml = rows.map((row, rowIndex) => (
    `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => createCellXml(cell, rowIndex + 1, columnIndex)).join('')}</row>`
  )).join('');
  const lastRow = Math.max(1, rows.length);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:J${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>
    <col min="1" max="1" width="7" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="22" customWidth="1"/>
    <col min="4" max="4" width="19" customWidth="1"/>
    <col min="5" max="5" width="42" customWidth="1"/>
    <col min="6" max="7" width="12" customWidth="1"/>
    <col min="8" max="10" width="18" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  <mergeCells count="5">
    <mergeCell ref="A1:J1"/><mergeCell ref="A2:J2"/><mergeCell ref="A3:J3"/>
    <mergeCell ref="A4:J4"/><mergeCell ref="A5:J5"/>
  </mergeCells>
</worksheet>`;
};

const XLSX_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><sz val="16"/><color rgb="FF166534"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Arial"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF059669"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1FAE5"/></left><right style="thin"><color rgb="FFD1FAE5"/></right><top style="thin"><color rgb="FFD1FAE5"/></top><bottom style="thin"><color rgb="FFD1FAE5"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="4" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

const calculateCrc32 = (bytes) => {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
};

const writeUint16 = (view, offset, value) => view.setUint16(offset, value, true);
const writeUint32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);

const concatBytes = (parts) => {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  parts.forEach(part => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
};

const createZipArchive = (files) => {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  files.forEach(file => {
    const name = encoder.encode(file.name);
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = calculateCrc32(data);
    const localHeader = new Uint8Array(30 + name.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034B50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, name.length);
    localHeader.set(name, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014B50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, data.length);
    writeUint32(centralView, 24, data.length);
    writeUint16(centralView, 28, name.length);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + data.length;
  });

  const centralDirectory = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054B50);
  writeUint16(endView, 8, files.length);
  writeUint16(endView, 10, files.length);
  writeUint32(endView, 12, centralDirectory.length);
  writeUint32(endView, 16, localOffset);
  return concatBytes([...localParts, centralDirectory, end]);
};

const textCell = (value, style = 0) => ({ value, style, type: 'text' });
const numberCell = (value, style = 5) => ({ value: Number(value) || 0, style, type: 'number' });

export const buildCustomerReconciliationWorkbook = ({
  companyName,
  customerName,
  filter,
  generatedAt,
  rows
} = {}) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  const summary = summarizeCustomerReconciliationRows(safeRows);
  const worksheetRows = [
    [textCell('BÁO CÁO ĐỐI CHIẾU CÔNG NỢ KHÁCH HÀNG', 1)],
    [textCell(`Công ty: ${companyName || 'HD Manager'}`, 2)],
    [textCell(`Khách hàng: ${customerName || 'Khách hàng'}`, 2)],
    [textCell(`Phạm vi: ${getCustomerReconciliationFilterLabel(filter)}`, 2)],
    [textCell(`Ngày xuất: ${generatedAt || new Date().toLocaleString('vi-VN')}`, 2)],
    [],
    ['STT', 'Ngày', 'Phân loại', 'Chứng từ', 'Nội dung', 'Kg', 'Con', 'Giá', 'Số tiền', 'Trạng thái'].map(value => textCell(value, 3))
  ];

  safeRows.forEach((row, index) => {
    worksheetRows.push([
      numberCell(index + 1),
      textCell(row?.dateLabel || ''),
      textCell(getCustomerReconciliationDirectionLabel(row?.direction)),
      textCell(row?.reference || ''),
      textCell(row?.detail || row?.title || ''),
      numberCell(row?.metrics?.weightKg || 0, 5),
      numberCell(row?.metrics?.pieces || 0, 5),
      textCell(row?.metrics?.priceLabel || ''),
      numberCell(row?.amount || 0, 4),
      textCell(row?.amountLabel || '')
    ]);
  });

  worksheetRows.push([]);
  [
    ['Tổng công ty mua', summary.companyPurchaseAmount],
    ['Tổng khách mua', summary.customerPurchaseAmount],
    ['Tổng thanh toán / cấn trừ', summary.paymentAmount],
    ['Tổng chờ đối soát', summary.pendingAmount]
  ].forEach(([label, amount]) => {
    worksheetRows.push([textCell(label, 2), textCell(''), textCell(''), textCell(''), textCell(''), textCell(''), textCell(''), textCell(''), numberCell(amount, 6)]);
  });

  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Đối chiếu công nợ" sheetId="1" r:id="rId1"/></sheets></workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    },
    { name: 'xl/styles.xml', content: XLSX_STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', content: createSheetXml(worksheetRows) }
  ];

  return createZipArchive(files);
};

export const downloadCustomerReconciliationWorkbook = ({ bytes, fileName }) => {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
};
