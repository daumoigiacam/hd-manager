export const hdColors = Object.freeze({
  brand: '#10b981',
  brandStrong: '#059669',
  ink: '#172033',
  muted: '#64748b',
  surface: '#ffffff',
  canvas: '#f4f6f8',
  border: '#e2e8f0',
  danger: '#dc2626',
  warning: '#d97706',
  info: '#2563eb'
});
export const hdSpacing = Object.freeze({
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  '2xl': '2rem',
  '3xl': '3rem'
});

export const hdTypography = Object.freeze({
  body: '0.875rem',
  label: '0.75rem',
  title: '1.125rem',
  heading: '1.5rem',
  lineHeight: 1.45
});

export const hdRadius = Object.freeze({
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  pill: '999px'
});

export const hdElevation = Object.freeze({
  low: '0 1px 3px rgb(15 23 42 / 0.08)',
  medium: '0 8px 24px rgb(15 23 42 / 0.10)',
  high: '0 18px 48px rgb(15 23 42 / 0.16)'
});

export const hdMotion = Object.freeze({
  fast: '150ms',
  standard: '200ms',
  slow: '250ms',
  easing: 'cubic-bezier(0.2, 0, 0, 1)'
});

export const hdBreakpoints = Object.freeze({
  smallPhone: 360,
  phone: 430,
  tablet: 600,
  navigationRail: 768,
  laptop: 1024,
  desktop: 1100,
  largeDesktop: 1440
});

export const hdDensity = Object.freeze({
  compact: 0.9,
  comfortable: 1,
  spacious: 1.1
});

export const hdSafeArea = Object.freeze({
  top: 'env(safe-area-inset-top, 0px)',
  right: 'env(safe-area-inset-right, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
  left: 'env(safe-area-inset-left, 0px)'
});

export const hdDesignTokens = Object.freeze({
  colors: hdColors,
  spacing: hdSpacing,
  typography: hdTypography,
  radius: hdRadius,
  elevation: hdElevation,
  motion: hdMotion,
  breakpoints: hdBreakpoints,
  density: hdDensity,
  safeArea: hdSafeArea
});
