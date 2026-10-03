import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';

export default function OrderSearchInput({ searchStore, onCommit, onClose, inputRef, className, placeholder }) {
  const committed = useSyncExternalStore(searchStore.subscribe, searchStore.getSnapshot);
  const [draft, setDraft] = useState(committed);
  const timer = useRef(null);
  const callbacks = useRef({ onCommit, onClose });
  callbacks.current = { onCommit, onClose };
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => { cancel(); setDraft(committed); }, [committed]);
  useEffect(() => () => cancel(), []);
  const commit = next => { cancel(); callbacks.current.onCommit(next); };
  return <>
    <input data-hd-search-input="true" ref={inputRef} type="search" value={draft}
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        cancel();
        timer.current = setTimeout(() => { timer.current = null; callbacks.current.onCommit(next); }, 250);
      }}
      onKeyDown={event => { if (event.key === 'Enter') { commit(draft); event.currentTarget.blur(); } }}
      placeholder={placeholder} enterKeyHint="search" autoFocus className={className} />
    <button type="button" aria-label="Xóa tìm kiếm"
      onClick={() => { if (draft) { setDraft(''); commit(''); } else { cancel(); callbacks.current.onClose(); } }}
      className="hd-header-search-clear inline-flex w-10 shrink-0 items-center justify-center rounded-full p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
      <X size={15} />
    </button>
  </>;
}
