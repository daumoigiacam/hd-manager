import React from 'react';
import './dispatch-form-actions.css';

/**
 * @typedef {Object} DispatchFormActionsProps
 * @property {boolean} canAssignDriver
 * @property {string} driverId
 * @property {ReadonlyArray<{id: string, name?: string}>} drivers
 * @property {(id: string) => void} onDriverChange
 * @property {() => void} onReset
 * @property {boolean} saving
 * @property {boolean} [preparing]
 * @property {string} [suggestion]
 * @property {string} [error]
 */
/** @param {DispatchFormActionsProps} props */
export default function DispatchFormActions({ canAssignDriver, driverId, drivers, onDriverChange,
  onReset, saving, preparing = false, suggestion = '', error = '' }) {
  return <>
    <div className="hd-dispatch-driver-actions hd-dispatch-form-actions">
      {canAssignDriver && <select value={driverId}
        onChange={event => onDriverChange(event.target.value)}
        aria-label="Chọn nhân sự giao hàng">
        <option value="">Không chọn nhân sự</option>
        {drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
      </select>}
      <button type="button" onClick={onReset} disabled={saving}>Làm mới</button>
    </div>
    {suggestion && <p className="hd-dispatch-form-suggestion">Gợi ý theo khách: {suggestion}</p>}
    {error && <div role="alert" className="hd-dispatch-form-error">{error}</div>}
    <button type="submit" disabled={saving || preparing} aria-busy={saving || preparing} className="hd-dispatch-form-save">
      {saving ? 'Đang lưu...' : preparing ? 'Đang đối chiếu...' : 'Lưu lại'}
    </button>
  </>;
}
