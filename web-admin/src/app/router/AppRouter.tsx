import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/screens/LoginPage';
import { ComingSoonPage } from '@/shared/components/ComingSoonPage';
import { AppShell } from '../layout/AppShell';
import { ProtectedRoute } from './ProtectedRoute';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<ComingSoonPage title="Dashboard" />} />
          <Route path="branches" element={<ComingSoonPage title="Sucursales" />} />
          <Route path="catalog" element={<ComingSoonPage title="Catálogo" />} />
          <Route path="pricing" element={<ComingSoonPage title="Precios" />} />
          <Route path="promotions" element={<ComingSoonPage title="Promociones" />} />
          <Route path="coupons" element={<ComingSoonPage title="Cupones" />} />
          <Route path="reports" element={<ComingSoonPage title="Reportes" />} />
          <Route path="members" element={<ComingSoonPage title="Miembros" />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
