import {ChevronDown, ChevronUp} from 'lucide-react';

// Stable component identity keeps focused/dirty controls mounted while typing.
// Render functions defer building large editor trees until the section opens.
export default function PricingSectionShell({isOpen, onToggle, title, icon, children}) {
  return <div className="overflow-hidden rounded-[1.8rem] border border-gray-100 bg-white shadow-sm">
    <button type="button" onClick={onToggle} aria-expanded={isOpen}
      className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50">{icon}</div>
        <h3 className="min-w-0 text-lg font-black text-gray-900">{title}</h3>
      </div>
      {isOpen ? <ChevronUp className="shrink-0 text-gray-400" size={22} /> : <ChevronDown className="shrink-0 text-gray-400" size={22} />}
    </button>
    {isOpen && <div className="border-t border-gray-100 px-4 pb-4 pt-3">{typeof children === 'function' ? children() : children}</div>}
  </div>;
}
