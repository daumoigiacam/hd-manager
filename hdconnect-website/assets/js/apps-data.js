// Public catalog metadata. Add one record and three policy pages for each new app.
window.HD_CONNECT_APPS = Object.freeze([
  {
    slug: "hd-manager",
    name: "HD Manager",
    category: "Quản lý doanh nghiệp",
    status: "Đang phát hành",
    shortDescription: "Quản lý khách hàng, hàng hóa, kho, đơn hàng và vận hành doanh nghiệp.",
    description: "HD Manager hỗ trợ doanh nghiệp quản lý khách hàng, sản phẩm, nhập hàng, xuất hàng, tồn kho, đơn hàng, công nợ, nhân sự và báo cáo.",
    features: [
      "Quản lý khách hàng và sản phẩm",
      "Kho, đơn hàng và công nợ",
      "Báo cáo vận hành rõ ràng",
      "Sẵn sàng mở rộng theo quy mô"
    ],
    policyNote: "Chính sách riêng cho HD Manager, bao gồm quyền riêng tư, điều khoản và yêu cầu xóa dữ liệu.",
    policies: {
      privacy: "/apps/hd-manager/privacy",
      terms: "/apps/hd-manager/terms",
      deletion: "/apps/hd-manager/delete-data"
    }
  },
  {
    slug: "can-gia-cam",
    name: "Cân gia cầm",
    category: "Chăn nuôi",
    status: "Sắp phát hành",
    shortDescription: "Ghi nhận, quản lý và tra cứu dữ liệu cân gia cầm cho hộ chăn nuôi và doanh nghiệp.",
    description: "Cân gia cầm giúp người dùng ghi nhận số lượng, trọng lượng, lô cân và các thông tin vận hành liên quan một cách rõ ràng, có thể đối soát và dễ xuất báo cáo.",
    features: [
      "Ghi nhận số lượng và trọng lượng theo lô",
      "Theo dõi lịch sử cân và ghi chú vận hành",
      "Hỗ trợ đối soát dữ liệu chăn nuôi",
      "Sẵn sàng kết nối quy trình quản lý mở rộng"
    ],
    policyNote: "Chính sách độc lập cho Cân gia cầm, sẵn sàng dùng làm URL công khai khi phát hành trên Google Play.",
    policies: {
      privacy: "/apps/can-gia-cam/privacy",
      terms: "/apps/can-gia-cam/terms",
      deletion: "/apps/can-gia-cam/delete-data"
    }
  }
]);
