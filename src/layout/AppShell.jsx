import React from 'react';

export const AppShell = React.forwardRef(function AppShell({ children, className = '', theme = 'light', ...props }, ref) {
  return (
    <div
      ref={ref}
      data-hd-shell="enterprise"
      data-hd-theme={theme}
      className={`hd-enterprise-app-shell hd-theme-${theme} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
});

export function HDHeader({ children, className = '', ...props }) {
  return <header data-hd-region="header" className={`hd-enterprise-header ${className}`.trim()} {...props}>{children}</header>;
}
export function HDNavigation({ children, className = '', ...props }) {
  return <nav data-hd-region="navigation" className={`hd-enterprise-navigation ${className}`.trim()} {...props}>{children}</nav>;
}

export function HDBottomNavigation({ children, className = '', ...props }) {
  return <div data-hd-navigation="bottom" className={`hd-enterprise-bottom-navigation ${className}`.trim()} {...props}>{children}</div>;
}

export function HDNavigationRail({ children, className = '', ...props }) {
  return <div data-hd-navigation="rail" className={`hd-navigation-rail ${className}`.trim()} {...props}>{children}</div>;
}

export function HDSidebar({ children, className = '', ...props }) {
  return <div data-hd-navigation="sidebar" className={`hd-enterprise-sidebar ${className}`.trim()} {...props}>{children}</div>;
}
