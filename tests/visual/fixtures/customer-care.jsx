import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CustomerCareSettings, { CARE_RULES } from '../../../src/features/settings/CustomerCareSettings.jsx';
function Fixture() {
  const [company, setCompany] = useState({});
  const [selected, setSelected] = useState('');
  return <main className="mx-auto max-w-xl p-4"><header className="mb-5 flex items-center gap-3"><button aria-label="Quay lại" onClick={() => setSelected('')}>←</button><h1>{CARE_RULES.find(([id]) => id === selected)?.[1] || 'Nhắc khách hàng'}</h1></header><CustomerCareSettings company={company} selected={selected} onSelect={setSelected} canEdit onSave={async patch => { setCompany({ ...company, ...patch }); return { success: true }; }} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
