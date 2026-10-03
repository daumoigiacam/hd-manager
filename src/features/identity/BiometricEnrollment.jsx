import { useEffect, useRef, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { getBiometricAvailability, identitySetBiometric } from '../../services/identityCenter.js';

export default function BiometricEnrollment({ identity, getToken, onDone }) {
  const [availability, setAvailability] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    getBiometricAvailability().then(value => { if (active) setAvailability(value); });
    return () => { active = false; };
  }, []);
  const enable = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await identitySetBiometric({ idToken: await getToken(), enabled: true, identity });
      onDone();
    } catch (failure) {
      setError(failure.message || 'Không thể bật sinh trắc học. Bạn vẫn có thể dùng mật khẩu.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <section className="w-full max-w-sm rounded-lg border bg-white p-5" aria-label="Bật đăng nhập sinh trắc học">
      <Fingerprint size={28} className="text-emerald-600" />
      <h1 className="mt-3 text-lg font-semibold">Bật đăng nhập bằng sinh trắc học trên thiết bị này?</h1>
      <p className="mt-2 text-sm text-gray-600">{availability?.available ? availability.label : 'Thiết bị cần thiết lập sinh trắc học đủ bảo mật trong Cài đặt điện thoại.'}</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={busy} onClick={onDone} className="flex-1 rounded-lg border px-3 py-3">Để sau</button>
        <button type="button" disabled={busy || !availability?.available} onClick={enable} className="flex-1 rounded-lg bg-emerald-600 px-3 py-3 text-white disabled:opacity-50">{busy ? 'Đang xác thực...' : 'Bật ngay'}</button>
      </div>
    </section>
  </main>;
}
