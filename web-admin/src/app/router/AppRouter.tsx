import { Navigate, Route, Routes } from 'react-router-dom';

import { LoginPage } from '@/features/auth/screens/LoginPage';
import { CatalogProductDetailPage } from '@/features/catalog/screens/CatalogProductDetailPage';
import { CatalogProductsPage } from '@/features/catalog/screens/CatalogProductsPage';
import { CouponsPage } from '@/features/coupons/screens/CouponsPage';
import { BranchesPage } from '@/features/organizations/screens/BranchesPage';
import { MembersPage } from '@/features/organizations/screens/MembersPage';
import { PricingPage } from '@/features/pricing/screens/PricingPage';
import { PromotionsPage } from '@/features/promotions/screens/PromotionsPage';
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
          <Route path="branches" element={<BranchesPage />} />
          <Route path="catalog" element={<CatalogProductsPage />} />
          <Route path="catalog/products/:productId" element={<CatalogProductDetailPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="coupons" element={<CouponsPage />} />
          <Route path="reports" element={<ComingSoonPage title="Reportes" />} />
          <Route path="members" element={<MembersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
