/**
 * @typedef {{customerId?: string, customerName?: string, requestLines?: import('./dispatchDialogModels.js').ShortageLine[], productShortName?: string, productName?: string, requestCount?: number, dispatchedKg?: number, latestMissingTimestamp?: number}} IssueLine
 */
/**
 * @template {IssueLine} T
 * @param {readonly T[]} lines
 * @param {{normalizeLookupText: (value: string) => string, getCompactProductName: (product: null, name: string) => string, formatCompactDateLabel: (value: string) => string}} ports
 */
export function buildDispatchShortageGroups(lines, {normalizeLookupText, getCompactProductName, formatCompactDateLabel}) {
    /** @type {Map<string, {key: string, customerId: string, customerName: string, issueLines: T[], requestLines: import('./dispatchDialogModels.js').ShortageLine[], productLabels: string[], requestDateLabels: string[], totalMissingLines: number, totalDispatchedKg: number, latestMissingTimestamp: number}>} */
    const groups = new Map();
    lines.forEach((line) => {
      const customerKey = line.customerId || normalizeLookupText(line.customerName || '');
      if (!customerKey) return;
      if (!groups.has(customerKey)) {
        groups.set(customerKey, {
          key: customerKey,
          customerId: line.customerId || '',
          customerName: line.customerName || 'Khách hàng',
          issueLines: [],
          requestLines: [],
          productLabels: [],
          requestDateLabels: [],
          totalMissingLines: 0,
          totalDispatchedKg: 0,
          latestMissingTimestamp: 0
        });
      }
      const group = groups.get(customerKey);
      if (!group) return;
      const requestDates = Array.from(new Set((Array.isArray(line.requestLines) ? line.requestLines : [])
        .map(requestLine => requestLine.requestDate)
        .filter(/** @returns {date is string} */ (date) => typeof date === 'string' && date.length > 0)));
      const productLabel = line.productShortName || getCompactProductName(null, line.productName || 'Hàng hóa');
      group.issueLines.push(line);
      group.requestLines.push(...(Array.isArray(line.requestLines) ? line.requestLines : []));
      if (productLabel && !group.productLabels.includes(productLabel)) group.productLabels.push(productLabel);
      requestDates.forEach(requestDate => {
        const dateLabel = formatCompactDateLabel(requestDate);
        if (dateLabel && !group.requestDateLabels.includes(dateLabel)) group.requestDateLabels.push(dateLabel);
      });
      group.totalMissingLines += Math.max(1, line.requestCount || line.requestLines?.length || 0);
      group.totalDispatchedKg += line.dispatchedKg || 0;
      group.latestMissingTimestamp = Math.max(group.latestMissingTimestamp || 0, line.latestMissingTimestamp || 0);
    });
    return Array.from(groups.values()).sort((a, b) => (
      (b.latestMissingTimestamp || 0) - (a.latestMissingTimestamp || 0)
      || a.customerName.localeCompare(b.customerName, 'vi')
    ));

}
