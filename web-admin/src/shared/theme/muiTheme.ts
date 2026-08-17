import { createTheme } from '@mui/material/styles';
import { colorTokens, fontFamily } from './tokens';

export const muiTheme = createTheme({
  palette: {
    primary: {
      main: colorTokens.primary,
      dark: colorTokens.primaryPress,
      contrastText: colorTokens.white,
    },
    error: {
      main: colorTokens.danger,
    },
    warning: {
      main: colorTokens.warning,
    },
    background: {
      default: colorTokens.background,
      paper: colorTokens.white,
    },
    text: {
      primary: colorTokens.textPrimary,
      secondary: colorTokens.textSecondary,
    },
  },
  typography: {
    fontFamily: fontFamily.body,
    h1: { fontFamily: fontFamily.heading },
    h2: { fontFamily: fontFamily.heading },
    h3: { fontFamily: fontFamily.heading },
    h4: { fontFamily: fontFamily.heading },
    h5: { fontFamily: fontFamily.heading },
    h6: { fontFamily: fontFamily.heading },
    button: { fontFamily: fontFamily.heading, textTransform: 'none', fontWeight: 600 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
  },
});
