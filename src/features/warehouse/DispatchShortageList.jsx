import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './dispatch-overview.css';

/** @typedef {{key: string, customerName: string, productLabels: readonly string[], requestDateLabels: readonly string[], totalMissingLines: number}} ShortageGroup */
/**
 * @template {ShortageGroup} T
 * @param {{groups: readonly T[], expanded: boolean, onToggle: () => void,
 * onSelect: (group: T) => void, requiredLines: number, dateLabel: string}} props
 */
export default function DispatchShortageList({groups, expanded, onToggle, onSelect, requiredLines, dateLabel}) {
  return <section className="hd-dispatch-shortages" aria-label="Danh sách đơn thiếu">
    {groups.length ? <div className="hd-dispatch-shortage-list">
      {(expanded ? groups : groups.slice(0, 3)).map(group => <button type="button" key={group.key}
        className="hd-dispatch-shortage-customer" onClick={() => onSelect(group)}>
        <strong>{group.customerName}</strong>
        <span className="hd-dispatch-shortage-dates">
          {group.requestDateLabels.slice(0, 2).map(date => <span key={date}>{date}</span>)}
          {group.requestDateLabels.length > 2 && <span>+{group.requestDateLabels.length - 2}</span>}
          <span>{group.totalMissingLines}</span>
        </span>
        <span className="hd-dispatch-shortage-products">Còn thiếu: {group.productLabels.map(label => <span key={label}>{label}</span>)}</span>
      </button>)}
      {groups.length > 3 && <button type="button" className="hd-dispatch-shortage-toggle" onClick={onToggle}
        aria-expanded={expanded} aria-label={expanded ? 'Thu gọn danh sách thiếu' : `Xem thêm ${groups.length - 3} khách còn thiếu`}>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>}
    </div> : <p>{requiredLines > 0 ? `Tốt rồi: các đơn đặt ngày ${dateLabel} đều đã có phiếu xuất kho tương ứng.` : `Chưa có đơn đặt nào cần xuất trong ngày ${dateLabel}.`}</p>}
  </section>;
}
