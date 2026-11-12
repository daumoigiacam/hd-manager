import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './dispatch-weight-editor.css';
import {
  ensureWarehouseWeightEntryRows, getWarehouseWeightEntryTotal,
  updateWarehouseWeightEntryRows, createWarehouseWeightEntryRow,
  normalizeWarehouseWeightEntries
} from '../../utils/warehouseWeightEntries.js';

/**
 * @typedef {Object} WeightEntriesModalProps
 * @property {'create' | 'edit'} [mode]
 * @property {ReadonlyArray<string | number>} [initialEntries]
 * @property {string} [customerName]
 * @property {string} [productName]
 * @property {number} [previousWeightKg]
 * @property {boolean} [appendEmptyRowWhenFull]
 * @property {boolean} [isSaving]
 * @property {() => void} onCancel
 * @property {(result: {entries: number[], totalWeight: number}) => void} onSave
 * @property {(value: number) => string} formatNumber
 */
const WarehouseWeightEntriesModal = React.memo(
/** @param {WeightEntriesModalProps} props */
function WarehouseWeightEntriesModal({
  mode = 'create',
  initialEntries = [],
  customerName = '',
  productName = '',
  previousWeightKg = 0,
  appendEmptyRowWhenFull = false,
  isSaving = false,
  onCancel,
  onSave,
  formatNumber
}) {
  const [entries, setEntries] = useState(() => ensureWarehouseWeightEntryRows(
    initialEntries,
    appendEmptyRowWhenFull
  ));
  const inputRefs = useRef(/** @type {(HTMLInputElement | null)[]} */ ([]));
  const composingInputsRef = useRef(new Set(/** @type {number[]} */ ([])));
  const focusTaskRef = useRef(/** @type {{ type: 'frame' | 'timer', id: number } | null} */ (null));
  const totalWeight = useMemo(() => getWarehouseWeightEntryTotal(entries), [entries]);
  const weightDifference = totalWeight - (previousWeightKg || 0);

  useEffect(() => () => {
    if (typeof window === 'undefined' || focusTaskRef.current === null) return;
    const task = focusTaskRef.current;
    if (task.type === 'frame') window.cancelAnimationFrame?.(task.id);
    if (task.type === 'timer') window.clearTimeout?.(task.id);
    focusTaskRef.current = null;
  }, []);

  const focusInput = useCallback(/** @param {number} index */ (index) => {
    if (typeof window === 'undefined' || index < 0) return;
    const pendingTask = focusTaskRef.current;
    if (pendingTask?.type === 'frame') window.cancelAnimationFrame?.(pendingTask.id);
    if (pendingTask?.type === 'timer') window.clearTimeout?.(pendingTask.id);
    const applyFocus = () => {
      const input = inputRefs.current[index];
      input?.focus?.({ preventScroll: true });
      input?.select?.();
      focusTaskRef.current = null;
    };
    if (typeof window.requestAnimationFrame === 'function') {
      focusTaskRef.current = { type: 'frame', id: window.requestAnimationFrame(applyFocus) };
      return;
    }
    focusTaskRef.current = { type: 'timer', id: window.setTimeout(applyFocus, 0) };
  }, []);

  const handleEntryChange = useCallback(/** @param {number} index @param {string} value */ (index, value) => {
    setEntries(previousEntries => updateWarehouseWeightEntryRows(
      previousEntries,
      index,
      value,
      appendEmptyRowWhenFull
    ));
  }, [appendEmptyRowWhenFull]);

  const handleEntryKeyDown = useCallback(/** @param {React.KeyboardEvent<HTMLInputElement>} event @param {number} index */ (event, index) => {
    const isComposing = event.nativeEvent?.isComposing
      || composingInputsRef.current.has(index);
    if (event.key !== 'Enter' || isComposing) return;
    event.preventDefault();
    const nextIndex = index + 1;
    setEntries(previousEntries => {
      const normalizedRows = ensureWarehouseWeightEntryRows(previousEntries);
      if (nextIndex < normalizedRows.length) return previousEntries;
      if (!appendEmptyRowWhenFull) return previousEntries;
      return [...normalizedRows, ...createWarehouseWeightEntryRow()];
    });
    if (nextIndex < entries.length || appendEmptyRowWhenFull) focusInput(nextIndex);
  }, [appendEmptyRowWhenFull, entries.length, focusInput]);

  const handleSave = useCallback(() => {
    const normalizedEntries = normalizeWarehouseWeightEntries(entries);
    onSave?.({
      entries: normalizedEntries,
      totalWeight: normalizedEntries.reduce((sum, value) => sum + value, 0)
    });
  }, [entries, onSave]);

  const inputs = (
    <div className={`hd-dispatch-weight__inputs ${mode === 'edit' ? 'hd-dispatch-weight__inputs--edit' : ''}`}>
      {entries.map((entry, index) => (
        <input
          key={`warehouse_weight_entry_${index}`}
          ref={(element) => { inputRefs.current[index] = element; }}
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          enterKeyHint={(index + 1) < entries.length || appendEmptyRowWhenFull ? 'next' : 'done'}
          value={entry}
          onChange={(event) => handleEntryChange(index, event.target.value)}
          onKeyDown={(event) => handleEntryKeyDown(event, index)}
          onCompositionStart={() => composingInputsRef.current.add(index)}
          onCompositionEnd={() => composingInputsRef.current.delete(index)}
          onFocus={mode === 'create' ? (event) => event.target.select() : undefined}
          className="weight-entry-input hd-dispatch-weight__input"
          placeholder=""
          autoFocus={index === 0}
          autoComplete="off"
          aria-label={`Lần cân ${index + 1}`}
        />
      ))}
    </div>
  );

  if (mode === 'edit') {
    return createPortal(
      <div
        className="hd-weight-modal-layer hd-dispatch-weight"
        role="dialog" aria-modal="true" aria-label="Sửa các lần cân"
        onClick={onCancel}
      >
        <div className="hd-weight-modal-panel hd-dispatch-weight__panel" onClick={(event) => event.stopPropagation()}>
          <div className="hd-dispatch-weight__heading">
            <div>
              <p className="hd-dispatch-weight__label">Số kg</p>
              <h3 className="hd-dispatch-weight__title">Sửa các lần cân</h3>
              <p className="hd-dispatch-weight__hint">{customerName} • {productName}</p>
            </div>
            <button type="button" onClick={onCancel} className="hd-dispatch-weight__close" aria-label="Đóng nhập kg">
              <X size={20} />
            </button>
          </div>
          {inputs}
          <div className="hd-dispatch-weight__summary">
            <div className="hd-dispatch-weight__summary-row">
              <span>Trước đó</span>
              <span className="hd-dispatch-weight__value">{formatNumber(previousWeightKg)} kg</span>
            </div>
            <div className="hd-dispatch-weight__summary-row">
              <span>Chênh lệch</span>
              <span className={`hd-dispatch-weight__value ${weightDifference < 0 ? 'hd-dispatch-weight__value--negative' : 'hd-dispatch-weight__value--positive'}`}>
                {weightDifference > 0 ? '+' : ''}{formatNumber(weightDifference)} kg
              </span>
            </div>
            <div className="hd-dispatch-weight__total">
              <span>Tổng sau sửa</span>
              <span className="hd-dispatch-weight__value hd-dispatch-weight__value--positive">{formatNumber(totalWeight)} kg</span>
            </div>
          </div>
          <div className="hd-dispatch-weight__actions">
            <button type="button" onClick={onCancel} disabled={isSaving} className="hd-dispatch-weight__button">Hủy</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="hd-dispatch-weight__button hd-dispatch-weight__button--primary">
              {isSaving ? 'Đang lưu...' : 'Cập nhật'}
            </button>
          </div>
        </div>
      </div>, document.body
    );
  }

  return createPortal(
    <div className="hd-weight-modal-layer hd-dispatch-weight" role="dialog" aria-modal="true" aria-label="Nhập các lần cân" onClick={onCancel}>
      <div className="hd-weight-modal-panel hd-dispatch-weight__panel" onClick={(event) => event.stopPropagation()}>
        <div className="hd-dispatch-weight__heading hd-dispatch-weight__heading--create">
          <div>
            <p className="hd-dispatch-weight__label">Số kg</p>
            <h3 className="hd-dispatch-weight__title">Nhập các lần cân</h3>
            <p className="hd-dispatch-weight__hint">Ví dụ: 30, 40, 50 kg. App sẽ tự cộng tổng.</p>
          </div>
          <button type="button" onClick={onCancel} className="hd-dispatch-weight__close" aria-label="Đóng nhập kg">
            <X size={18} />
          </button>
        </div>
        {inputs}
        <div className="hd-dispatch-weight__summary">
          Tổng: <span className="hd-dispatch-weight__value hd-dispatch-weight__value--positive">{formatNumber(totalWeight)} kg</span>
        </div>
        <div className="hd-dispatch-weight__actions">
          <button type="button" onClick={onCancel} className="hd-dispatch-weight__button">Hủy</button>
          <button type="button" onClick={handleSave} className="hd-dispatch-weight__button hd-dispatch-weight__button--primary">Cập nhật</button>
        </div>
      </div>
    </div>, document.body
  );
});

export default WarehouseWeightEntriesModal;
