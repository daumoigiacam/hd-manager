import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';

export default function IdentitySecurityCenter({
  identityApi,
  identityUser,
  onGetIdentityToken,
  onLogout,
}) {
  const {
    getIdentityDevice,
    identityCompleteSetup,
    identityListAudit,
    identityListDevices,
    identityRevokeDevices,
    identitySetBiometric,
    identityVerifyPin,
  } = identityApi;
  const [expanded, setExpanded] = useState(false);
  const [devices, setDevices] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [securityStatus, setSecurityStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeEditor, setActiveEditor] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const device = useMemo(() => getIdentityDevice(), [getIdentityDevice]);
  const identityReady = Boolean(identityUser?.phone || identityUser?.id);

  const refreshSecurityData = useCallback(async () => {
    if (!identityReady) return;
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const idToken = await onGetIdentityToken?.();
      if (!idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
      const [deviceResult, auditResult] = await Promise.all([
        identityListDevices({ idToken }),
        identityListAudit({ idToken }),
      ]);
      setDevices(deviceResult?.devices || []);
      setAuditEntries(auditResult?.entries || []);
      const currentDevice = (deviceResult?.devices || []).find(item => item.deviceId === device.deviceId);
      setBiometricEnabled(Boolean(currentDevice?.biometricEnabled));
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể tải thông tin bảo mật.');
    } finally {
      setIsLoading(false);
    }
  }, [device.deviceId, identityListAudit, identityListDevices, identityReady, onGetIdentityToken]);

  useEffect(() => {
    if (expanded) refreshSecurityData();
  }, [expanded, refreshSecurityData]);

  const runSensitiveUpdate = async (event) => {
    event.preventDefault();
    if (!identityReady) return;
    if (!/^\d{6}$/.test(currentPin)) {
      setSecurityStatus('Nhập PIN hiện tại gồm 6 số để xác nhận thay đổi.');
      return;
    }
    if (activeEditor === 'password' && (!newPassword || newPassword !== newPasswordConfirm)) {
      setSecurityStatus('Mật khẩu mới chưa khớp.');
      return;
    }
    if (activeEditor === 'pin' && (!/^\d{6}$/.test(newPin) || newPin !== newPinConfirm)) {
      setSecurityStatus('PIN mới phải gồm 6 số và khớp xác nhận.');
      return;
    }
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const idToken = await onGetIdentityToken?.();
      if (!idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
      await identityVerifyPin({ idToken, pin: currentPin });
      const result = await identityCompleteSetup({
        idToken,
        password: activeEditor === 'password' ? newPassword : undefined,
        pin: activeEditor === 'pin' ? newPin : undefined,
      });
      setSecurityStatus(activeEditor === 'password' ? 'Đã đổi mật khẩu.' : 'Đã đổi PIN.');
      setActiveEditor('');
      setCurrentPin('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setNewPin('');
      setNewPinConfirm('');
      if (result?.setup) setBiometricEnabled(Boolean(result.setup.biometricEnabled));
      await refreshSecurityData();
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể cập nhật thông tin bảo mật.');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleBiometric = async () => {
    if (!identityReady) return;
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const idToken = await onGetIdentityToken?.();
      if (!idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
      const result = await identitySetBiometric({ idToken, enabled: !biometricEnabled, identity: identityUser });
      setBiometricEnabled(Boolean(result?.setup?.biometricEnabled));
      setSecurityStatus(!biometricEnabled ? 'Đã bật Face ID / vân tay trên thiết bị này.' : 'Đã tắt yêu cầu Face ID / vân tay trên thiết bị này.');
      await refreshSecurityData();
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể cập nhật Face ID / vân tay.');
    } finally {
      setIsLoading(false);
    }
  };

  const revokeDevice = async (deviceId, all = false) => {
    if (!identityReady || !window.confirm(all ? 'Đăng xuất khỏi tất cả thiết bị tin cậy?' : 'Thu hồi thiết bị này?')) return;
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const idToken = await onGetIdentityToken?.();
      if (!idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
      await identityRevokeDevices({ idToken, deviceId, all, identity: identityUser });
      if (all || deviceId === device.deviceId) {
        await onLogout?.();
        return;
      }
      setSecurityStatus('Đã thu hồi thiết bị.');
      await refreshSecurityData();
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể thu hồi thiết bị.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAuditTime = (value) => {
    try {
      return new Date(value).toLocaleString('vi-VN');
    } catch {
      return '';
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Lock size={18} /></span>
          <span>
            <strong className="block text-sm text-slate-900">Bảo mật tài khoản</strong>
            <span className="mt-0.5 block text-xs text-slate-500">Thiết bị tin cậy, PIN và lịch sử đăng nhập</span>
          </span>
        </span>
        {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>
      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          {!identityReady ? (
            <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Tài khoản này chưa hoàn tất Identity Center. Hãy đăng xuất và đăng nhập lại để thiết lập PIN và thiết bị tin cậy.</div>
          ) : (
            <>
              <div className="grid gap-2">
                <div className="rounded-xl bg-slate-50 p-3 text-xs">
                  <span className="block text-slate-500">Số điện thoại</span>
                  <strong className="mt-1 block text-slate-800">{identityUser.phone || 'Chưa cập nhật'}</strong>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => setActiveEditor(activeEditor === 'password' ? '' : 'password')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">Đổi mật khẩu</button>
                <button type="button" onClick={() => setActiveEditor(activeEditor === 'pin' ? '' : 'pin')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">Đổi PIN 6 số</button>
                <button type="button" onClick={toggleBiometric} disabled={isLoading} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 disabled:opacity-50">{biometricEnabled ? 'Tắt Face ID / vân tay' : 'Bật Face ID / vân tay'}</button>
              </div>
              {activeEditor && (
                <form onSubmit={runSensitiveUpdate} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {activeEditor === 'password' && (
                    <>
                      <input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Mật khẩu mới" autoComplete="new-password" />
                      <input type="password" value={newPasswordConfirm} onChange={event => setNewPasswordConfirm(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Xác nhận mật khẩu mới" autoComplete="new-password" />
                    </>
                  )}
                  {activeEditor === 'pin' && (
                    <>
                      <input type="password" inputMode="numeric" maxLength={6} value={newPin} onChange={event => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tracking-[0.3em] outline-none focus:border-emerald-500" placeholder="PIN mới" />
                      <input type="password" inputMode="numeric" maxLength={6} value={newPinConfirm} onChange={event => setNewPinConfirm(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tracking-[0.3em] outline-none focus:border-emerald-500" placeholder="Xác nhận PIN mới" />
                    </>
                  )}
                  <input type="password" inputMode="numeric" maxLength={6} value={currentPin} onChange={event => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tracking-[0.3em] outline-none focus:border-emerald-500" placeholder="PIN hiện tại để xác nhận" />
                  <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isLoading ? 'Đang lưu...' : 'Xác nhận thay đổi'}</button>
                </form>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">Thiết bị tin cậy</h4>
                  <button type="button" onClick={refreshSecurityData} disabled={isLoading} className="text-xs font-semibold text-emerald-700">Làm mới</button>
                </div>
                {(devices || []).map(item => (
                  <div key={item.deviceId} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-xs">
                    <span className="min-w-0">
                      <strong className="block truncate text-slate-800">{item.name || 'Thiết bị'}</strong>
                      <span className="block truncate text-slate-500">{item.platform} · Lần cuối {formatAuditTime(item.lastLoginAt)}</span>
                    </span>
                    {item.revokedAt ? <span className="text-slate-400">Đã thu hồi</span> : <button type="button" onClick={() => revokeDevice(item.deviceId)} className="shrink-0 font-semibold text-red-600">Thu hồi</button>}
                  </div>
                ))}
                <button type="button" onClick={() => revokeDevice('', true)} disabled={isLoading || devices.length === 0} className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50">Đăng xuất tất cả thiết bị</button>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-900">Lịch sử bảo mật</h4>
                {auditEntries.length ? auditEntries.slice(0, 8).map(entry => (
                  <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <span className="font-medium text-slate-700">{`${entry.action || ''}`.replace(/_/g, ' ')}</span>
                    <time className="shrink-0 text-slate-400">{formatAuditTime(entry.createdAt)}</time>
                  </div>
                )) : <p className="text-xs text-slate-500">Chưa có nhật ký bảo mật.</p>}
              </div>
            </>
          )}
          {securityStatus && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700" role="status">{securityStatus}</p>}
        </div>
      )}
    </section>
  );
}
