const today = new Date().toISOString().split('T')[0];
const month = today.slice(0, 7);

export const seedData = {
  companies: {
    comp_preview: {
      id: 'comp_preview',
      name: 'Công ty HD Preview',
      ownerPhone: '0909000001',
      createdAt: today,
      status: 'trial'
    }
  },
  employees: {
    emp_admin: {
      id: 'emp_admin',
      companyId: 'comp_preview',
      phone: '0909000001',
      name: 'Quản trị Demo',
      position: 'Chủ doanh nghiệp',
      role: 'super_admin',
      startDate: `${month}-01`,
      probationDuration: 0,
      probationUnit: 'days',
      probationRate: 100,
      basicSalary: 0,
      supportSalary: 0,
      experienceSalary: 0,
      commissionRate: 0,
      targetRevenue: 0,
      overtimeRate: 0
    },
    emp_sales_01: {
      id: 'emp_sales_01',
      companyId: 'comp_preview',
      phone: '0909000002',
      name: 'Ngọc Anh',
      position: 'Kinh doanh',
      role: 'employee',
      startDate: `${month}-01`,
      probationDuration: 1,
      probationUnit: 'months',
      probationRate: 85,
      basicSalary: 9000000,
      supportSalary: 1200000,
      experienceSalary: 0,
      commissionRate: 0.01,
      targetRevenue: 80000000,
      overtimeRate: 45000
    },
    emp_driver_01: {
      id: 'emp_driver_01',
      companyId: 'comp_preview',
      phone: '0909000003',
      name: 'Minh Tài',
      position: 'Tài xế',
      role: 'employee',
      startDate: `${month}-03`,
      probationDuration: 2,
      probationUnit: 'weeks',
      probationRate: 90,
      basicSalary: 7500000,
      supportSalary: 900000,
      experienceSalary: 0,
      commissionRate: 0,
      targetRevenue: 0,
      overtimeRate: 40000
    }
  },
  customers: {
    c_preview_01: {
      id: 'c_preview_01',
      companyId: 'comp_preview',
      empId: 'emp_sales_01',
      name: 'Cửa hàng Lan Anh',
      phone: '0911222333',
      address: 'Quận 1, TP.HCM',
      isArchived: false
    },
    c_preview_02: {
      id: 'c_preview_02',
      companyId: 'comp_preview',
      empId: 'emp_sales_01',
      name: 'Tạp hóa Hưng Phát',
      phone: '0988666555',
      address: 'Thủ Đức, TP.HCM',
      isArchived: false
    }
  },
  products: {
    prod_preview_01: {
      id: 'prod_preview_01',
      companyId: 'comp_preview',
      name: 'Nước giặt HD',
      category: 'Hóa phẩm',
      unit: 'Can',
      price: 285000,
      cost: 210000,
      stock: 48,
      isArchived: false
    },
    prod_preview_02: {
      id: 'prod_preview_02',
      companyId: 'comp_preview',
      name: 'Khăn giấy Soft',
      category: 'Tiêu dùng',
      unit: 'Thùng',
      price: 320000,
      cost: 250000,
      stock: 32,
      isArchived: false
    }
  },
  orders: {
    o_preview_01: {
      id: 'o_preview_01',
      companyId: 'comp_preview',
      empId: 'emp_sales_01',
      customerId: 'c_preview_01',
      customerName: 'Cửa hàng Lan Anh',
      amount: 5200000,
      date: today,
      note: 'Giao trong ngày',
      isArchived: false
    },
    o_preview_02: {
      id: 'o_preview_02',
      companyId: 'comp_preview',
      empId: 'emp_sales_01',
      customerId: 'c_preview_02',
      customerName: 'Tạp hóa Hưng Phát',
      amount: 11800000,
      date: `${month}-05`,
      note: 'Đơn định kỳ',
      isArchived: false
    }
  },
  payments: {
    p_preview_01: {
      id: 'p_preview_01',
      companyId: 'comp_preview',
      customerId: 'c_preview_01',
      amount: 2000000,
      note: 'Thanh toán đợt 1',
      date: today,
      isArchived: false
    }
  },
  advances: {
    adv_preview_01: {
      id: 'adv_preview_01',
      companyId: 'comp_preview',
      empId: 'emp_sales_01',
      amount: 1500000,
      reason: 'Ứng chi phí đi thị trường',
      date: `${month}-04`,
      status: 'pending'
    }
  },
  financials: {
    f_preview_01: {
      id: 'f_preview_01',
      companyId: 'comp_preview',
      empId: 'emp_sales_01',
      type: 'bonus',
      amount: 1000000,
      reason: 'Thưởng doanh số đầu tháng',
      date: `${month}-06`,
      isArchived: false
    },
    f_preview_02: {
      id: 'f_preview_02',
      companyId: 'comp_preview',
      empId: 'emp_driver_01',
      type: 'penalty',
      amount: 200000,
      reason: 'Đi giao trễ',
      date: `${month}-07`,
      isArchived: false
    }
  },
  expenses: {
    exp_preview_01: {
      id: 'exp_preview_01',
      companyId: 'comp_preview',
      empId: 'emp_admin',
      type: 'Vận hành',
      category: 'Điện nước',
      amount: 850000,
      note: 'Điện nước văn phòng',
      date: `${month}-02`,
      isArchived: false
    }
  },
  holidays: {
    hol_preview_01: {
      id: 'hol_preview_01',
      companyId: 'comp_preview',
      date: `${month}-30`,
      name: 'Thưởng cuối tháng',
      type: 'fixed',
      value: 200000
    }
  },
  performance: {
    emp_sales_01: {
      companyId: 'comp_preview',
      overtime: 4
    },
    emp_driver_01: {
      companyId: 'comp_preview',
      overtime: 2
    }
  },
  attendance: {
    [`${today}_emp_sales_01`]: {
      companyId: 'comp_preview',
      status: 'present',
      checkIn: `${today}T08:03:00.000Z`,
      checkOut: `${today}T17:40:00.000Z`,
      checkInMethod: 'GPS',
      checkOutMethod: 'GPS'
    },
    [`${today}_emp_driver_01`]: {
      companyId: 'comp_preview',
      status: 'late',
      checkIn: `${today}T06:48:00.000Z`,
      checkOut: `${today}T16:20:00.000Z`,
      checkInMethod: 'WiFi',
      checkOutMethod: 'WiFi'
    }
  }
};
