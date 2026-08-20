(function () {
  const root = document.querySelector("[data-account-root]");
  if (!root) return;

  const view = new URLSearchParams(window.location.search).get("view") || "overview";
  const labels = {
    overview: ["Tài khoản HD CONNECT", "Customer portal foundation"],
    orders: ["Đơn hàng", "Danh sách đơn hàng sẽ hiển thị sau khi đăng nhập."],
    invoices: ["Hóa đơn", "Hóa đơn và snapshot VAT sẽ hiển thị sau khi đăng nhập."],
    subscriptions: ["Gói dịch vụ", "Subscription và chu kỳ sử dụng sẽ hiển thị sau khi đăng nhập."],
    profile: ["Hồ sơ khách hàng", "Thông tin hồ sơ sẽ được lấy từ tài khoản đã xác thực."]
  };
  const current = labels[view] || labels.overview;
  const heading = root.querySelector("[data-account-heading]");
  const note = root.querySelector("[data-account-note]");
  if (heading) heading.textContent = current[0];
  if (note) note.textContent = current[1];
  root.querySelectorAll("[data-account-view]").forEach((item) => {
    item.hidden = item.dataset.accountView !== view;
  });
})();
