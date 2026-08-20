(function () {
  const root = document.querySelector("[data-app-detail]");
  if (!root) return;

  const config = window.HD_CONNECT_CONFIG || {};
  const apiBase = String(config.apiBase || "").replace(/\/$/, "");
  const slug = new URLSearchParams(window.location.search).get("slug") || "hd-manager";
  const fallback = {
    slug: "hd-manager",
    name: "HD Manager",
    shortDescription: "Nền tảng quản lý doanh nghiệp trong hệ sinh thái HD CONNECT.",
    description: "HD Manager hỗ trợ doanh nghiệp quản lý khách hàng, sản phẩm, nhập hàng, xuất hàng, tồn kho, đơn hàng, công nợ, nhân sự và báo cáo.",
    features: ["Quản lý khách hàng và sản phẩm", "Kho, đơn hàng và công nợ", "Báo cáo vận hành rõ ràng", "Sẵn sàng mở rộng theo quy mô"]
  };
  const byId = (id) => document.getElementById(id);
  const text = (id, value) => { const element = byId(id); if (element) element.textContent = value || ""; };
  const render = (app) => {
    const item = { ...fallback, ...app };
    text("app-detail-eyebrow", "Ứng dụng HD CONNECT");
    text("app-detail-name", item.name);
    text("app-detail-summary", item.shortDescription || item.description);
    text("app-detail-description", item.description || item.shortDescription);
    document.title = `${item.name} | HD CONNECT`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = `https://hdconnect.net/apps/${encodeURIComponent(item.slug)}`;
    const list = byId("app-detail-features");
    if (list) {
      list.replaceChildren();
      const features = Array.isArray(item.features) ? item.features : fallback.features;
      features.forEach((feature) => {
        const li = document.createElement("li");
        li.textContent = typeof feature === "string" ? feature : String(feature.name || "Tính năng");
        list.appendChild(li);
      });
    }
    const plans = byId("app-detail-plans");
    if (plans) {
      plans.replaceChildren();
      (item.plans || []).forEach((plan) => {
        const card = document.createElement("article");
        card.className = "commerce-plan";
        const title = document.createElement("h3");
        title.textContent = plan.name;
        card.appendChild(title);
        const description = document.createElement("p");
        description.textContent = plan.description || "Gói dịch vụ được cấu hình từ Commerce Billing.";
        card.appendChild(description);
        const link = document.createElement("a");
        link.className = "btn btn-primary";
        link.href = `checkout.html?productId=${encodeURIComponent(plan.productId || item.id || "")}&planId=${encodeURIComponent(plan.id)}`;
        link.textContent = "Mở checkout framework";
        card.appendChild(link);
        plans.appendChild(card);
      });
    }
  };

  render(fallback);
  fetch(`${apiBase}/api/v1/billing-commerce/products/${encodeURIComponent(slug)}`, { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("product unavailable")))
    .then((payload) => render(payload.data || payload))
    .catch(() => {
      // The generic fallback remains visible when the catalog is disabled.
    });
})();
