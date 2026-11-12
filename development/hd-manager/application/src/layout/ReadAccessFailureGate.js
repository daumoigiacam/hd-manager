import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// Quarantine the denied owner's rendered projections without unmounting forms.
// The body-level shield also hides existing body portals (including dialogs).
// Only a new owner may render fresh children; there is no same-owner retry.
export default function ReadAccessFailureGate({ access, onLogout, children }) {
  const failure = useSyncExternalStore(access.subscribe, access.getSnapshot, access.getSnapshot);
  const retained = useRef(children);
  const dialog = useRef(null);
  if (!failure) retained.current = children;
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!failure || !element) return undefined;
    // A pre-existing form dialog must not make the access-failure action inert.
    // Keep that form mounted; put this notice above it in the native top layer.
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    return () => { if (typeof element.close === 'function') element.close(); };
  }, [failure]);
  const notice = failure ? React.createElement('dialog', {
    ref: dialog, role: 'alertdialog', 'aria-modal': true, 'aria-labelledby': 'read-access-failure-title',
    onCancel: event => event.preventDefault(),
    'data-hd-read-access-failure-host': true,
    // WebView74 accepts the JS `inset` property but does not apply its layout.
    // Explicit edges keep the action inside the old Android visual viewport.
    style: { position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 2147483647, background: '#f4f6f8', padding: 24,
      width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', margin: 0, border: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center' },
  },
  React.createElement('style', null, 'body > :not([data-hd-read-access-failure-host]) { display: none !important; }'),
  React.createElement('section', { role: 'alert', 'aria-labelledby': 'read-access-failure-title',
    style: { maxWidth: 480, background: 'white', borderRadius: 24, padding: 24 } },
  React.createElement('h1', { id: 'read-access-failure-title' }, 'Không thể xác nhận quyền truy cập dữ liệu'),
  React.createElement('p', null, 'Dữ liệu đã được ẩn. Đăng xuất và đăng nhập lại để xác thực quyền truy cập của tài khoản.'),
  React.createElement('button', { type: 'button', autoFocus: true, onClick: onLogout,
    style: { marginTop: 16, padding: 12 } }, 'Đăng xuất để đăng nhập lại'))) : null;
  return React.createElement(React.Fragment, null, retained.current,
    notice && (typeof document === 'undefined' ? notice : createPortal(notice, document.body)));
}
