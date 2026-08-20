(function () {
  const catalogRoot = document.querySelector("[data-commerce-catalog]");
  if (!catalogRoot) return;

  const fallback = document.querySelector("[data-commerce-fallback]");
  const productsRoot = catalogRoot.querySelector("[data-commerce-products]");
  const config = window.HD_CONNECT_CONFIG || {};
  const apiBase = String(catalogRoot.dataset.apiBase || config.apiBase || "").replace(/\/$/, "");
  const endpoint = `${apiBase}/api/v1/billing-commerce/catalog`;

  const formatMoney = (value, currency) => new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currency || "VND",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

  const intervalLabel = (interval, count) => {
    const labels = { DAY: "ngày", MONTH: "tháng", YEAR: "năm" };
    const label = labels[String(interval || "").toUpperCase()] || String(interval || "chu kỳ").toLowerCase();
    return `${count > 1 ? `${count} ` : ""}${label}`;
  };

  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
  };

  const renderPlan = (plan) => {
    const card = document.createElement("article");
    card.className = "commerce-plan";
    card.appendChild(text("h4", plan.name));
    card.appendChild(text("p", plan.description || "Gói dịch vụ linh hoạt theo nhu cầu."));
    card.appendChild(text("div", `${formatMoney(plan.priceMinor, plan.currency)} / ${intervalLabel(plan.billingInterval, plan.billingIntervalCount)}`, "commerce-plan-price"));
    card.appendChild(text("div", plan.vatMode === "NO_VAT" ? "Không tính VAT" : "VAT sẽ được hiển thị rõ trước khi thanh toán.", "commerce-plan-meta"));
    const link = document.createElement("a");
    link.className = "btn btn-primary";
    link.href = `checkout.html?productId=${encodeURIComponent(plan.productId || "")}&planId=${encodeURIComponent(plan.id)}`;
    link.textContent = plan.trialDays > 0 ? "Dùng thử" : "Mua ngay";
    card.appendChild(link);
    return card;
  };

  const renderProduct = (product) => {
    const card = document.createElement("article");
    card.className = "commerce-product";
    card.appendChild(text("h3", product.name));
    card.appendChild(text("p", product.shortDescription || product.description || "Ứng dụng SaaS của HD CONNECT."));
    const list = document.createElement("div");
    list.className = "commerce-plan-list";
    (product.plans || []).forEach((plan) => {
      const planWithProduct = { ...plan, productId: product.id };
      list.appendChild(renderPlan(planWithProduct));
    });
    card.appendChild(list);
    return card;
  };

  fetch(endpoint, { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog unavailable")))
    .then((payload) => {
      const products = Array.isArray(payload) ? payload : (payload.items || payload.data || []);
      if (!products.length || !productsRoot) return;
      products.forEach((product) => productsRoot.appendChild(renderProduct(product)));
      catalogRoot.hidden = false;
      if (fallback) fallback.hidden = true;
    })
    .catch(() => {
      // The static fallback remains visible until the public API is configured.
    });
})();
