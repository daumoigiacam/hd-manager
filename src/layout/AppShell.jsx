import React from 'react';

export const AppShell = React.forwardRef(function AppShell({ children, className = '', ...props }, ref) {
  return (
    <div ref={ref} data-hd-shell="enterprise" className={`hd-enterprise-app-shell ${className}`.trim()} {...props}>
      {children}
    </div>
  );
});

export function HDHeader({ children, className = '', ...props }) {
  return <header className={`hd-enterprise-header ${className}`.trim()} {...props}>{children}</header>;
}

export function HDNavigation({ children, className = '', ...props }) {
  return <nav className={`hd-enterprise-navigation ${className}`.trim()} {...props}>{children}</nav>;
}

export function HDBottomNavigation({ children, className = '', ...props }) {
  return <div className={`hd-enterprise-bottom-navigation ${className}`.trim()} {...props}>{children}</div>;
}

export function HDNavigationRail({ children, className = '', ...props }) {
  return <div className={`hd-navigation-rail ${className}`.trim()} {...props}>{children}</div>;
}

export function HDSidebar({ children, className = '', ...props }) {
  return <div className={`hd-enterprise-sidebar ${className}`.trim()} {...props}>{children}</div>;
}

