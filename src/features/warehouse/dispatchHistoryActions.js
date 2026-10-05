/**
 * @template {{id: string, customerName?: string, customerNameSnapshot?: string}} T
 * @param {T} row
 * @param {{allowed: boolean, lock: {current: boolean}, confirm: (message: string) => boolean,
 * remove: (id: string) => Promise<unknown>, onRemoved: (row: T) => void,
 * setPending: (id: string) => void, setError: (message: string) => void,
 * errorMessage: (error: unknown) => string}} context
 */
export async function deleteDispatchHistoryRow(row, context) {
  if (!row?.id || !context.allowed || context.lock.current) return;
  const name = row.customerName || row.customerNameSnapshot || 'khach hang nay';
  if (!context.confirm(`Xoa phieu xuat kho trong lich su cua ${name}?`)) return;
  context.lock.current = true;
  context.setPending(row.id);
  context.setError('');
  try {
    await context.remove(row.id);
    context.onRemoved(row);
  } catch (error) {
    context.setError(context.errorMessage(error));
  } finally {
    context.lock.current = false;
    context.setPending('');
  }
}
