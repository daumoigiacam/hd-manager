import React from 'react';
import { createRoot } from 'react-dom/client';
import BusinessReportWorkspace from '../../../src/features/business-report/BusinessReportWorkspace.jsx';
import { buildExecutiveDashboardSnapshot } from '../../../src/services/executiveDashboardService.js';
import '../../../src/design-system/foundation.css';
const orders = Array.from({length:25}, (_, i) => ({id:'o'+i,code:'HD'+i,date:'2026-10-11',customerId:'c',salesEmpId:'e',amount:100000}));
const snapshot = buildExecutiveDashboardSnapshot({now:'2026-10-11T12:00:00',orders,
  employees:[{id:'e',name:'Nhân viên A',position:'Kinh doanh'}],
  customers:[{id:'c',name:'Khách hàng A',salesEmpId:'e'}]});
createRoot(document.getElementById('root')).render(<BusinessReportWorkspace snapshot={snapshot} orders={orders} />);
