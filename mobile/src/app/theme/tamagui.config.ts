import { createFont, createTamagui, createTokens } from '@tamagui/core';
import { shorthands } from '@tamagui/shorthands';
import { createMedia } from '@tamagui/react-native-media-driver';

import {
  colorTokens,
  fontFamily,
  fontSizeScale,
  fontWeightScale,
  radiusScale,
  spaceScale,
} from './tokens';

const lineHeightScale = {
  xs: 16,
  sm: 20,
  md: 22,
  lg: 24,
  xl: 28,
  xxl: 34,
  display: 40,
} as const;

const headingFont = createFont({
  family: fontFamily.heading,
  size: fontSizeScale,
  lineHeight: lineHeightScale,
  weight: {
    xs: fontWeightScale.semibold,
    sm: fontWeightScale.semibold,
    md: fontWeightScale.semibold,
    lg: fontWeightScale.semibold,
    xl: fontWeightScale.semibold,
    xxl: fontWeightScale.semibold,
    display: fontWeightScale.semibold,
  },
});

const bodyFont = createFont({
  family: fontFamily.body,
  size: fontSizeScale,
  lineHeight: lineHeightScale,
  weight: {
    xs: fontWeightScale.regular,
    sm: fontWeightScale.regular,
    md: fontWeightScale.regular,
    lg: fontWeightScale.regular,
    xl: fontWeightScale.regular,
    xxl: fontWeightScale.medium,
    display: fontWeightScale.medium,
  },
});

const tokens = createTokens({
  color: {
    primary: colorTokens.primary,
    primaryPress: colorTokens.primaryPress,
    background: colorTokens.background,
    backgroundHover: colorTokens.backgroundHover,
    surface: colorTokens.surface,
    textPrimary: colorTokens.textPrimary,
    textSecondary: colorTokens.textSecondary,
    danger: colorTokens.danger,
    warning: colorTokens.warning,
    border: colorTokens.border,
    white: '#FFFFFF',
  },
  space: { ...spaceScale, true: spaceScale['4'] },
  size: { ...spaceScale, true: spaceScale['4'] },
  radius: { ...radiusScale, true: radiusScale['2'] },
  zIndex: { 0: 0, 1: 100, 2: 200, 3: 300 },
});

const lightTheme = {
  background: tokens.color.background,
  backgroundHover: tokens.color.backgroundHover,
  surface: tokens.color.surface,
  color: tokens.color.textPrimary,
  colorSecondary: tokens.color.textSecondary,
  primary: tokens.color.primary,
  primaryPress: tokens.color.primaryPress,
  borderColor: tokens.color.border,
  danger: tokens.color.danger,
  warning: tokens.color.warning,
};

const darkTheme = {
  // Per brand spec, #0F172A doubles as the primary text color in light mode
  // and the base background in dark mode.
  background: tokens.color.textPrimary,
  backgroundHover: '#1E293B',
  surface: '#1E293B',
  color: tokens.color.white,
  colorSecondary: tokens.color.textSecondary,
  primary: tokens.color.primary,
  primaryPress: tokens.color.primaryPress,
  borderColor: '#1E293B',
  danger: tokens.color.danger,
  warning: tokens.color.warning,
};

const config = createTamagui({
  defaultFont: 'body',
  fonts: {
    heading: headingFont,
    body: bodyFont,
  },
  tokens,
  themes: {
    light: lightTheme,
    dark: darkTheme,
  },
  shorthands,
  media: createMedia({
    xs: { maxWidth: 660 },
    sm: { maxWidth: 800 },
    md: { maxWidth: 1020 },
    lg: { maxWidth: 1280 },
    xl: { maxWidth: 1420 },
  }),
});

export type AppConfig = typeof config;

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;
