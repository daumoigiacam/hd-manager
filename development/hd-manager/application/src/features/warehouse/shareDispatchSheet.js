/**
 * @typedef {{status: string, count?: number, expectedCount?: number}} ShareResult
 */
/**
 * @template T
 * @param {readonly T[]} sourceRows
 * @param {string} targetDate
 * @param {{lock: {current: boolean}, canShare: boolean, setDispatchActionError: (error: string) => void, setIsDispatchExporting: (busy: boolean) => void,
 * splitDispatchSharePages: (rows: readonly T[]) => T[][],
 * renderDispatchSheetCanvas: (rows: T[], date: string) => Promise<HTMLCanvasElement>,
 * canvasToBlob: (canvas: HTMLCanvasElement, mime: string) => Promise<Blob>,
 * buildDispatchSheetFilename: (date: string) => string,
 * shareBlobFile: (args: {entries: {name: string, blob: Blob}[], title: string, dialogTitle: string}) => Promise<ShareResult>,
 * Capacitor: {getPlatform: () => string}, CapacitorShare: {canShare: () => Promise<{value: boolean}>, share: (args: {title: string, files: string[], dialogTitle: string}) => Promise<unknown>},
 * writeBlobToShareCache: (filename: string, blob: Blob) => Promise<{uri: string}>,
 * saveBlobFile: (filename: string, blob: Blob) => Promise<ShareResult>, isShareCancelled: (error: unknown) => boolean,
 * getFriendlyFirebaseErrorMessage: (error: unknown, fallback: string) => string}} ports
 */
export async function shareDispatchSheet(sourceRows, targetDate, {lock, canShare, setDispatchActionError, setIsDispatchExporting,
  splitDispatchSharePages, renderDispatchSheetCanvas, canvasToBlob, buildDispatchSheetFilename, shareBlobFile,
  isShareCancelled, getFriendlyFirebaseErrorMessage}) {
    if (lock.current) return;
    setDispatchActionError('');
    if (!canShare) {
      setDispatchActionError('Bạn chưa được cấp quyền chia sẻ phiếu xuất kho.');
      return;
    }
    if (!sourceRows.length) {
      setDispatchActionError('Chưa có phiếu xuất kho để chia sẻ.');
      return;
    }
    lock.current = true;
    setIsDispatchExporting(true);
    try {
      const pages = splitDispatchSharePages(sourceRows);
      const blobs = [];
      for (const rows of pages) {
        const canvas = await renderDispatchSheetCanvas(rows, targetDate);
        try { blobs.push(await canvasToBlob(canvas, 'image/png')); }
        finally { canvas.width = canvas.height = 0; }
        await new Promise(resolve => globalThis.setTimeout(resolve, 0));
      }
      const result = await shareBlobFile({
        entries: blobs.map((blob, index) => ({name: buildDispatchSheetFilename(targetDate) + '-trang-' + (index + 1) + '.png', blob})),
        title: 'Xuất kho', dialogTitle: 'Chia sẻ xuất kho'
      });
      if (result?.status === 'partial') {
        setDispatchActionError(`Mới xử lý ${result.count}/${result.expectedCount} ảnh. Bấm Chia sẻ để mở lại đủ bộ ảnh.`);
      } else if (!['shared', 'saved', 'downloaded', 'cancelled'].includes(result?.status || '')) {
        setDispatchActionError('Thiết bị chưa hỗ trợ chia sẻ trực tiếp. Hãy dùng nút tải xuống.');
      }
    } catch (error) {
      if (isShareCancelled(error)) return;
      setDispatchActionError(getFriendlyFirebaseErrorMessage(error, 'Không thể chia sẻ phiếu xuất kho.'));
    } finally {
      lock.current = false;
      setIsDispatchExporting(false);
    }

}
