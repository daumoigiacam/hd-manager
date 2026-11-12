import React from 'react';
import './dispatch-quantity-fields.css';

/**
 * @typedef {Object} DispatchQuantityFieldsProps
 * @property {string | number} quantity
 * @property {string} unit
 * @property {string} weightLabel
 * @property {(value: string) => void} onQuantityChange
 * @property {() => void} onOpenWeight
 */
/** @param {DispatchQuantityFieldsProps} props */
export default function DispatchQuantityFields({ quantity, unit, weightLabel, onQuantityChange, onOpenWeight }) {
  return <div className="hd-dispatch-quantity-fields">
    <input type="number" min="0" step="1" value={quantity}
      onChange={event => onQuantityChange(event.target.value)}
      placeholder="Số lượng" aria-label="Số lượng xuất kho" />
    <div className="hd-dispatch-quantity-unit" aria-label={`Đơn vị số lượng thực tế ${unit || 'chưa cấu hình'}`}>
      {unit || '--'}
    </div>
    <button type="button" onClick={onOpenWeight} aria-label="Nhập các lần cân kg">
      <span className={weightLabel ? '' : 'hd-dispatch-quantity-placeholder'}>{weightLabel || 'Số kg'}</span>
    </button>
  </div>;
}
