import React from 'react';
import './dispatch-overview.css';

/**
 * @param {{month: string, year: string, years: readonly string[],
 * summary: {totalDays: number, totalLines: number, totalWeight: number},
 * cells: readonly {dateKey: string, dayNumber: number, isCurrentMonth: boolean, isWorkingDate: boolean, group: {totalLines: number} | null}[],
 * onMonthChange: (month: string) => void, onSelect: (date: string) => void,
 * formatNumber: (n: number) => string}} props
 */
export default function DispatchHistoryCalendar({month, year, years, summary, cells, onMonthChange, onSelect, formatNumber}) {
  return <section className="hd-dispatch-calendar" aria-label="Lịch sử xuất kho">
    <header><h3>Lịch sử xuất kho</h3><div className="hd-dispatch-calendar-controls">
      <select aria-label="Tháng lịch sử" value={month} onChange={event => onMonthChange(`${year}-${event.target.value}`)}>
        {Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0')).map(value => <option key={value} value={value}>Tháng {value}</option>)}
      </select>
      <select aria-label="Năm lịch sử" value={year} onChange={event => onMonthChange(`${event.target.value}-${month}`)}>
        {years.map(value => <option key={value} value={value}>Năm {value}</option>)}
      </select>
    </div></header>
    <dl className="hd-dispatch-calendar-summary">
      <div><dt>Ngày có phiếu</dt><dd>{summary.totalDays}</dd></div>
      <div><dt>Tổng đơn</dt><dd>{summary.totalLines}</dd></div>
      <div><dt>Tổng kg</dt><dd>{formatNumber(summary.totalWeight)}</dd></div>
    </dl>
    <div className="hd-dispatch-calendar-grid">
      {['T2','T3','T4','T5','T6','T7','CN'].map(day => <span key={day}>{day}</span>)}
      {cells.map(cell => <button key={cell.dateKey} type="button" disabled={!cell.group}
        aria-label={`${cell.dateKey}: ${cell.group?.totalLines || 0} đơn xuất kho`}
        aria-current={cell.isWorkingDate ? 'date' : undefined}
        data-outside={!cell.isCurrentMonth || undefined}
        onClick={() => onSelect(cell.dateKey)}>
        <span>{cell.dayNumber}</span>{cell.group && <strong>{cell.group.totalLines}</strong>}
      </button>)}
    </div>
  </section>;
}
