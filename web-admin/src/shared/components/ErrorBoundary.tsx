import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches uncaught render-time errors anywhere in the app so the portal shows a
 * recoverable message instead of a blank white screen. No telemetry/reporting --
 * out of scope for this hardening pass (spec explicitly excludes new observability).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled error in the admin portal:', error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.assign('/');
  };

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 480 }}>
          <Alert severity="error">Ocurrió un error inesperado en el portal.</Alert>
          <Typography variant="body2" color="text.secondary">
            Intenta recargar la página. Si el problema persiste, contacta al soporte técnico.
          </Typography>
          <Button variant="contained" onClick={this.handleReload}>
            Recargar
          </Button>
        </Stack>
      </Box>
    );
  }
}
