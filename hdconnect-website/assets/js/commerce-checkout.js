(function () {
  const form = document.querySelector("[data-checkout-form]");
  if (!(form instanceof HTMLFormElement)) return;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("productId") || "";
  const planId = params.get("planId") || "";
  const config = window.HD_CONNECT_CONFIG || {};
  const paymentsEnabled = config.PAYMENTS_ENABLED === true || (config.PAYMENTS_ENABLED === undefined && config.paymentsEnabled === true);
  const apiBase = String(form.dataset.apiBase || config.apiBase || "").replace(/\/$/, "");
  const note = form.querySelector("[data-checkout-note]");
  const summary = document.querySelector("[data-checkout-summary]");
  const typeSelect = form.querySelector("[data-customer-type]");
  const individualField = form.querySelector("[data-individual-field]");
  const businessFields = [...form.querySelectorAll("[data-business-field]")];
  const addressField = form.querySelector("[data-address-field]");

  const formatMoney = (value, currency) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: currency || "VND", maximumFractionDigits: 0 }).format(Number(value || 0));
  const unwrap = (payload) => payload && payload.data ? payload.data : payload;
  const setNote = (value) => { if (note) note.textContent = value; };

  if (!paymentsEnabled) {
    setNote("Thanh toán đang tạm khóa ở chế độ MOCK_DISABLED. Website chưa nhận tiền thật hoặc kích hoạt subscription production.");
  }

  const renderSummary = (product, plan) => {
    if (!summary) return;
    summary.replaceChildren();
    [["Ứng dụng", product.name], ["Gói", plan.name], ["Giá niêm yết", formatMoney(plan.priceMinor, plan.currency)], ["VAT", plan.vatMode === "NO_VAT" ? "Không tính VAT" : "Tính theo cấu hình backend"], ["Chu kỳ", `${plan.billingIntervalCount > 1 ? `${plan.billingIntervalCount} ` : ""}${String(plan.billingInterval || "").toLowerCase()}`]].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.appendChild(document.createElement("span")).textContent = label;
      row.appendChild(document.createElement("strong")).textContent = value;
      summary.appendChild(row);
    });
  };

  const refreshFields = () => {
    const isIndividual = typeSelect && typeSelect.value === "INDIVIDUAL";
    businessFields.forEach((field) => {
      field.hidden = isIndividual;
      const input = field.querySelector("input");
      if (input) input.required = !isIndividual && ["businessName", "representativeName"].includes(input.name);
    });
    if (individualField) individualField.required = Boolean(isIndividual);
    if (addressField) addressField.required = !isIndividual;
  };

  typeSelect?.addEventListener("change", refreshFields);
  refreshFields();

  fetch(`${apiBase}/api/v1/billing-commerce/catalog`, { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog unavailable")))
    .then(unwrap)
    .then((products) => {
      const product = (products || []).find((item) => item.id === productId);
      const plan = product?.plans?.find((item) => item.id === planId);
      if (!product || !plan) throw new Error("plan unavailable");
      renderSummary(product, plan);
    })
    .catch(() => setNote("Không thể tải gói dịch vụ. Vui lòng quay lại bảng giá hoặc liên hệ hỗ trợ."));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!paymentsEnabled) {
      setNote("Checkout framework đã sẵn sàng, nhưng thanh toán hiện đang tắt để bảo vệ production.");
      return;
    }
    setNote("Đang tạo đơn hàng...");
    const data = new FormData(form);
    const body = Object.fromEntries(data.entries());
    body.productId = productId;
    body.planId = planId;
    fetch(`${apiBase}/api/v1/billing-commerce/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    })
      .then((response) => response.ok ? response.json() : response.json().then((payload) => Promise.reject(new Error(payload?.error?.message || "Không thể tạo đơn hàng."))))
      .then(unwrap)
      .then((payload) => { window.location.href = `payment.html?order=${encodeURIComponent(payload.order?.publicId || payload.publicId)}`; })
      .catch((error) => setNote(error.message || "Không thể tạo đơn hàng. Vui lòng thử lại."));
  });
})();
