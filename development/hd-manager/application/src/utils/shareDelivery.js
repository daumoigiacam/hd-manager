// One prepared, immutable set per user action. No automatic resend: a receiver
// may have consumed part of a failed request. Every retry needs a fresh click.
export const isShareDismissed = error => error?.name === 'AbortError'
  || /\b(cancelled|canceled|user cancelled|share canceled)\b/i.test(error?.message || '');

export function prepareShareEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) throw Error('Chưa có tệp để chia sẻ.');
  const names = new Set();
  return entries.map(({ name, blob }) => {
    if (!name || /[\\/\x00-\x1f]/.test(name) || names.has(name)) throw Error('Tên tệp chia sẻ không hợp lệ hoặc bị trùng.');
    if (!blob?.size || typeof blob.arrayBuffer !== 'function') throw Error('Bộ ảnh chưa đầy đủ. Hãy tạo lại trước khi chia sẻ.');
    names.add(name);
    return Object.freeze({ name, blob });
  });
}

export function webFileShare(entries, { title = '', text = '' } = {}, nav = globalThis.navigator) {
  if (!nav?.share || typeof globalThis.File !== 'function') throw Error('Trình duyệt chưa hỗ trợ chia sẻ tệp. Hãy tải tệp để gửi.');
  const files = entries.map(({ name, blob }) => new File([blob], name, { type: blob.type || 'application/octet-stream' }));
  const payload = { title, files, ...(text && files.length === 1 ? { text } : {}) };
  if (nav.canShare && !nav.canShare({ files })) throw Error('Thiết bị không nhận bộ tệp này. Hãy chia sẻ từng ảnh hoặc tải trọn bộ ZIP.');
  // Intentionally no await before share(): transient user activation is needed.
  return nav.share(payload);
}

export async function nativeFileShare(entries, { title = '', text = '', dialogTitle = '' }, { share, writeFile }) {
  const files = [], batch = globalThis.crypto.randomUUID();
  for (let i = 0; i < entries.length; i++) {
    const { uri } = await writeFile(`${batch}-${i + 1}-${entries[i].name}`, entries[i].blob) || {};
    if (!uri || files.includes(uri)) throw Error(`Không chuẩn bị được tệp ${i + 1}/${entries.length}. Chưa gửi bộ tệp.`);
    files.push(uri);
  }
  await share({ title, text, dialogTitle: dialogTitle || title, files });
  return { status: 'shared', count: files.length };
}

let activeDelivery = false;
export async function deliverShareFiles(options, ports = {}) {
  const entries = prepareShareEntries(options.entries);
  if (activeDelivery) return { status: 'busy' };
  activeDelivery = true;
  try {
    const native = ports.platform && ports.platform !== 'web';
    const send = subset => native
      ? nativeFileShare(subset, options, ports)
      : Promise.resolve(webFileShare(subset, options, ports.navigator)).then(() => ({ status: 'shared', count: subset.length }));
    let initialError = '';
    if (native) {
      try {
        if ((await ports.canShare()).value) return await send(entries);
        initialError = 'Thiết bị chưa hỗ trợ chia sẻ trực tiếp. Bạn có thể lưu tệp.';
      } catch (error) {
        if (isShareDismissed(error)) return { status: 'cancelled' };
        initialError = 'Ứng dụng nhận chưa hoàn tất. Bộ tệp vẫn còn để bạn chọn gửi lại.';
      }
    }
    const present = ports.present || (await import('../features/sharing/shareFilesDialog.js')).showShareFilesDialog;
    return await present({ entries, title: options.title, send, save: ports.saveFile, initialError });
  } finally { activeDelivery = false; }
}

export async function deliverShareText(options, ports) {
  if (activeDelivery) return { status: 'busy' };
  activeDelivery = true;
  try {
    const native = ports.platform !== 'web';
    const send = () => native ? ports.share(options) : ports.navigator.share({ title: options.title, text: options.text });
    const supported = native ? (await ports.canShare().catch(() => ({ value: false }))).value : Boolean(ports.navigator?.share);
    // Text can also be prepared by async report builders. Recover with a new
    // explicit gesture rather than retrying after transient activation expired.
    if (supported && (native || ports.navigator.userActivation?.isActive !== false)) {
      try { await send(); return { status: 'shared' }; }
      catch (error) { if (isShareDismissed(error)) return { status: 'cancelled' }; }
    }
    const present = ports.present || (await import('../features/sharing/shareFilesDialog.js')).showShareFilesDialog;
    return await present({ entries: [{ name: 'noi-dung.txt', blob: new Blob([options.text], { type: 'text/plain;charset=utf-8' }) }],
      title: options.title, text: options.text, send: () => {
        if (!supported) throw Error('Thiết bị chưa hỗ trợ chia sẻ trực tiếp. Hãy sao chép nội dung.');
        return send();
      }, save: async () => ({ status: await ports.copy(options.text) ? 'copied' : 'unsupported' }) });
  } finally { activeDelivery = false; }
}

// PNG/JPEG are already compressed. A STORE ZIP avoids another large compression
// workspace and downloads the complete set with ONE browser action.
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export async function createShareArchive(input) {
  const entries = prepareShareEntries(input);
  if (entries.length > 65535) throw Error('Bộ tệp quá lớn. Hãy chia thành nhiều lần.');
  const parts = [], central = [];
  let offset = 0, directorySize = 0;
  for (const { name, blob } of entries) {
    const filename = new TextEncoder().encode(name), bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== blob.size || filename.length > 65535 || offset + bytes.length > 0xffffffff) throw Error('Không thể đóng gói đủ bộ tệp.');
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + filename.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true); view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true); view.setUint16(26, filename.length, true);
    header.set(filename, 30);
    const record = new Uint8Array(46 + filename.length), dir = new DataView(record.buffer);
    dir.setUint32(0, 0x02014b50, true); dir.setUint16(4, 20, true); dir.setUint16(6, 20, true);
    record.set(header.subarray(6, 30), 8); dir.setUint32(42, offset, true); record.set(filename, 46);
    parts.push(header, bytes); central.push(record); offset += header.length + bytes.length; directorySize += record.length;
  }
  if (offset + directorySize > 0xffffffff) throw Error('Bộ tệp quá lớn. Hãy chia thành nhiều lần.');
  const end = new Uint8Array(22), view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, entries.length, true); view.setUint16(10, entries.length, true);
  view.setUint32(12, directorySize, true); view.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
