export const hdColors = Object.freeze({
  primary: Object.freeze({ 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' }),
  secondary: Object.freeze({ 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63' }),
  neutral: Object.freeze({ 0: '#ffffff', 25: '#fbfcfd', 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' }),
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
  brand: '#2563eb',
  brandStrong: '#1d4ed8',
  ink: '#172033',
  muted: '#64748b',
  surface: '#ffffff',
  canvas: '#f4f6f8',
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
  fontSans: 'InterVariable, Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Roboto Flex", Roboto, "Segoe UI", sans-serif',
  h1: Object.freeze({ size: 'clamp(1.75rem, 1.3rem + 1.5vw, 2.5rem)', weight: 760, lineHeight: 1.15 }),
  h2: Object.freeze({ size: 'clamp(1.5rem, 1.2rem + 1vw, 2rem)', weight: 740, lineHeight: 1.2 }),
  h3: Object.freeze({ size: 'clamp(1.25rem, 1.08rem + 0.55vw, 1.5rem)', weight: 720, lineHeight: 1.25 }),
  h4: Object.freeze({ size: '1.125rem', weight: 700, lineHeight: 1.3 }),
  h5: Object.freeze({ size: '1rem', weight: 680, lineHeight: 1.35 }),
  h6: Object.freeze({ size: '0.875rem', weight: 680, lineHeight: 1.4 }),
  body: '0.875rem',
  bodyLarge: '1rem',
  caption: '0.75rem',
  button: '0.875rem',
  label: '0.75rem',
  title: '1.125rem',
  heading: '1.5rem',
  lineHeight: 1.45
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
