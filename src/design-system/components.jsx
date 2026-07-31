import React from 'react';

export function HDCard({ as: Component = 'section', tone = 'default', className = '', children, ...props }) {
  return <Component className={`hd-ds-card hd-ds-card--${tone} ${className}`.trim()} {...props}>{children}</Component>;
}

export function HDButton({ variant = 'primary', size = 'md', className = '', type = 'button', children, ...props }) {
  return <button type={type} className={`hd-ds-button hd-ds-button--${variant} hd-ds-button--${size} ${className}`.trim()} {...props}>{children}</button>;
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
          {onClose ? <button type="button" className="hd-ds-icon-button" onClick={onClose} aria-label="Dong">&times;</button> : null}
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
