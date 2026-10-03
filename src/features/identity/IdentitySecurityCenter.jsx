import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import PasskeySettings from './PasskeySettings.jsx';
import SecurityDialog from './SecurityDialog.jsx';
import { getBiometricAutoLoginProfile, getIdentityAccountScope } from '../../services/identityCenter.js';

export default function IdentitySecurityCenter({
  standalone = false,
  identityApi,
  identityUser,
  vpsMode = false,
  onGetIdentityToken,
  onLogout,
}) {
  const {
    getIdentityDevice,
    identityCompleteSetup,
    identityChangePassword,
    identityStartEmailChange,
    identityVerifyEmailChange,
    identityCompleteEmailChange,
    identityDeleteAccount,
    identityListAudit,
    identityListDevices,
    identityRevokeDevices,
    identitySetBiometric,
    identityVerifyPin,
  } = identityApi;
  const [expanded, setExpanded] = useState(standalone);
  const [devices, setDevices] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [securityStatus, setSecurityStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeEditor, setActiveEditor] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [nextEmail, setNextEmail] = useState('');
  const [emailChangeChallengeId, setEmailChangeChallengeId] = useState('');
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [emailChangeProof, setEmailChangeProof] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [deletionPassword, setDeletionPassword] = useState('');
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [quickLogin, setQuickLogin] = useState({ available: false, native: false });
  useEffect(() => {
    let active = true;
    if (!vpsMode && identityApi.getQuickLoginAvailability) identityApi.getQuickLoginAvailability().then(result => { if (active) setQuickLogin(result); });
    return () => { active = false; };
  }, [identityApi, vpsMode]);
  const device = useMemo(() => getIdentityDevice(), [getIdentityDevice]);
  const identityReady = Boolean(identityUser?.phone || identityUser?.id);
  const accountScope = getIdentityAccountScope(identityUser);
  const tokenGetter = useRef(onGetIdentityToken);
  tokenGetter.current = onGetIdentityToken;
  const refreshInFlight = useRef(false);

  const refreshSecurityData = useCallback(async () => {
    if (!identityReady || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const idToken = vpsMode ? undefined : await tokenGetter.current?.();
      if (!vpsMode && !idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
      const [deviceResult, auditResult] = await Promise.allSettled([
        identityListDevices(vpsMode ? {} : { idToken }),
        identityListAudit(vpsMode ? {} : { idToken }),
      ]);
      if (deviceResult.status === 'rejected') throw deviceResult.reason;
      setDevices(deviceResult.value?.devices || []);
      if (auditResult.status === 'fulfilled') {
        setAuditEntries(auditResult.value?.entries || []);
      } else if (vpsMode) {
        setAuditEntries([]);
        setSecurityStatus('Thiết bị đã được tải. Nhật ký bảo mật VPS yêu cầu quyền audit.read.');
      }
      const currentDevice = (deviceResult.value?.devices || []).find(item => item.deviceId === device.deviceId);
      const localProfile = getBiometricAutoLoginProfile({ manual: true });
      setBiometricEnabled(!vpsMode && Boolean(currentDevice?.biometricEnabled && localProfile?.accountScope === accountScope));
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể tải thông tin bảo mật.');
    } finally {
      refreshInFlight.current = false;
      setIsLoading(false);
    }
  }, [device.deviceId, identityListAudit, identityListDevices, identityReady, accountScope, vpsMode]);

  useEffect(() => {
    if (expanded) refreshSecurityData();
  }, [expanded, refreshSecurityData]);

  const runSensitiveUpdate = async (event) => {
    event.preventDefault();
    if (!identityReady) return;
    if (vpsMode && activeEditor !== 'password') {
      setSecurityStatus('VPS mode chỉ hỗ trợ đổi mật khẩu qua Identity API.');
      return;
    }
    if (activeEditor === 'password' && (!newPassword || newPassword !== newPasswordConfirm)) {
      setSecurityStatus('Mật khẩu mới chưa khớp.');
      return;
    }
    if (vpsMode && !currentPassword) {
      setSecurityStatus('Nhập mật khẩu hiện tại để xác nhận thay đổi.');
      return;
    }
    if (!vpsMode && !/^\d{6}$/.test(currentPin)) {
      setSecurityStatus('Nhập PIN hiện tại gồm 6 số để xác nhận thay đổi.');
      return;
    }
    if (activeEditor === 'pin' && (!/^\d{6}$/.test(newPin) || newPin !== newPinConfirm)) {
      setSecurityStatus('PIN mới phải gồm 6 số và khớp xác nhận.');
      return;
    }
    setIsLoading(true);
    setSecurityStatus('');
    try {
      if (vpsMode) {
        await identityChangePassword({ currentPassword, newPassword });
      } else {
        const idToken = await onGetIdentityToken?.();
        if (!idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
        await identityVerifyPin({ idToken, pin: currentPin });
        const result = await identityCompleteSetup({
          idToken,
          password: activeEditor === 'password' ? newPassword : undefined,
          pin: activeEditor === 'pin' ? newPin : undefined,
        });
        if (result?.setup) setBiometricEnabled(Boolean(result.setup.biometricEnabled));
        if (activeEditor === 'password') {
          await onLogout?.();
          return;
        }
      }
      setSecurityStatus(activeEditor === 'password' ? 'Đã đổi mật khẩu.' : 'Đã đổi PIN.');
      setActiveEditor('');
      setCurrentPassword('');
      setCurrentPin('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setNewPin('');
      setNewPinConfirm('');
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
      setSecurityStatus(!biometricEnabled ? 'Đã bật sinh trắc học trên thiết bị này.' : 'Đã tắt sinh trắc học trên thiết bị này.');
      await refreshSecurityData();
    } catch (error) {
      setBiometricEnabled(Boolean(getBiometricAutoLoginProfile({ manual: true })));
      setSecurityStatus(error?.message || 'Không thể cập nhật sinh trắc học.');
    } finally {
      setIsLoading(false);
    }
  };

  const registerCurrentDevice = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const idToken = await tokenGetter.current?.();
      if (!idToken) throw new Error('Vui lòng đăng nhập lại bằng mật khẩu.');
      await identityCompleteSetup({ idToken, trustDevice: true, biometricEnabled: false });
      await refreshSecurityData();
    } catch (error) {
      setSecurityStatus(error.message || 'Không thể đăng ký thiết bị.');
    } finally { setIsLoading(false); }
  };

  const revokeDevice = async (deviceId, all = false) => {
    if (!identityReady || !window.confirm(all ? 'Đăng xuất khỏi tất cả thiết bị tin cậy?' : 'Thu hồi thiết bị này?')) return;
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const idToken = vpsMode ? undefined : await onGetIdentityToken?.();
      if (!vpsMode && !idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
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

  const handleDeleteAccount = async (event) => {
    event.preventDefault();
    if (!identityReady || !window.confirm('Xóa phiên đăng nhập và dữ liệu xác thực của tài khoản này? Dữ liệu đơn hàng, công nợ và hồ sơ nghiệp vụ sẽ được giữ lại theo chính sách lưu trữ.')) return;
    if (!deletionPassword) {
      setSecurityStatus('Nhập mật khẩu hiện tại để xác nhận xóa tài khoản.');
      return;
    }
    if (deletionConfirmation.trim() !== 'XOA TAI KHOAN') {
      setSecurityStatus('Nhập đúng cụm từ XOA TAI KHOAN để xác nhận.');
      return;
    }
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const idToken = await onGetIdentityToken?.();
      if (!idToken) throw new Error('Phiên đăng nhập bảo mật đã hết hạn.');
      await identityDeleteAccount({
        idToken,
        currentPassword: deletionPassword,
        confirmation: deletionConfirmation.trim(),
        identity: identityUser,
      });
      setSecurityStatus('Tài khoản đã được xóa.');
      setDeletionPassword('');
      setDeletionConfirmation('');
      await onLogout?.();
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể xóa tài khoản.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetEmailChangeState = () => {
    setNextEmail('');
    setEmailChangeChallengeId('');
    setEmailChangeCode('');
    setEmailChangeProof('');
  };

  const startEmailChange = async (event) => {
    event.preventDefault();
    const email = `${nextEmail || ''}`.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setSecurityStatus('Vui lòng nhập email mới hợp lệ.');
      return;
    }
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const result = await identityStartEmailChange(email);
      setNextEmail(email);
      setEmailChangeChallengeId(result.challengeId || '');
      setEmailChangeCode('');
      setEmailChangeProof('');
      setActiveEditor('email-verify');
      setSecurityStatus('Mã xác minh đã được gửi tới email mới.');
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể gửi mã xác minh email.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmailChange = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(emailChangeCode)) {
      setSecurityStatus('Mã xác minh cần gồm 6 chữ số.');
      return;
    }
    setIsLoading(true);
    setSecurityStatus('');
    try {
      const result = await identityVerifyEmailChange({
        challengeId: emailChangeChallengeId,
        code: emailChangeCode,
      });
      if (!result?.proof) throw new Error('Mã xác minh không hợp lệ hoặc đã hết hạn.');
      setEmailChangeProof(result.proof);
      setEmailChangeCode('');
      setActiveEditor('email-complete');
      setSecurityStatus('Email mới đã được xác minh.');
    } catch (error) {
      setSecurityStatus(error?.message || 'Mã xác minh không hợp lệ hoặc đã hết hạn.');
    } finally {
      setIsLoading(false);
    }
  };

  const completeEmailChange = async (event) => {
    event.preventDefault();
    setIsLoading(true);
    setSecurityStatus('');
    try {
      await identityCompleteEmailChange({
        challengeId: emailChangeChallengeId,
        proof: emailChangeProof,
      });
      resetEmailChangeState();
      setActiveEditor('');
      setSecurityStatus('Đã đổi email. Vui lòng đăng nhập lại để tiếp tục.');
      await onLogout?.();
    } catch (error) {
      setSecurityStatus(error?.message || 'Không thể đổi email. Vui lòng xác minh lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatAuditTime = (value) => {
    try {
      if (!value) return 'Chưa có thời gian';
      const date = typeof value.toDate === 'function' ? value.toDate()
        : typeof value === 'object' && ('seconds' in value || '_seconds' in value)
          ? new Date(Number(value.seconds ?? value._seconds) * 1000)
          : new Date(value);
      return Number.isFinite(date.getTime()) ? date.toLocaleString('vi-VN') : 'Chưa có thời gian';
    } catch {
      return 'Chưa có thời gian';
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {!standalone && <button type="button" onClick={() => setExpanded(value => !value)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white"><Lock size={18} /></span>
          <span>
            <strong className="block text-sm text-slate-900">Bảo mật tài khoản</strong>
            <span className="mt-0.5 block text-xs text-slate-500">Thiết bị tin cậy, PIN và lịch sử đăng nhập</span>
          </span>
        </span>
        {expanded ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>}
      {expanded && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          {!identityReady ? (
            <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">Tài khoản này chưa hoàn tất Identity Center. Hãy đăng xuất và đăng nhập lại để thiết lập PIN và thiết bị tin cậy.</div>
          ) : (
            <>
              <div className="grid gap-2">
                <div className="rounded-xl bg-slate-50 p-3 text-xs">
                  <span className="block text-slate-500">{vpsMode ? 'Email' : 'Số điện thoại'}</span>
                  <strong className="mt-1 block text-slate-800">{vpsMode ? (identityUser.email || 'Chưa cập nhật') : (identityUser.phone || 'Chưa cập nhật')}</strong>
                </div>
              </div>
              <div className="flex flex-col divide-y divide-gray-200">
                <button type="button" onClick={() => { setSecurityStatus(''); setActiveEditor('password'); }} className="px-3 py-3 text-left text-sm font-semibold text-slate-700">Đổi mật khẩu</button>
                {vpsMode && <button type="button" onClick={() => { resetEmailChangeState(); setActiveEditor(activeEditor === 'email-start' ? '' : 'email-start'); }} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700">Đổi email</button>}
                <button type="button" disabled={vpsMode || isLoading} onClick={() => setActiveEditor(activeEditor === 'pin' ? '' : 'pin')} className="px-3 py-3 text-left text-sm font-semibold disabled:opacity-50">Đổi mã PIN</button>
                <div className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                  <span>Đăng nhập bằng sinh trắc học<small className="mt-1 block text-gray-500">{quickLogin.label || 'Sử dụng vân tay hoặc nhận diện khuôn mặt của thiết bị.'}</small></span>
                  {quickLogin.native ? <input type="checkbox" role="switch" aria-label="Đăng nhập bằng sinh trắc học" checked={biometricEnabled} disabled={vpsMode || isLoading || (!biometricEnabled && !quickLogin.available)} onChange={toggleBiometric} className="h-5 w-5 shrink-0 accent-emerald-600" /> : <button type="button" disabled={vpsMode || isLoading || !quickLogin.available} onClick={() => setActiveEditor('biometric')} className="rounded-lg border px-3 py-2">Passkey</button>}
                </div>
                <div className="px-3 py-3 text-sm"><strong>Thiết bị hiện tại</strong><p>{device.name}</p><p>{devices.some(item => item.deviceId === device.deviceId && item.trusted && !item.revokedAt) ? 'Thiết bị tin cậy' : 'Chưa đăng ký thiết bị tin cậy'}</p><button type="button" disabled={isLoading} onClick={() => revokeDevice(device.deviceId)} className="mt-2 text-red-700">Đăng xuất và quên thiết bị này</button></div>
                {!vpsMode && !devices.some(item => item.deviceId === device.deviceId && item.trusted && !item.revokedAt) && <button type="button" disabled={isLoading} onClick={registerCurrentDevice} className="px-3 py-3 text-left text-sm font-semibold">Đăng ký thiết bị tin cậy</button>}
                {!quickLogin.available && <p className="px-3 py-2 text-xs text-gray-500">Thiết bị hoặc trình duyệt chưa hỗ trợ xác thực sinh trắc học.</p>}
                <button type="button" onClick={() => setActiveEditor(activeEditor === 'devices' ? '' : 'devices')} className="px-3 py-3 text-left text-sm font-semibold">Thiết bị tin cậy</button>
                <button type="button" disabled={vpsMode || isLoading} onClick={() => setActiveEditor(activeEditor === 'delete' ? '' : 'delete')} className="px-3 py-3 text-left text-sm font-semibold text-red-600 disabled:opacity-50">Xóa tài khoản</button>
              </div>
              {activeEditor === 'biometric' && !vpsMode && !quickLogin.native && quickLogin.available && <SecurityDialog title="Đăng nhập bằng Passkey" onClose={() => setActiveEditor('')}><PasskeySettings identityApi={identityApi} onGetIdentityToken={onGetIdentityToken} /></SecurityDialog>}
              {(activeEditor === 'password' || activeEditor === 'pin') && (
                <SecurityDialog title={activeEditor === 'password' ? 'Đổi mật khẩu' : 'Đổi mã PIN'} busy={isLoading} onClose={() => {
                  setActiveEditor(''); setCurrentPassword(''); setCurrentPin(''); setNewPassword(''); setNewPasswordConfirm(''); setNewPin(''); setNewPinConfirm(''); setSecurityStatus('');
                }}>
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
                  {vpsMode ? (
                    <input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Mật khẩu hiện tại để xác nhận" autoComplete="current-password" />
                  ) : (
                    <input type="password" inputMode="numeric" maxLength={6} value={currentPin} onChange={event => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tracking-[0.3em] outline-none focus:border-emerald-500" placeholder="PIN hiện tại để xác nhận" />
                  )}
                  <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isLoading ? 'Đang lưu...' : 'Xác nhận thay đổi'}</button>
                  {securityStatus && <p role="status" className="text-sm text-red-700">{securityStatus}</p>}
                </form>
                </SecurityDialog>
              )}
              {activeEditor === 'email-start' && (
                <form onSubmit={startEmailChange} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input type="email" value={nextEmail} onChange={event => setNextEmail(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500" placeholder="Email mới" autoComplete="email" />
                  <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isLoading ? 'Đang gửi mã...' : 'Gửi mã xác minh'}</button>
                </form>
              )}
              {activeEditor === 'email-verify' && (
                <form onSubmit={verifyEmailChange} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input type="text" inputMode="numeric" maxLength={6} value={emailChangeCode} onChange={event => setEmailChangeCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm tracking-[0.3em] outline-none focus:border-emerald-500" placeholder="Mã 6 số" autoComplete="one-time-code" />
                  <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isLoading ? 'Đang xác minh...' : 'Xác minh email'}</button>
                </form>
              )}
              {activeEditor === 'email-complete' && (
                <form onSubmit={completeEmailChange} className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-xs leading-5 text-emerald-800">Email mới đã được xác minh. Xác nhận để cập nhật email và đăng xuất các phiên hiện có.</p>
                  <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isLoading ? 'Đang cập nhật...' : 'Xác nhận đổi email'}</button>
                </form>
              )}
              {activeEditor === 'devices' && <><div className="space-y-2">
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
              </>}
              {activeEditor === 'delete' && !vpsMode && <section className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3">
                <div>
                  <h4 className="text-sm font-bold text-red-800">Xóa tài khoản</h4>
                  <p className="mt-1 text-xs leading-5 text-red-700">Thao tác này xóa phiên đăng nhập, mật khẩu, PIN và dữ liệu xác thực. Đơn hàng, công nợ, bảng lương và hồ sơ nghiệp vụ được giữ lại theo chính sách lưu trữ.</p>
                </div>
                <form onSubmit={handleDeleteAccount} className="space-y-2">
                  <input type="password" value={deletionPassword} onChange={event => setDeletionPassword(event.target.value)} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-500" placeholder="Mật khẩu hiện tại" autoComplete="current-password" />
                  <input type="text" value={deletionConfirmation} onChange={event => setDeletionConfirmation(event.target.value)} className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm uppercase outline-none focus:border-red-500" placeholder="Nhập XOA TAI KHOAN để xác nhận" autoComplete="off" />
                  <button type="submit" disabled={isLoading} className="w-full rounded-lg bg-red-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{isLoading ? 'Đang xử lý...' : 'Xóa tài khoản'}</button>
                </form>
                <a className="block text-xs font-semibold text-red-700 underline" href="https://hdconnect.net/xoa-tai-khoan.html" target="_blank" rel="noreferrer">Xem chính sách xóa dữ liệu</a>
              </section>}
            </>
          )}
          {securityStatus && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700" role="status">{securityStatus}</p>}
        </div>
      )}
    </section>
  );
}
