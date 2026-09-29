import { useEffect, useRef, useState } from 'react';
import { Fingerprint, Trash2 } from 'lucide-react';

export default function PasskeySettings({ identityApi, onGetIdentityToken }) {
  const [passkeys, setPasskeys] = useState([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const idToken = await onGetIdentityToken?.();
        if (!idToken) throw new Error('Vui lòng đăng nhập lại.');
        const result = await identityApi.identityListPasskeys({ idToken });
        if (active) setPasskeys(result.passkeys || []);
      } catch (error) { if (active) setMessage(error.message); }
    };
    void load();
    return () => { active = false; };
  }, [identityApi, onGetIdentityToken]);

  const update = async (id) => {
    if (inFlight.current || !password) return;
    inFlight.current = true;
    setBusy(true);
    setMessage('');
    try {
      const idToken = await onGetIdentityToken?.();
      if (!idToken) throw new Error('Vui lòng đăng nhập lại.');
      if (id) await identityApi.identityRevokePasskey({ idToken, id, password });
      else await identityApi.identityRegisterPasskey({ idToken, password, label: identityApi.getIdentityDevice().name });
      const result = await identityApi.identityListPasskeys({ idToken });
      setPasskeys(result.passkeys || []);
      setMessage(id ? 'Đã thu hồi passkey.' : 'Đã đăng ký. Lần sau bạn có thể đăng nhập bằng Face ID / vân tay.');
    } catch (error) { setMessage(error.message || 'Không thể cập nhật passkey.'); }
    finally { setPassword(''); setBusy(false); inFlight.current = false; }
  };

  return <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
    <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900"><Fingerprint size={20} />Face ID / Vân tay trên web</h3>
    <p className="text-xs text-emerald-900">Thiết bị xác thực bằng khuôn mặt, vân tay hoặc mã khóa màn hình. HD Manager không lưu dữ liệu sinh trắc học.</p>
    <label className="block text-xs font-semibold text-slate-700">Mật khẩu hiện tại để đăng ký hoặc thu hồi
      <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
    </label>
    <button type="button" onClick={() => update()} disabled={busy || !password} className="w-full rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Đang xác thực...' : 'Đăng ký passkey'}</button>
    {passkeys.map(key => <div key={key.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{key.label}{!key.active && ' • Cần đăng ký lại'}</span><button type="button" onClick={() => update(key.id)} disabled={busy || !password} aria-label={`Thu hồi ${key.label}`} title="Thu hồi passkey" className="shrink-0 p-2 text-red-600 disabled:opacity-50"><Trash2 size={18} /></button></div>)}
    {message && <p role="status" className="text-xs text-slate-700">{message}</p>}
  </section>;
}
