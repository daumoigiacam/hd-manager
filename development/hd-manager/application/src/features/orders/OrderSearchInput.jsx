import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';

export default function OrderSearchInput({ searchStore, onCommit, onClose, onDraftChange, inputRef, className, placeholder, commitDelayMs = 250 }) {
  const committed = useSyncExternalStore(searchStore.subscribe, searchStore.getSnapshot);
  const [draft, setDraft] = useState(committed);
  const timer = useRef(null);
  const callbacks = useRef({ onCommit, onClose, onDraftChange });
  callbacks.current = { onCommit, onClose, onDraftChange };
  const observedCommit=useRef(committed),draftRef=useRef(draft);draftRef.current=draft;
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => { if(observedCommit.current===committed)return;observedCommit.current=committed;cancel();draftRef.current=committed;setDraft(committed);callbacks.current.onDraftChange?.(committed); }, [committed]);
  // Activity detaches effects, not the input's state. Resume a pending search;
  // do not replace the retained draft with an unchanged committed value.
  useEffect(() => {if(draftRef.current!==observedCommit.current)timer.current=setTimeout(()=>{timer.current=null;callbacks.current.onCommit(draftRef.current);},commitDelayMs);return()=>cancel();}, []);
  const commit = next => { cancel(); callbacks.current.onCommit(next); };
  return <>
    <input data-hd-search-input="true" ref={inputRef} type="search" value={draft}
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        callbacks.current.onDraftChange?.(next);
        cancel();
        if(commitDelayMs<=0)callbacks.current.onCommit(next);
        else timer.current = setTimeout(() => { timer.current = null; callbacks.current.onCommit(next); }, commitDelayMs);
      }}
      onKeyDown={event => { if (event.key === 'Enter') { commit(draft); event.currentTarget.blur(); } }}
      placeholder={placeholder} enterKeyHint="search" autoFocus className={className} />
    <button type="button" aria-label="Xóa tìm kiếm"
      onClick={() => { if (draft) { setDraft('');callbacks.current.onDraftChange?.('');commit(''); } else { cancel(); callbacks.current.onClose(); } }}
      className="hd-header-search-clear inline-flex w-10 shrink-0 items-center justify-center rounded-full p-0 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
      <X size={15} />
    </button>
  </>;
}
