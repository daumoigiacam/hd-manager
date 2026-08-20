(function () {
  const root = document.querySelector("[data-apps-root]");
  if (!root) return;

  const productsRoot = root.querySelector("[data-apps-products]");
  const emptyState = root.querySelector("[data-apps-empty]");
  const config = window.HD_CONNECT_CONFIG || {};
  const apiBase = String(config.apiBase || "").replace(/\/$/, "");
  const fallbackApps = [
    {
      slug: "hd-manager",
      name: "HD Manager",
      shortDescription: "Nền tảng quản lý khách hàng, hàng hóa, kho, đơn hàng và vận hành doanh nghiệp.",
      status: "Sẵn sàng giới thiệu"
    }
  ];

  const text = (tag, value, className) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
  };

  const render = (apps) => {
    if (!productsRoot) return;
    productsRoot.replaceChildren();
    apps.forEach((app) => {
      const card = document.createElement("article");
      card.className = "app-card reveal is-visible";
      card.appendChild(text("span", app.status || "Ứng dụng SaaS", "status-pill"));
      card.appendChild(text("h2", app.name));
      card.appendChild(text("p", app.shortDescription || app.description || "Ứng dụng trong hệ sinh thái HD CONNECT."));
      const link = document.createElement("a");
      link.className = "btn btn-primary";
      link.href = `app-detail.html?slug=${encodeURIComponent(app.slug)}`;
      link.textContent = "Xem ứng dụng";
      card.appendChild(link);
      productsRoot.appendChild(card);
    });
    if (emptyState) emptyState.hidden = apps.length > 0;
  };

  render(fallbackApps);
  fetch(`${apiBase}/api/v1/billing-commerce/catalog`, { headers: { Accept: "application/json" } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error("catalog unavailable")))
    .then((payload) => {
      const apps = Array.isArray(payload) ? payload : (payload.items || payload.data || []);
      if (apps.length) render(apps);
    })
    .catch(() => {
      // The public fallback keeps the Apps page useful while the API is disabled.
    });
})();
