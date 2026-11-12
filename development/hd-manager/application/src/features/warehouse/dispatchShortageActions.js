/** @param {import('./dispatchShortageContracts.js').ShortageActionRow} row @param {import('./dispatchShortageContracts.js').ShortageActionContext} context */
export async function deleteShortageOrderRequestRow(row, context) {
  const { lock, selectedShortageLine, canDeleteOrderRequest, onDeleteOrderRequest, onEditOrderRequest,
    orderRequests, employee, confirm, normalizeLookupText, getTransactionBillingPresentation,
    getFriendlyFirebaseErrorMessage, setDeletingShortageRequestKey, setDispatchError, setSelectedShortageLine } = context;
  if (lock.current) return;
    if (!row?.requestId || !canDeleteOrderRequest || typeof onDeleteOrderRequest !== 'function') return;
    const confirmMessage = [
      `Xóa đơn đặt đang báo thiếu của ${selectedShortageLine?.customerName || 'khách hàng'}?`,
      `${row.productLabel || 'Hàng hóa'}${row.quantityLabel ? ` - ${row.quantityLabel}` : ''}${row.requestDateLabel ? ` - ${row.requestDateLabel}` : ''}`,
      'Dữ liệu sẽ được lưu trữ an toàn để tránh mất dấu vết.'
    ].join('\n');
    if (!confirm(confirmMessage)) return;

    lock.current = true;
    setDeletingShortageRequestKey(row.id);
    setDispatchError('');
    try {
      const request = (orderRequests || []).find(item => item.id === row.requestId);
      const requestItems = Array.isArray(request?.items) ? request.items : [];
      if (!request || requestItems.length <= 1) {
        await onDeleteOrderRequest(row.requestId);
      } else {
        const nextItems = requestItems.filter((item, index) => {
          const productName = item.description || item.productName || item.productNameSnapshot || '';
          const itemRowKey = item.rowKey
            || item.id
            || item.lineId
            || item.itemId
            || `${request.id || 'request'}_${item.productId || normalizeLookupText(productName) || index}_${index}`;
          if (row.rowKey) return itemRowKey !== row.rowKey;
          return index !== row.itemIndex;
        });
        if (nextItems.length === requestItems.length) {
          throw new Error('Chưa xác định được dòng cần xóa trong đơn đặt.');
        }
        const nextTotalAmount = nextItems.reduce(
          (sum, item) => sum + getTransactionBillingPresentation(item).amount,
          0
        );
        await onEditOrderRequest(row.requestId, {
          ...request,
          items: nextItems,
          totalAmount: nextTotalAmount,
          updatedAt: new Date().toISOString(),
          updatedByEmpId: employee?.id || 'warehouse'
        }, employee?.id || 'warehouse');
      }
      setSelectedShortageLine(null);
    } catch (error) {
      console.error('delete shortage order request failed', error);
      setDispatchError(`Xóa đơn đặt chưa thành công: ${getFriendlyFirebaseErrorMessage(error, 'Lỗi không xác định')}`);
    } finally {
      lock.current = false;
      setDeletingShortageRequestKey('');
    }
  }

/** @param {import('./dispatchShortageContracts.js').ShortageActionContext} context */
export async function closeSelectedDispatchShortage(context) {
  const { lock, selectedShortageLine, onEditOrderRequest, orderRequests, employee, workingDate,
    normalizeLookupText, getFriendlyFirebaseErrorMessage, setIsClosingShortageLine,
    setDispatchError, setSelectedShortageLine } = context;
  if (lock.current) return;
    if (!selectedShortageLine || typeof onEditOrderRequest !== 'function') return;
    /** @type {Map<string, Map<string, import('./dispatchDialogModels.js').ShortageLine & {rowKey: string}>>} */
    const linesByRequest = new Map();
    const requestLines = Array.isArray(selectedShortageLine.requestLines) ? selectedShortageLine.requestLines : [];
    requestLines.forEach((line, index) => {
      const requestId = line.requestId || '';
      if (!requestId) return;
      const rowKey = line.rowKey || `${requestId}_${line.productId || normalizeLookupText(line.productName || '') || index}`;
      if (!linesByRequest.has(requestId)) linesByRequest.set(requestId, new Map());
      linesByRequest.get(requestId)?.set(rowKey, { ...line, rowKey });
    });

    if (!linesByRequest.size) {
      setDispatchError('Chưa có dòng đơn đặt để chốt thiếu.');
      return;
    }

    lock.current = true;
    setIsClosingShortageLine(true);
    setDispatchError('');
    try {
      const closedAt = new Date().toISOString();
      await Promise.all(Array.from(linesByRequest.entries()).map(async ([requestId, lineMap]) => {
        const request = (orderRequests || []).find(item => item.id === requestId);
        if (!request) return;
        const existingClosedShortItems = request.closedShortItems && typeof request.closedShortItems === 'object' && !Array.isArray(request.closedShortItems)
          ? request.closedShortItems
          : {};
        const nextClosedShortItems = { ...existingClosedShortItems };
        Array.from(lineMap.values()).forEach((line) => {
          nextClosedShortItems[line.rowKey] = {
            rowKey: line.rowKey,
            productId: line.productId || '',
            productName: line.productName || '',
            productShortName: line.productShortName || '',
            quantity: line.quantity || 0,
            quantityUnit: line.quantityUnit || '',
            sizeLabel: line.sizeLabel || '',
            attributeLabel: line.attributeLabel || '',
            requestDate: line.requestDate || '',
            dispatchDate: workingDate,
            closedAt,
            closedByEmpId: employee?.id || '',
            reason: 'closed_short_by_warehouse'
          };
        });
        await onEditOrderRequest(requestId, {
          ...request,
          closedShortItems: nextClosedShortItems
        }, employee?.id || 'warehouse');
      }));
      setSelectedShortageLine(null);
    } catch (error) {
      console.error('close shortage order request failed', error);
      setDispatchError(`Chốt thiếu chưa thành công: ${getFriendlyFirebaseErrorMessage(error, 'Lỗi không xác định')}`);
    } finally {
      lock.current = false;
      setIsClosingShortageLine(false);
    }
  }
