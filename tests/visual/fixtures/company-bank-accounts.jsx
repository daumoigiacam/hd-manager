import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CompanyBankAccounts from '../../../src/features/settings/CompanyBankAccounts.jsx';
function Fixture() {
  const [company, setCompany] = useState({ bankId: 'VCB', bankName: 'Vietcombank', bankAccountName: 'CONG TY TEST', bankAccountNumber: '001234' });
  const [draft, setDraft] = useState(null);
  return <main style={{ maxWidth: 600, margin: 'auto', padding: 16 }}><CompanyBankAccounts company={company} banks={[{value:'VCB',label:'Vietcombank'}]} canEdit draft={draft} setDraft={setDraft} onSave={async patch => { setCompany(value => ({...value,...patch})); return {success:true}; }} /></main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
