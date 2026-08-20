(function () {
  const root = document.querySelector("[data-payment-root]");
  if (!root) return;

  const publicId = new URLSearchParams(window.location.search).get("order") || "";
  const config = window.HD_CONNECT_CONFIG || {};
  const paymentsEnabled = config.PAYMENTS_ENABLED === true || (config.PAYMENTS_ENABLED === undefined && config.paymentsEnabled === true);
  const apiBase = String(root.dataset.apiBase || config.apiBase || "").replace(/\/$/, "");
  const status = root.querySelector("[data-payment-status]");
  const note = root.querySelector("[data-payment-note]");
  const summary = root.querySelector("[data-payment-summary]");
  const qr = document.querySelector("[data-payment-qr]");
  const bank = document.querySelector("[data-payment-bank]");
  const copyCode = root.querySelector("[data-copy-code]");
  const copyAmount = root.querySelector("[data-copy-amount]");
  let order = null;
  let timer = null;

  const unwrap = (payload) => payload && payload.data ? payload.data : payload;
  const formatMoney = (value, currency) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: currency || "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
  const setStatus = (title, message) => { if (status) status.textContent = title; if (note) note.textContent = message; };
  const row = (label, value, strong) => {
    const element = document.createElement("div");
    element.appendChild(document.createElement("span")).textContent = label;
    const valueElement = document.createElement(strong ? "strong" : "span");
    valueElement.textContent = value || "";
    element.appendChild(valueElement);
    return element;
  };
  const renderOrder = () => {
    if (!order || !summary) return;
    summary.replaceChildren(row("Mã đơn", order.orderNumber), row("Sản phẩm", order.product?.name), row("Gói", order.plan?.name), row("Giá trước VAT", formatMoney(order.subtotal, order.currency)), row("VAT", formatMoney(order.vatAmount, order.currency)), row("Tổng thanh toán", formatMoney(order.totalAmount, order.currency), true), row("Mã thanh toán", order.paymentCode));
    if (copyCode) copyCode.disabled = false;
    if (copyAmount) copyAmount.disabled = false;
  };
  const copy = (value, button) => {
    if (!value || !navigator.clipboard) return;
    navigator.clipboard.writeText(String(value)).then(() => { if (button) { const old = button.textContent; button.textContent = "Đã sao chép"; window.setTimeout(() => { button.textContent = old; }, 1400); } });
  };
  const loadIntent = () => fetch(`${apiBase}/api/v1/billing-commerce/orders/${encodeURIComponent(publicId)}/payment-intent`, { method: "POST", headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("QR unavailable"))).then(unwrap).then((intent) => {
    if (qr && intent.qrImageUrl) { qr.src = intent.qrImageUrl; qr.hidden = false; }
    if (bank) bank.textContent = [intent.bankName, intent.accountNumber, intent.accountName].filter(Boolean).join(" · ") || "Thông tin nhận tiền được cấu hình ở backend.";
  });
  const poll = () => fetch(`${apiBase}/api/v1/billing-commerce/orders/${encodeURIComponent(publicId)}`, { headers: { Accept: "application/json" } }).then((response) => response.ok ? response.json() : Promise.reject(new Error("order unavailable"))).then(unwrap).then((payload) => {
    order = payload;
    renderOrder();
    if (order.status === "PAID") { setStatus("Thanh toán thành công", "Đơn hàng đã được backend xác nhận và gói dịch vụ đã được kích hoạt."); if (timer) window.clearInterval(timer); }
    else if (order.status === "EXPIRED") { setStatus("Đơn hàng đã hết hạn", "Vui lòng tạo lại đơn hàng để nhận mã thanh toán mới."); if (timer) window.clearInterval(timer); }
    else setStatus("Đang chờ thanh toán...", "Chỉ webhook đã xác minh từ backend mới làm thay đổi trạng thái.");
  });

  if (!publicId) { setStatus("Thiếu mã đơn hàng", "Vui lòng quay lại checkout để tạo đơn mới."); return; }
  if (!paymentsEnabled) {
    setStatus("Thanh toán đang tạm khóa", "Website đang ở chế độ MOCK_DISABLED; chưa kết nối SePay hoặc ngân hàng production.");
    return;
  }
  copyCode?.addEventListener("click", () => copy(order?.paymentCode, copyCode));
  copyAmount?.addEventListener("click", () => copy(order?.totalAmount, copyAmount));
  poll().then(() => {
    if (order?.status === "PENDING_PAYMENT") return loadIntent();
    return null;
  }).catch(() => setStatus("Không thể tải đơn hàng", "Vui lòng kiểm tra liên kết hoặc liên hệ hỗ trợ."));
  timer = window.setInterval(poll, 5000);
})();
