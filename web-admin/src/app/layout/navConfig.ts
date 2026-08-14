import {
  IconBuildingStore,
  IconCategory,
  IconDashboard,
  IconDiscount2,
  IconReportAnalytics,
  IconTag,
  IconTicket,
  IconUsers,
} from '@tabler/icons-react';

import type { OrganizationRole } from '@prezio/shared-types';
import type { Icon } from '@tabler/icons-react';

export interface NavItem {
  label: string;
  path: string;
  icon: Icon;
  /** Roles that can see this item. Omitted = visible to every organization role. */
  roles?: OrganizationRole[];
}

export const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/', icon: IconDashboard },
  { label: 'Sucursales', path: '/branches', icon: IconBuildingStore },
  { label: 'Catálogo', path: '/catalog', icon: IconCategory },
  { label: 'Precios', path: '/pricing', icon: IconTag },
  { label: 'Promociones', path: '/promotions', icon: IconDiscount2 },
  { label: 'Cupones', path: '/coupons', icon: IconTicket },
  { label: 'Reportes', path: '/reports', icon: IconReportAnalytics },
  { label: 'Miembros', path: '/members', icon: IconUsers, roles: ['organization_admin'] },
];
