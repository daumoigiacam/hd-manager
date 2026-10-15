import { useId, useMemo, useState } from 'react';
import { normalizeCategorySearch, searchExpenseCategories } from './expenseCategory.js';

export default function ExpenseCategoryPicker({ value, options, onChange, disabled = false }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const matches = useMemo(() => searchExpenseCategories(options, query), [options, query]);
  const newLabel = query.trim();
  const canCreate = newLabel && !options.some(option => normalizeCategorySearch(option) === normalizeCategorySearch(newLabel));
  const choices = canCreate ? [...matches, newLabel] : matches;
  const choose = label => { onChange(label); setOpen(false); setActive(-1); };
  return (
    <div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <input required role="combobox" aria-label="Danh mục chi" aria-autocomplete="list" aria-expanded={open} aria-controls={id} aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        value={value} disabled={disabled} autoComplete="off" placeholder="Danh mục chi"
        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"
        onFocus={event => { setQuery(''); setActive(-1); setOpen(true); event.target.select(); }}
        onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); onChange(event.target.value); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(previous => Math.max(0, Math.min(choices.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1))));
          }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (choices[active]) choose(choices[active]); else setOpen(false); }
        }} />
      {open && <div id={id} role="listbox" aria-label="Danh mục chi" className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
        {choices.map((label, index) => <button key={label} id={`${id}-${index}`} role="option" aria-selected={index === active} type="button" tabIndex={-1}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(label)}
          className={`block w-full px-3 py-2 text-left text-sm ${index === active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
          {canCreate && index === matches.length ? `Tạo danh mục “${label}”` : label}
        </button>)}
      </div>}
    </div>
  );
}
