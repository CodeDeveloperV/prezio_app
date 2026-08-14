/**
 * Prezio design tokens for web-admin.
 * Mirrors mobile/src/app/theme/tokens.ts so the brand stays consistent across
 * consumer app and B2B portal, adapted for a desktop-first admin surface.
 */

export const palette = {
  green: '#22C55E',
  greenPress: '#16A34A',
  greenText: '#166534',
  slate900: '#0F172A',
  slate500: '#64748B',
  gray100: '#F3F4F6',
  white: '#FFFFFF',
  red500: '#EF4444',
  amber500: '#F59E0B',
} as const;

export const colorTokens = {
  background: palette.white,
  surface: palette.gray100,
  primary: palette.green,
  primaryPress: palette.greenPress,
  primaryText: palette.greenText,
  textPrimary: palette.slate900,
  textSecondary: palette.slate500,
  danger: palette.red500,
  warning: palette.amber500,
  border: '#E2E8F0',
  white: palette.white,
} as const;

export const fontFamily = {
  heading: "'Poppins SemiBold', 'Poppins', sans-serif",
  body: "'Poppins', sans-serif",
} as const;
