export const hdColors = Object.freeze({
  primary: Object.freeze({ 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#2563eb', 600: '#1d4ed8', 700: '#1e40af', 800: '#1e3a8a', 900: '#172554' }),
  secondary: Object.freeze({ 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63' }),
  neutral: Object.freeze({ 0: '#ffffff', 25: '#fbfcfd', 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' }),
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  info: '#06b6d4',
  brand: '#2563eb',
  brandStrong: '#1d4ed8',
  ink: '#172033',
  muted: '#64748b',
  surface: '#ffffff',
  canvas: '#f8fafc',
  border: '#e2e8f0'
});
export const hdSpacing = Object.freeze({
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  '2xl': '2rem',
  '3xl': '3rem'
});

export const hdTypography = Object.freeze({
  fontSans: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  kpiLarge: Object.freeze({ size: '24px', weight: 700, lineHeight: '32px' }),
  kpiMedium: Object.freeze({ size: '20px', weight: 700, lineHeight: '28px' }),
  kpiSmall: Object.freeze({ size: '16px', weight: 700, lineHeight: '24px' }),
  pageTitle: Object.freeze({ size: '20px', weight: 700, lineHeight: '28px' }),
  sectionTitle: Object.freeze({ size: '16px', weight: 600, lineHeight: '24px' }),
  cardTitle: Object.freeze({ size: '14px', weight: 600, lineHeight: '20px' }),
  body: Object.freeze({ size: '14px', weight: 400, lineHeight: '20px' }),
  bodyStrong: Object.freeze({ size: '14px', weight: 500, lineHeight: '20px' }),
  label: Object.freeze({ size: '13px', weight: 500, lineHeight: '18px' }),
  caption: Object.freeze({ size: '12px', weight: 400, lineHeight: '16px' }),
  micro: Object.freeze({ size: '11px', weight: 500, lineHeight: '16px' }),
  h1: Object.freeze({ size: '20px', weight: 700, lineHeight: '28px' }),
  h2: Object.freeze({ size: '16px', weight: 600, lineHeight: '24px' }),
  h3: Object.freeze({ size: '14px', weight: 600, lineHeight: '20px' }),
  h4: Object.freeze({ size: '14px', weight: 600, lineHeight: '20px' }),
  h5: Object.freeze({ size: '13px', weight: 500, lineHeight: '18px' }),
  h6: Object.freeze({ size: '12px', weight: 500, lineHeight: '16px' }),
  bodyLarge: '14px',
  button: '14px',
  title: '20px',
  heading: '20px',
  lineHeight: '20px'
});

export const hdRadius = Object.freeze({
  xs: '0.375rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  pill: '999px'
});

export const hdElevation = Object.freeze({
  xs: '0 1px 2px rgb(15 23 42 / 0.05)',
  sm: '0 2px 8px rgb(15 23 42 / 0.07)',
  md: '0 10px 28px rgb(15 23 42 / 0.10)',
  lg: '0 20px 48px rgb(15 23 42 / 0.14)',
  xl: '0 28px 72px rgb(15 23 42 / 0.18)',
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
  compactPhone: 320,
  smallPhone: 360,
  phone375: 375,
  phone390: 390,
  phone412: 412,
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
