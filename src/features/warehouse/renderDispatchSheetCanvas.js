import { buildDispatchPreviewRows } from './dispatchPreviewRows.js';
/** @typedef {{customerName?: string, productName?: string, productShortName?: string, pieceCount?: number | string, quantityUnit?: string, weightKg?: number | string}} ExportRow */
/**
 * @param {readonly ExportRow[]} sourceRows
 * @param {string} targetDate
 * @param {{companyName?: string, formatDateLabel: (date: string) => string, formatNumber: (value: number | string) => string, compactProductName: (name: string) => string}} ports
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderDispatchSheetCanvas(sourceRows, targetDate, {companyName, formatDateLabel, formatNumber, compactProductName}) {
    if (!sourceRows.length) throw new Error('Chưa có dữ liệu xuất kho để chia sẻ.');
    const rows = buildDispatchPreviewRows(sourceRows);
    const canvasWidth = 1080;
    const pagePadding = 36;
    const tableX = pagePadding;
    const tableY = 122;
    const tableWidth = canvasWidth - pagePadding * 2;
    const headerHeight = 58;
    const rowHeight = 54;
    const tableHeight = headerHeight + (rows.length * rowHeight);
    const canvasHeight = tableY + tableHeight + 40;
    const columnWidths = [
      Math.round(tableWidth * 0.32),
      Math.round(tableWidth * 0.30),
      Math.round(tableWidth * 0.18),
      tableWidth - Math.round(tableWidth * 0.32) - Math.round(tableWidth * 0.30) - Math.round(tableWidth * 0.18)
    ];
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Khong the dung phieu xuat kho de chia se.');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = '900 32px Arial';
    ctx.fillText('PHIEU XUAT KHO', canvasWidth / 2, 58);
    ctx.font = '600 18px Arial';
    ctx.fillStyle = '#475569';
    ctx.fillText(`${companyName || 'Công ty'} • ${formatDateLabel(targetDate)}`, canvasWidth / 2, 90);

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.strokeRect(tableX, tableY, tableWidth, tableHeight);

    let runningX = tableX;
    columnWidths.forEach((columnWidth, index) => {
      if (index > 0) {
        ctx.beginPath();
        ctx.moveTo(runningX, tableY);
        ctx.lineTo(runningX, tableY + tableHeight);
        ctx.stroke();
      }
      runningX += columnWidth;
    });

    ctx.beginPath();
    ctx.moveTo(tableX, tableY + headerHeight);
    ctx.lineTo(tableX + tableWidth, tableY + headerHeight);
    ctx.stroke();

    for (let rowIndex = 1; rowIndex <= rows.length; rowIndex += 1) {
      const y = tableY + headerHeight + rowIndex * rowHeight;
      ctx.beginPath();
      ctx.moveTo(tableX, y);
      ctx.lineTo(tableX + tableWidth, y);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const columnTitles = ['Tên KH', 'Loại hàng', 'Số lượng', 'Số kg'];
    ctx.fillStyle = '#0f172a';
    ctx.font = '600 24px Arial';
    let titleX = tableX;
    columnTitles.forEach((title, index) => {
      const width = columnWidths[index];
      ctx.fillText(title, titleX + width / 2, tableY + 38);
      titleX += width;
    });

    rows.forEach((row, rowIndex) => {
      const rowTop = tableY + headerHeight + rowIndex * rowHeight;
      const centerY = rowTop + 34;
      const quantityLabel = row.pieceCount !== undefined && Number(row.pieceCount) > 0 ? `${formatNumber(row.pieceCount)} ${row.quantityUnit || 'Con'}` : '';
      const weightLabel = row.weightKg ? formatNumber(row.weightKg) : '';
      const values = [row.customerName || '', row.productShortName || compactProductName(row.productName || ''), quantityLabel, weightLabel];
      let valueX = tableX;
      values.forEach((value, index) => {
        const width = columnWidths[index];
        ctx.fillStyle = '#0f172a';
        ctx.font = value ? '400 22px Arial' : '400 22px Arial';
        ctx.fillText(value, valueX + width / 2, centerY);
        valueX += width;
      });
    });

    return canvas;

}
