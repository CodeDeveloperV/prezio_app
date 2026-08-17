import { useSessionBootstrap } from '@/features/auth/hooks/useSessionBootstrap';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router/AppRouter';

function Bootstrapped() {
  useSessionBootstrap();
  return <AppRouter />;
}

export function App() {
  return (
    <AppProviders>
      <ErrorBoundary>
        <Bootstrapped />
      </ErrorBoundary>
    </AppProviders>
  );
}
