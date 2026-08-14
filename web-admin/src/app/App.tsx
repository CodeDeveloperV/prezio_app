import { useSessionBootstrap } from '@/features/auth/hooks/useSessionBootstrap';
import { AppProviders } from './providers/AppProviders';
import { AppRouter } from './router/AppRouter';

function Bootstrapped() {
  useSessionBootstrap();
  return <AppRouter />;
}

export function App() {
  return (
    <AppProviders>
      <Bootstrapped />
    </AppProviders>
  );
}
