import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function ListPagination({ pagination, label }) {
  if (pagination.pageCount <= 1) return null;
  return (
    <nav className="hd-list-pagination" aria-label={label}>
      <span aria-live="polite">{pagination.start + 1}–{pagination.end} / {pagination.total}</span>
      <button type="button" aria-label="Trang trước" title="Trang trước" disabled={pagination.page === 0} onClick={() => pagination.setPage(pagination.page - 1)}><ChevronLeft size={18} /></button>
      <select aria-label="Chọn trang" value={pagination.page} onChange={event => pagination.setPage(Number(event.target.value))}>
        {Array.from({ length: pagination.pageCount }, (_, page) => <option key={page} value={page}>{page + 1} / {pagination.pageCount}</option>)}
      </select>
      <button type="button" aria-label="Trang sau" title="Trang sau" disabled={pagination.page + 1 >= pagination.pageCount} onClick={() => pagination.setPage(pagination.page + 1)}><ChevronRight size={18} /></button>
    </nav>
  );
}
