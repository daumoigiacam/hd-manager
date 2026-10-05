import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DispatchSearchPicker from '../../../src/features/warehouse/DispatchSearchPicker.jsx';
import DispatchHistoryDialog from '../../../src/features/warehouse/DispatchHistoryDialog.jsx';
import DispatchShortageDialog from '../../../src/features/warehouse/DispatchShortageDialog.jsx';
import DispatchShortageList from '../../../src/features/warehouse/DispatchShortageList.jsx';
import DispatchHistoryCalendar from '../../../src/features/warehouse/DispatchHistoryCalendar.jsx';
import '../../../src/design-system/foundation.css';

function Fixture() {
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [panel, setPanel] = useState('');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState('2026-10');
  const shortageRows = [{ id: 'r', requestId: 'request-original', productLabel: 'Vịt không móc', sizeLabel: '2 kg', quantityLabel: '5 Con', requestDateLabel: '06/10' }];
  const historyRows = [{ id: 'd', customerName: 'Khách hàng có tên dài để kiểm tra bố cục', productName: 'Vịt không móc', pieceCount: 5, quantityUnit: 'Con', weightKg: 10 }];
  return <main style={{ maxWidth: 640, margin: 'auto', padding: 12 }}>
    <DispatchSearchPicker value={value} selectedId="" open={open} label="Tìm khách" placeholder="Tên KH"
      toggleLabel="Mở khách" emptyText="Không có kết quả" showEmpty={false} inputRef={inputRef}
      groups={[{ options: [{ id: 'customer-a', label: 'Khách A', detail: '0123456789' }] }]}
      onChange={setValue} onOpenChange={setOpen} onSelect={id => { setAction(id); setOpen(false); }} />
    <button onClick={() => setPanel('history')}>Mở lịch sử</button>
    <button onClick={() => setPanel('shortage')}>Mở đơn thiếu</button>
    <output>{action}</output>
    <DispatchShortageList expanded={expanded} onToggle={() => setExpanded(v => !v)}
      groups={Array.from({length: 5}, (_, i) => ({key: String(i), customerName: `Khách thiếu ${i}`, productLabels: ['VKM'], requestDateLabels: ['06/10/2026'], totalMissingLines: 1}))}
      onSelect={group => setAction(group.key)} requiredLines={5} dateLabel="06/10/2026" />
    <DispatchHistoryCalendar month={month.slice(5)} year={month.slice(0,4)} years={['2025','2026']}
      summary={{totalDays: 1, totalLines: 2, totalWeight: 10}} onMonthChange={setMonth} onSelect={setAction} formatNumber={String}
      cells={Array.from({length: 35}, (_, i) => ({dateKey: `day-${i}`, dayNumber: i % 30 + 1, isCurrentMonth: i < 30, isWorkingDate: i === 5, group: i === 5 ? {totalLines: 2} : null}))} />
    {panel === 'history' && <DispatchHistoryDialog dateLabel="06/10/2026" customerCount={1} lineCount={1} weight={10}
      rows={historyRows} canShare canDelete exporting={busy} onClose={() => setPanel('')}
      onShare={() => setAction('share')} onDelete={row => setAction(row.id)} formatNumber={String} compactProductName={name => name} />}
    {panel === 'shortage' && <DispatchShortageDialog customerName="Khách A" rows={shortageRows} canDelete deletingKey={busy ? 'r' : ''}
      closing={busy} onClose={() => setPanel('')} onDelete={row => { setAction(row.requestId); setBusy(true); }}
      onCloseShortage={() => setAction('closed-shortage')} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
