import React from 'react';
import { ChevronDown, ChevronLeft, ChevronUp, GripVertical, Plus, Search, X } from 'lucide-react';

const cx = (...values) => values.filter(Boolean).join(' ');

export function HDCard({ as: Component = 'section', tone = 'default', className = '', children, ...props }) {
  return <Component className={`hd-ds-card hd-ds-card--${tone} ${className}`.trim()} {...props}>{children}</Component>;
}

export function HDButton({ variant = 'primary', size = 'md', loading = false, iconOnly = false, className = '', type = 'button', children, disabled, ...props }) {
  return (
    <button
      type={type}
      className={cx('hd-ds-button', `hd-ds-button--${variant}`, `hd-ds-button--${size}`, iconOnly && 'hd-ds-button--icon', loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="hd-ds-button__spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function HDIconButton({ label, children, className = '', ...props }) {
  return <HDButton variant="icon" iconOnly className={className} aria-label={label} {...props}>{children}</HDButton>;
}

export function HDPageHeader({ title, description, onBack, backLabel = 'Quay lại', actions = [], className = '', ...props }) {
  return (
    <header className={cx('hd-ds-page-header', className)} {...props}>
      <div className="hd-ds-page-header__identity">
        {onBack ? <HDIconButton label={backLabel} onClick={onBack}><ChevronLeft aria-hidden="true" /></HDIconButton> : null}
        <div className="hd-ds-page-header__copy">
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {actions.length ? <div className="hd-ds-page-header__actions">{actions.map(({ label, icon, onClick, ...actionProps }) => <HDIconButton key={label} label={label} onClick={onClick} {...actionProps}>{icon}</HDIconButton>)}</div> : null}
    </header>
  );
}

export const HDSearchBar = React.forwardRef(function HDSearchBar({
  label = 'Tìm kiếm',
  placeholder = 'Tìm kiếm',
  value = '',
  onChange,
  onClear,
  className = '',
  ...props
}, ref) {
  return (
    <div className={cx('hd-ds-searchbar', className)} role="search">
      <Search aria-hidden="true" className="hd-ds-searchbar__icon" />
      <input ref={ref} type="search" aria-label={label} placeholder={placeholder} value={value} onChange={onChange} {...props} />
      {value && onClear ? <button className="hd-ds-searchbar__clear" type="button" aria-label="Xóa nội dung tìm kiếm" onClick={onClear}><X aria-hidden="true" /></button> : null}
    </div>
  );
});

export function HDFilterBar({ children, label = 'Bộ lọc', className = '', ...props }) {
  return <div className={cx('hd-ds-filterbar', className)} role="group" aria-label={label} {...props}>{children}</div>;
}

export function HDFilterChip({ selected = false, children, className = '', type = 'button', ...props }) {
  return <button type={type} className={cx('hd-ds-filter-chip', className)} aria-pressed={selected} data-selected={selected || undefined} {...props}>{children}</button>;
}

export function HDFAB({ label, icon, className = '', type = 'button', ...props }) {
  const accessibleLabel = label || 'Tạo mới';
  return <button type={type} className={cx('hd-ds-fab', className)} aria-label={accessibleLabel} title={accessibleLabel} {...props}>{icon || <Plus aria-hidden="true" />}</button>;
}

export function HDStepper({ steps = [], activeIndex = 0, className = '', ...props }) {
  return (
    <ol className={cx('hd-ds-stepper', className)} aria-label="Tiến trình" {...props}>
      {steps.map((step, index) => (
        <li key={typeof step === 'string' ? step : step.label} data-complete={index < activeIndex || undefined} data-active={index === activeIndex || undefined}>
          <span className="hd-ds-stepper__number" aria-hidden="true">{index + 1}</span>
          <span className="hd-ds-stepper__label" aria-current={index === activeIndex ? 'step' : undefined}>{typeof step === 'string' ? step : step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function HDAccordion({ title, children, className = '', defaultOpen = false, ...props }) {
  return <details className={cx('hd-ds-accordion', className)} open={defaultOpen || undefined} {...props}><summary>{title}</summary><div className="hd-ds-accordion__content">{children}</div></details>;
}

export function HDWidgetCustomizer({ widgets = [], hiddenIds = [], onToggle, onMove, onMoveBefore, onReset, title = 'Tùy chỉnh widget', description = 'Bật/tắt hoặc sắp xếp các mục hiển thị.' }) {
  const [draggedId, setDraggedId] = React.useState('');
  return (
    <section className="hd-ds-widget-customizer" aria-label={title}>
      <div className="hd-ds-widget-customizer__header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {onReset ? <button type="button" onClick={onReset}>Đặt lại</button> : null}
      </div>
      <div className="hd-ds-widget-customizer__list">
        {widgets.map((widget, index) => {
          const visible = !hiddenIds.includes(widget.id);
          return (
            <div
              key={widget.id}
              className={`hd-ds-widget-customizer__row${draggedId === widget.id ? ' is-dragging' : ''}`}
              draggable
              onDragStart={(event) => {
                setDraggedId(widget.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', widget.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = draggedId || event.dataTransfer.getData('text/plain');
                if (sourceId) onMoveBefore?.(sourceId, widget.id);
                setDraggedId('');
              }}
              onDragEnd={() => setDraggedId('')}
            >
              <GripVertical className="hd-ds-widget-customizer__grip" size={17} aria-hidden="true" />
              <input type="checkbox" checked={visible} onChange={() => onToggle?.(widget.id)} aria-label={`${visible ? 'Ẩn' : 'Hiện'} ${widget.label}`} />
              <span className="hd-ds-widget-customizer__label">{widget.label}</span>
              <button type="button" disabled={index === 0} onClick={() => onMove?.(widget.id, 'up')} aria-label={`Đưa ${widget.label} lên trên`}>
                <ChevronUp size={17} aria-hidden="true" />
              </button>
              <button type="button" disabled={index === widgets.length - 1} onClick={() => onMove?.(widget.id, 'down')} aria-label={`Đưa ${widget.label} xuống dưới`}>
                <ChevronDown size={17} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function HDField({ label, hint, error, className = '', children, ...props }) {
  return (
    <label className={`hd-ds-field ${error ? 'hd-ds-field--error' : ''} ${className}`.trim()} {...props}>
      {label ? <span className="hd-ds-field__label">{label}</span> : null}
      {children}
      {error ? <span className="hd-ds-field__error" role="alert">{error}</span> : hint ? <span className="hd-ds-field__hint">{hint}</span> : null}
    </label>
  );
}

export function HDDialog({ title, description, footer, className = '', children, onClose, ...props }) {
  return (
    <div className="hd-ds-dialog-layer" role="presentation">
      <section className={`hd-ds-dialog hd-dialog-surface ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} {...props}>
        <header className="hd-ds-dialog__header hd-dialog-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {onClose ? <HDIconButton label="Đóng" onClick={onClose}>&times;</HDIconButton> : null}
        </header>
        <div className="hd-ds-dialog__body hd-dialog-body">{children}</div>
        {footer ? <footer className="hd-ds-dialog__footer hd-dialog-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function HDStatusState({ status = 'loading', title, description, action, className = '' }) {
  return (
    <section className={`hd-ds-state hd-ds-state--${status} ${className}`.trim()} aria-live={status === 'loading' ? 'polite' : 'assertive'}>
      <span className="hd-ds-state__visual" aria-hidden="true" />
      {title ? <h2>{title}</h2> : null}
      {description ? <p>{description}</p> : null}
      {action ? <div className="hd-ds-state__action">{action}</div> : null}
    </section>
  );
}

export const HDEmptyState = (props) => <HDStatusState status="empty" {...props} />;

export const HDInput = React.forwardRef(function HDInput({ label, hint, error, className = '', inputClassName = '', type = 'text', ...props }, ref) {
  return (
    <HDField label={label} hint={hint} error={error} className={className}>
      <input ref={ref} type={type} className={cx('hd-ds-input', inputClassName)} {...props} />
    </HDField>
  );
});

export const HDNumberInput = React.forwardRef(function HDNumberInput(props, ref) {
  return <HDInput ref={ref} type="number" inputMode="decimal" {...props} />;
});

export const HDCurrencyInput = React.forwardRef(function HDCurrencyInput(props, ref) {
  return <HDInput ref={ref} inputMode="decimal" type="text" {...props} />;
});

export const HDDateInput = React.forwardRef(function HDDateInput(props, ref) {
  return <HDInput ref={ref} type="date" {...props} />;
});

export const HDPasswordInput = React.forwardRef(function HDPasswordInput(props, ref) {
  return <HDInput ref={ref} type="password" {...props} />;
});

export const HDSearchInput = React.forwardRef(function HDSearchInput(props, ref) {
  return <HDInput ref={ref} type="search" inputMode="search" data-hd-search-input="true" {...props} />;
});

export const HDSelect = React.forwardRef(function HDSelect({ label, hint, error, className = '', selectClassName = '', children, ...props }, ref) {
  return (
    <HDField label={label} hint={hint} error={error} className={className}>
      <select ref={ref} className={cx('hd-ds-select', selectClassName)} {...props}>{children}</select>
    </HDField>
  );
});

export function HDBadge({ tone = 'neutral', variant = 'status', className = '', children, ...props }) {
  return <span className={cx('hd-ds-badge', `hd-ds-badge--${variant}`, `hd-ds-badge--${tone}`, className)} {...props}>{children}</span>;
}

export const HDStatusBadge = HDBadge;

export function HDTable({ caption, loading = false, empty, children, className = '', ...props }) {
  return (
    <div className={cx('hd-ds-table-wrap', className)}>
      {loading ? <HDSkeleton className="hd-ds-table__loading" /> : null}
      {!loading && empty ? <HDEmptyState title={empty.title || 'Chưa có dữ liệu'} description={empty.description} action={empty.action} /> : null}
      {!loading && !empty ? <table className="hd-ds-table" {...props}>{caption ? <caption>{caption}</caption> : null}{children}</table> : null}
    </div>
  );
}

export function HDTableHead({ children, className = '', ...props }) {
  return <thead className={cx('hd-ds-table__head', className)} {...props}>{children}</thead>;
}

export function HDTableBody({ children, className = '', ...props }) {
  return <tbody className={cx('hd-ds-table__body', className)} {...props}>{children}</tbody>;
}

export function HDTableRow({ selected = false, className = '', children, ...props }) {
  return <tr className={cx(selected && 'is-selected', className)} {...props}>{children}</tr>;
}

export function HDTableCell({ numeric = false, className = '', children, ...props }) {
  return <td className={cx(numeric && 'is-numeric', className)} {...props}>{children}</td>;
}

export function HDToast({ tone = 'info', title, children, action, className = '', ...props }) {
  return (
    <div className={cx('hd-ds-toast', `hd-ds-toast--${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'} {...props}>
      <div className="hd-ds-toast__content">
        {title ? <strong>{title}</strong> : null}
        {children ? <span>{children}</span> : null}
      </div>
      {action ? <div className="hd-ds-toast__action">{action}</div> : null}
    </div>
  );
}

export function HDSkeleton({ width, height, className = '', ...props }) {
  return <span className={cx('hd-ds-skeleton', className)} style={{ width, height }} aria-hidden="true" {...props} />;
}

export function HDProgress({ value = 0, max = 100, label, className = '', ...props }) {
  const safeValue = Math.min(Math.max(Number(value) || 0, 0), Number(max) || 100);
  return (
    <div className={cx('hd-ds-progress', className)} {...props}>
      {label ? <span className="hd-ds-progress__label">{label}</span> : null}
      <progress value={safeValue} max={max} aria-label={label || undefined} />
    </div>
  );
}

export function HDKpiCard({ label, value, hint, tone = 'default', className = '', children, ...props }) {
  return <HDCard tone={tone} className={cx('hd-ds-card--kpi', className)} {...props}><p className="hd-ds-card__eyebrow">{label}</p><strong className="hd-ds-card__value">{value}</strong>{hint ? <span className="hd-ds-card__hint">{hint}</span> : null}{children}</HDCard>;
}

export function HDSummaryCard({ title, value, className = '', children, ...props }) {
  return <HDCard className={cx('hd-ds-card--summary', className)} {...props}><h3>{title}</h3><strong>{value}</strong>{children}</HDCard>;
}

export function HDStatisticCard(props) {
  return <HDKpiCard {...props} className={cx('hd-ds-card--statistic', props.className)} />;
}

export function HDCustomerCard({ name, meta, children, ...props }) {
  return <HDCard className="hd-ds-card--customer" {...props}><h3>{name}</h3>{meta ? <p>{meta}</p> : null}{children}</HDCard>;
}

export function HDProductCard({ name, meta, children, ...props }) {
  return <HDCard className="hd-ds-card--product" {...props}><h3>{name}</h3>{meta ? <p>{meta}</p> : null}{children}</HDCard>;
}

export function HDConfirmDialog(props) { return <HDDialog {...props} />; }
export function HDDeleteDialog(props) { return <HDDialog {...props} />; }
export function HDEditDialog(props) { return <HDDialog {...props} />; }
export function HDCreateDialog(props) { return <HDDialog {...props} />; }
export function HDDetailDialog(props) { return <HDDialog {...props} />; }
