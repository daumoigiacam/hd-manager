const failure = (code, message) => Object.assign(new Error(message), {code});

// Wait only BEFORE invoking a creation. A mutation is never replayed: the
// existing Firestore transaction still owns duplicate checks and server ACK.
export function createOrderCreationAdmission({timeoutMs = 30000} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Invalid creation wait timeout');
  let current = {identity: '', ready: false, callback: null, error: null};
  const waiting = new Set();
  const check = identity => {
    if (!identity || current.identity !== identity) {
      throw failure('read-owner-changed', 'Phiên làm việc hoặc quyền đã thay đổi. Đơn chưa tạo được giữ lại; vui lòng mở lại trong phiên hiện tại.');
    }
    if (current.error) throw current.error;
  };
  return {
    update(next) {
      // Revoke outstanding waits even if the same owner is restored before
      // their promise continuations run (logout/login, role or route change).
      const previousIdentity = current.identity;
      current = next;
      for (const wake of [...waiting]) wake(previousIdentity !== next.identity
        ? failure('read-owner-changed', 'Phiên làm việc hoặc quyền đã thay đổi. Đơn chưa tạo được giữ lại; vui lòng mở lại trong phiên hiện tại.')
        : next.error);
    },
    cancel() {
      current = {identity: '', ready: false, callback: null, error: null};
      for (const wake of [...waiting]) wake(failure('read-owner-changed', 'Màn hình tạo đơn đã đóng. Đã dừng các đơn chưa tạo.'));
    },
    async run(args, identity) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        check(identity);
        if (current.ready) {
          if (typeof current.callback !== 'function') throw failure('missing-order-handler', 'Chưa thể tạo đơn trong phiên này.');
          return current.callback(...args);
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw failure('source-not-ready', 'Chưa xác minh xong dữ liệu đối chiếu. Các đơn chưa tạo vẫn được giữ; hãy kiểm tra kết nối rồi thử lại.');
        await new Promise((resolve, reject) => {
          const wake = error => {
            clearTimeout(timer);
            waiting.delete(wake);
            if (error) reject(error); else resolve();
          };
          const timer = setTimeout(() => wake(failure('source-not-ready', 'Chưa xác minh xong dữ liệu đối chiếu. Các đơn chưa tạo vẫn được giữ; hãy kiểm tra kết nối rồi thử lại.')), remaining);
          waiting.add(wake);
        });
      }
    },
  };
}
