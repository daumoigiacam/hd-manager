import { createShareArchive, createShareProgress, isShareDismissed } from '../../utils/shareDelivery.js';
import './shareFilesDialog.css';

// Display only prepared blobs; no render/network work between a click and send.
// Keep previews available after recipient failure, cancellation and handoff.
export function showShareFilesDialog({ entries, title = 'Chia sẻ', text = '', send, save, initialError = '' }) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement, urls = [], cleanup = [];
    const overlay = document.createElement('div'); overlay.className = 'hd-share-overlay';
    const dialog = document.createElement('section'); dialog.className = 'hd-share-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', title || 'Chia sẻ tệp');
    const heading = document.createElement('h2'); heading.textContent = title || 'Chia sẻ tệp';
    const summary = document.createElement('p'); summary.textContent = text || `Đã chuẩn bị đủ ${entries.length} tệp. Chọn chia sẻ cả bộ hoặc từng ảnh.`;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'hd-share-status'; status.textContent = initialError;
    let busy = false, closed = false, result = { status: 'cancelled' }, archive = null, archiveError = '';
    const progress = createShareProgress(entries.length), allIndices = entries.map((_, index) => index);
    const buttons = [];
    const button = (label, action) => {
      const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
      node.addEventListener('click', action); buttons.push(node); return node;
    };
    const setBusy = value => { busy = value; buttons.forEach(node => { node.disabled = value; }); if (!value && zipButton) zipButton.disabled = !archive; };
    const act = (operation, success, indices = allIndices) => {
      if (busy || closed) return;
      setBusy(true); status.textContent = '';
      try {
        // Call synchronously inside the click; do not move into a microtask.
        const pending = operation();
        Promise.resolve(pending).then(value => {
          if (value?.status && !['saved', 'downloaded', 'shared', 'copied'].includes(value.status)) throw Error('Chưa lưu được tệp. Hãy thử lại.');
          result = progress(value, indices);
          status.textContent = success;
        }).catch(error => {
          status.textContent = isShareDismissed(error) ? 'Đã đóng hộp chia sẻ. Bạn có thể chọn gửi lại.'
            : `${error?.message || 'Chưa hoàn tất chia sẻ.'} Bộ tệp vẫn còn; bạn có thể gửi từng ảnh hoặc tải ZIP.`;
        }).finally(() => { if (!closed) setBusy(false); });
      } catch (error) {
        status.textContent = `${error?.message || 'Chưa hoàn tất chia sẻ.'} Bạn có thể tải tệp để gửi.`; setBusy(false);
      }
    };
    const handoff = count => `Đã chuyển ${count} tệp đến trình chia sẻ. Hãy kiểm tra đủ tệp trong ứng dụng nhận trước khi gửi.`;
    dialog.append(heading, summary, status);
    const actions = document.createElement('div'); actions.className = 'hd-share-actions';
    actions.append(button(text ? 'Chia sẻ nội dung' : `Chia sẻ toàn bộ (${entries.length} tệp)`, () => act(() => send(entries), text ? 'Đã chuyển nội dung đến trình chia sẻ. Kiểm tra trong ứng dụng nhận trước khi gửi.' : handoff(entries.length))));
    let zipButton = null;
    if (entries.length > 1) {
      zipButton = button('Đang chuẩn bị ZIP…', () => act(() => save('HD-Manager-tron-bo.zip', archive), 'Đã yêu cầu tải ZIP chứa đủ bộ ảnh. Kiểm tra tệp trong mục tải xuống.'));
      zipButton.disabled = true; actions.append(zipButton);
      createShareArchive(entries).then(blob => {
        if (closed) return; archive = blob; zipButton.textContent = `Tải trọn bộ ${entries.length} tệp (ZIP)`; zipButton.disabled = busy;
      }).catch(error => { archiveError = error?.message || 'Không tạo được ZIP.'; if (!closed) { zipButton.textContent = archiveError; status.textContent = archiveError; } });
    }
    dialog.append(actions);
    const list = document.createElement('ol'); list.className = 'hd-share-files';
    (text ? [] : entries).forEach((entry, index) => {
      const item = document.createElement('li'), name = document.createElement('p'); name.textContent = `${index + 1}/${entries.length} · ${entry.name}`;
      if (entry.blob.type.startsWith('image/')) {
        const image = document.createElement('img'), url = URL.createObjectURL(entry.blob); urls.push(url);
        image.src = url; image.alt = `Ảnh ${index + 1}/${entries.length}`; image.loading = 'lazy'; item.append(image);
      }
      item.append(name, button(`Chia sẻ tệp ${index + 1}`, () => act(() => send([entry]), handoff(1), [index])),
        button(`Tải tệp ${index + 1}`, () => act(() => save(entry.name, entry.blob), `Đã yêu cầu tải tệp ${index + 1}. Kiểm tra mục tải xuống.`, [index])));
      list.append(item);
    });
    if (text) actions.append(button('Sao chép nội dung', () => act(() => save(), 'Đã sao chép nội dung để bạn dán vào ứng dụng nhận.')));
    dialog.append(list);
    const close = () => {
      if (busy || closed) return;
      closed = true; overlay.remove(); urls.forEach(url => URL.revokeObjectURL(url)); cleanup.forEach(fn => fn()); archive = null;
      if (previousFocus?.isConnected) previousFocus.focus(); resolve(result);
    };
    const closeButton = button('Xong / Đóng', close); closeButton.className = 'hd-share-close'; dialog.append(closeButton);
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Tab') {
        const available = buttons.filter(node => !node.disabled), first = available[0], last = available.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    const onBack = event => { event.preventDefault(); event.stopImmediatePropagation(); close(); };
    document.addEventListener('keydown', onKey, true); window.addEventListener('hd-manager-screen-back', onBack, true);
    cleanup.push(() => document.removeEventListener('keydown', onKey, true), () => window.removeEventListener('hd-manager-screen-back', onBack, true));
    overlay.append(dialog); document.body.append(overlay); buttons[0].focus();
  });
}
