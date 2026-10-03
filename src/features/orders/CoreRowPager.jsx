import 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CoreRowPager({ page, onChange }) {
  if (!page.hasPrevious && !page.hasNext) return null;
  return <nav aria-label="Phân trang" className="mt-3 flex items-center justify-center gap-4">
    <button type="button" title="Trang trước" aria-label="Trang trước" disabled={!page.hasPrevious}
      className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
      onClick={() => onChange(page.offset - page.size)}><ChevronLeft size={20} /></button>
    <span className="text-sm tabular-nums">{Math.floor(page.offset / page.size) + 1} / {Math.ceil(page.total / page.size)}</span>
    <button type="button" title="Trang sau" aria-label="Trang sau" disabled={!page.hasNext}
      className="flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
      onClick={() => onChange(page.offset + page.size)}><ChevronRight size={20} /></button>
  </nav>;
}
