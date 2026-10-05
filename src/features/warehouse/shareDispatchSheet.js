/**
 * @typedef {{status: string}} ShareResult
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
 * shareBlobFile: (args: {filename: string, blob: Blob, title: string, dialogTitle: string}) => Promise<ShareResult>,
 * Capacitor: {getPlatform: () => string}, CapacitorShare: {canShare: () => Promise<{value: boolean}>, share: (args: {title: string, files: string[], dialogTitle: string}) => Promise<unknown>},
 * writeBlobToShareCache: (filename: string, blob: Blob) => Promise<{uri: string}>,
 * saveBlobFile: (filename: string, blob: Blob) => Promise<ShareResult>, isShareCancelled: (error: unknown) => boolean,
 * getFriendlyFirebaseErrorMessage: (error: unknown, fallback: string) => string}} ports
 */
export async function shareDispatchSheet(sourceRows, targetDate, {lock, canShare, setDispatchActionError, setIsDispatchExporting,
  splitDispatchSharePages, renderDispatchSheetCanvas, canvasToBlob, buildDispatchSheetFilename, shareBlobFile,
  Capacitor, CapacitorShare, writeBlobToShareCache, saveBlobFile, isShareCancelled, getFriendlyFirebaseErrorMessage}) {
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
        await new Promise(resolve => window.setTimeout(resolve, 0));
      }
      const filename = (/** @type {number} */ index) => `${buildDispatchSheetFilename(targetDate)}-trang-${index + 1}.png`;
      /** @type {{status: string} | undefined} */
      let result;
      if (blobs.length === 1) {
        result = await shareBlobFile({ filename: filename(0), blob: blobs[0], title: 'Xuất kho', dialogTitle: 'Chia sẻ xuất kho' });
      } else if (Capacitor.getPlatform() !== 'web' && (await CapacitorShare.canShare().catch(() => ({ value: false }))).value) {
        const files = [];
        for (let index = 0; index < blobs.length; index += 1) {
          files.push((await writeBlobToShareCache(filename(index), blobs[index])).uri);
        }
        await CapacitorShare.share({ title: 'Xuất kho', files, dialogTitle: 'Chia sẻ xuất kho' });
        result = { status: 'shared' };
      } else {
        const files = blobs.map((blob, index) => new File([blob], filename(index), { type: 'image/png' }));
        if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
          await navigator.share({ title: 'Xuất kho', files });
          result = { status: 'shared' };
        } else {
          for (let index = 0; index < blobs.length; index += 1) {
            result = await saveBlobFile(filename(index), blobs[index]);
            if (!['saved', 'downloaded'].includes(result.status)) throw new Error('Không thể lưu đủ các ảnh xuất kho.');
            await new Promise(resolve => window.setTimeout(resolve, 180));
          }
        }
      }
      if (!['shared', 'saved', 'downloaded', 'cancelled'].includes(result?.status || '')) {
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
