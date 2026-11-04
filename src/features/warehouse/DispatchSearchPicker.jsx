import PreloadedWorkspace from '../../layout/PreloadedWorkspace.jsx';
import {createPreloadableModule} from '../../utils/preloadableModule.js';
import React, { useId, useRef } from 'react';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import './dispatch-picker.css';
const pickerOptionsModule=createPreloadableModule(()=>import('./DispatchPickerOptions.jsx'));
const warmOptions=()=>{void pickerOptionsModule.preload().catch(()=>{});};

/** @typedef {{id: string, label: string, detail: string}} PickerOption */
/** @typedef {{key:string,title:string}|{key:string,option:PickerOption,ordinal:number}} PickerRow */

/**
 * @param {{value: string, selectedId: string, open: boolean, label: string, placeholder: string,
 * toggleLabel: string, emptyText: string, showEmpty: boolean, note?: string, pending?: boolean, error?: boolean,
 * groups: readonly {title?: string, options: readonly PickerOption[]}[],
 * inputRef: React.RefObject<HTMLInputElement | null>, onOpenChange: (open: boolean) => void,
 * onChange: (value: string) => void, onSelect: (id: string) => void}} props
 */
export default function DispatchSearchPicker({ value, selectedId, open, label, placeholder,
  toggleLabel, emptyText, showEmpty, note = '', pending=false, error=false, groups, inputRef, onOpenChange, onChange, onSelect }) {
  const listId = useId();
  const listRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const suppressFocus = useRef(false);
  /** @param {React.KeyboardEvent} event */
  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      suppressFocus.current = true;
      inputRef.current?.focus();
      suppressFocus.current = false;
      onOpenChange(false);
    }
    if (event.key === 'ArrowDown' && event.target === inputRef.current && open) {
      event.preventDefault(); listRef.current?.querySelector('button')?.focus();
    }
  };
  return <div data-search-zone="true" className="hd-dispatch-picker" onKeyDown={onKeyDown}>
    <div className="hd-dispatch-picker-field">
      <Search size={16} aria-hidden="true" />
      <input data-hd-search-input="true" ref={inputRef} type="text" role="combobox"
        aria-label={label} aria-expanded={open} aria-controls={open ? listId : undefined} aria-autocomplete="list"
        value={value} placeholder={placeholder}
        onFocus={event => { if (!suppressFocus.current) { warmOptions();onOpenChange(true); event.target.select(); } }}
        onClick={() => onOpenChange(true)} onChange={event => onChange(event.target.value)} />
      <button type="button" aria-label={toggleLabel} aria-expanded={open}
        onPointerDown={event => {event.preventDefault();if(!open)warmOptions();}}
        onClick={() => { if (!open) inputRef.current?.focus(); onOpenChange(!open); }}>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
    {open && <div className="hd-dispatch-picker-list" role="listbox" id={listId} aria-label={label} ref={listRef}>
      {note && <p>{note}</p>}
      {pending&&<p role="status" aria-busy="true">Đang tìm…</p>}
      {error&&<p role="alert">Không thể tìm kiếm. Hãy thử lại từ khóa.</p>}
      {!pending&&!error&&<PreloadedWorkspace module={pickerOptionsModule} viewProps={{groups,selectedId,queryKey:value,scrollRef:listRef,onSelect}} label="danh sách lựa chọn"/>}
      {!pending&&!error&&showEmpty && <p>{emptyText}</p>}
    </div>}
  </div>;
}
