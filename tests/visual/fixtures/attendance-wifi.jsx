import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AttendanceWorkspace from '../../../src/features/attendance/AttendanceWorkspace.jsx';

function Fixture() {
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [record, setRecord] = useState(null);
  const [wifiPermission, setPermission] = useState({ granted: true });
  const [screen, setScreen] = useState('wifi');
  const [role, setRole] = useState('Sản xuất');
  const today = new Date().toLocaleDateString('sv-SE');
  const stats = window.__wifiTest ||= { toggles: 0, saves: 0 };
  stats.setPermission = value => setPermission({ granted: value });
  stats.setRecord = setRecord;
  const toggle = () => {
    if (saving) return;
    stats.toggles++;
    setSaving(true);
    stats.finish = success => {
      setSaving(false);
      if (success) { setEnabled(value => !value); setStatus('Đã lưu cài đặt.'); }
      else setStatus('Không lưu được cài đặt tự động.');
    };
  };
  return <AttendanceWorkspace screen={screen} onScreenChange={setScreen} currentEmployee={{ id: 'test', name: 'Nhân sự Test', position: 'Sản xuất' }}
    currentCompany={{ id: 'test-company', attendanceWifiSsid: 'WiFi công ty HD', attendanceWifiBssid: 'aa:bb:cc:dd:ee:01' }}
    attendance={{}} date={today} record={record} shiftPolicy={{ shiftStart: '07:30', shiftEnd: '16:30', shiftName: 'Ca sản xuất' }}
    wifiInfo={{ ssid: 'WiFi công ty HD', bssid: 'aa:bb:cc:dd:ee:01' }} wifiPermission={wifiPermission} wifiMatches wifiConfigured wifiSupported
    autoEnabled={enabled} autoSaving={saving} onToggleAuto={toggle} statusMessage={status} canManageWifi
    onRefreshWifi={() => {}} onSaveCompanyWifi={() => { stats.saves++; }} selfMethod="wifi" onSelectMethod={() => {}}
    onCheckIn={() => {}} workRoles={['Sản xuất', 'Tài xế']} workRole={role} onSelectWorkRole={setRole} onLeave={() => {}} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
