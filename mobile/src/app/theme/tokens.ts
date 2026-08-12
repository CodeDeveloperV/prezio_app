/**
 * Prezio design tokens.
 * Single source of truth for brand colors, typography, spacing and radii.
 * Consumed by tamagui.config.ts to build the app-wide theme.
 */

export const palette = {
  // Primary / CTA / price accent.
  green: '#22C55E',
  greenPress: '#16A34A',
  // Primary text color / dark-mode base surface.
  slate900: '#0F172A',
  // Secondary text.
  slate500: '#64748B',
  // Light surface (cards, chips).
  gray100: '#F3F4F6',
  // Base background.
  white: '#FFFFFF',
  // Supporting semantic colors (not in the original brief, kept minimal).
  red500: '#EF4444',
  amber500: '#F59E0B',
} as const;

export const colorTokens = {
  background: palette.white,
  backgroundHover: palette.gray100,
  surface: palette.gray100,
  primary: palette.green,
  primaryPress: palette.greenPress,
  textPrimary: palette.slate900,
  textSecondary: palette.slate500,
  danger: palette.red500,
  warning: palette.amber500,
  border: palette.gray100,
} as const;

export const fontFamily = {
  // Poppins SemiBold drives titles and the wordmark.
  heading: 'Poppins-SemiBold',
  // Poppins Regular drives body copy.
  body: 'Poppins-Regular',
} as const;

export const fontWeightScale = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const fontSizeScale = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
} as const;

export const spaceScale = {
  '0': 0,
  '0.5': 2,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
} as const;

export const radiusScale = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '6': 24,
  full: 999,
} as const;
