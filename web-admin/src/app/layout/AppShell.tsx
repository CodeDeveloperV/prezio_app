import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { IconChevronDown, IconLogout } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useLogout } from '@/features/auth/hooks/useLogout';
import { useActiveMembership, useAuthStore } from '@/shared/store/authStore';
import { navItems } from './navConfig';

const DRAWER_WIDTH = 260;

const ROLE_LABELS: Record<string, string> = {
  organization_admin: 'Administrador',
  manager: 'Gerente',
  employee: 'Empleado',
};

function OrganizationSwitcher() {
  const allMemberships = useAuthStore((state) => state.memberships);
  const memberships = useMemo(
    () => allMemberships.filter((m) => m.status === 'active'),
    [allMemberships],
  );
  const activeOrganizationId = useAuthStore((state) => state.activeOrganizationId);
  const setActiveOrganizationId = useAuthStore((state) => state.setActiveOrganizationId);
  const activeMembership = useActiveMembership();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  if (memberships.length <= 1) {
    return (
      <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
        {activeMembership?.organization.name ?? 'Prezio Business'}
      </Typography>
    );
  }

  return (
    <>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ cursor: 'pointer', alignItems: 'center' }}
        onClick={(event: MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget)}
      >
        <Typography variant="subtitle1" noWrap sx={{ fontWeight: 600 }}>
          {activeMembership?.organization.name}
        </Typography>
        <IconChevronDown size={18} />
      </Stack>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {memberships.map((membership) => (
          <MenuItem
            key={membership.organization.id}
            selected={membership.organization.id === activeOrganizationId}
            onClick={() => {
              setActiveOrganizationId(membership.organization.id);
              setAnchorEl(null);
            }}
          >
            {membership.organization.name}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const activeMembership = useActiveMembership();
  const logout = useLogout();

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || (activeMembership && item.roles.includes(activeMembership.role)),
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: 'border-box' },
        }}
      >
        <Toolbar>
          <Typography variant="h6" color="primary.main" sx={{ fontWeight: 700 }}>
            Prezio Business
          </Typography>
        </Toolbar>
        <Divider />
        <Box component="nav" sx={{ py: 1 }}>
          {visibleNavItems.map((item) => {
            const isActive = location.pathname === item.path;
            const ItemIcon = item.icon;
            return (
              <ListItemButton key={item.path} selected={isActive} onClick={() => navigate(item.path)}>
                <ListItemIcon>
                  <ItemIcon size={20} />
                </ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </Box>
      </Drawer>

      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="static"
          color="inherit"
          elevation={0}
          sx={{ borderBottom: '1px solid', borderColor: 'divider' }}
        >
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <OrganizationSwitcher />
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Stack sx={{ alignItems: 'flex-end' }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {user?.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {activeMembership ? ROLE_LABELS[activeMembership.role] : ''}
                </Typography>
              </Stack>
              <Avatar sx={{ bgcolor: 'primary.main' }}>{user?.email?.[0]?.toUpperCase()}</Avatar>
              <ListItemButton
                onClick={logout}
                sx={{ borderRadius: 1, px: 1.5, width: 'auto' }}
                aria-label="Cerrar sesión"
              >
                <IconLogout size={20} />
              </ListItemButton>
            </Stack>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flexGrow: 1, p: 4 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
