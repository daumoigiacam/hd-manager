(function () {
  const root = document.querySelector("[data-success-root]");
  if (!root) return;
  const config = window.HD_CONNECT_CONFIG || {};
  const heading = root.querySelector("[data-success-heading]");
  const note = root.querySelector("[data-success-note]");
  const paymentsEnabled = config.PAYMENTS_ENABLED === true || (config.PAYMENTS_ENABLED === undefined && config.paymentsEnabled === true);
  if (!paymentsEnabled) {
    if (heading) heading.textContent = "Thanh toán đang tạm khóa";
    if (note) note.textContent = "Website hiện ở chế độ MOCK_DISABLED; chưa có giao dịch hoặc subscription production nào được kích hoạt.";
  }
})();
