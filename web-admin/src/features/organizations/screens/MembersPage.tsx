import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useActiveMembership } from '@/shared/store/authStore';
import { MemberActionError } from '../api/membersApi';
import { ROLE_LABELS } from '../constants';
import { MemberFormDialog } from '../components/MemberFormDialog';
import { useBranches } from '../hooks/useBranches';
import { useInviteMember, useRemoveMember, useUpdateMember } from '../hooks/useMemberMutations';
import { useMembers } from '../hooks/useMembers';

import type { MemberFormValues } from '../components/MemberFormDialog';
import type { GridColDef } from '@mui/x-data-grid';
import type { OrganizationMemberRead } from '@prezio/shared-types';

export function MembersPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const isAdmin = activeMembership?.role === 'organization_admin';

  const membersQuery = useMembers(storeId, isAdmin);
  const branchesQuery = useBranches(storeId);
  const inviteMember = useInviteMember(storeId);
  const updateMember = useUpdateMember(storeId);
  const removeMember = useRemoveMember(storeId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMemberRead | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const branches = branchesQuery.data ?? [];

  const openInviteDialog = () => {
    setEditingMember(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (member: OrganizationMemberRead) => {
    setEditingMember(member);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = (values: MemberFormValues) => {
    setFormError(null);
    const mutation = editingMember
      ? updateMember.mutateAsync({
          memberId: editingMember.id,
          payload: { role: values.role, status: values.status, branch_ids: values.branch_ids },
        })
      : inviteMember.mutateAsync({ email: values.email, role: values.role, branch_ids: values.branch_ids });

    mutation
      .then(() => setDialogOpen(false))
      .catch((err: unknown) => {
        setFormError(err instanceof MemberActionError ? err.message : 'No se pudo guardar el miembro.');
      });
  };

  const handleRemove = (member: OrganizationMemberRead) => {
    if (!window.confirm(`¿Eliminar a ${member.user_email} de la organización?`)) {
      return;
    }
    setActionError(null);
    removeMember.mutate(member.id, {
      onError: (err: unknown) => {
        setActionError(err instanceof MemberActionError ? err.message : 'No se pudo eliminar el miembro.');
      },
    });
  };

  const branchNames = (branchIds: number[]) =>
    branchIds.length === 0 ? '—' : branches.filter((b) => branchIds.includes(b.id)).map((b) => b.name).join(', ');

  const columns: GridColDef<OrganizationMemberRead>[] = [
    { field: 'user_email', headerName: 'Correo', flex: 1.2 },
    {
      field: 'role',
      headerName: 'Rol',
      flex: 0.6,
      renderCell: (params) => <Chip size="small" label={ROLE_LABELS[params.row.role]} />,
    },
    {
      field: 'status',
      headerName: 'Estado',
      flex: 0.6,
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.row.status === 'active' ? 'Activo' : 'Inactivo'}
          color={params.row.status === 'active' ? 'success' : 'default'}
        />
      ),
    },
    {
      field: 'branch_ids',
      headerName: 'Sucursales',
      flex: 1.2,
      valueGetter: (_, row) =>
        row.role === 'organization_admin' ? 'Todas' : branchNames(row.branch_ids),
    },
    {
      field: 'joined_at',
      headerName: 'Miembro desde',
      flex: 0.8,
      valueGetter: (_, row) => new Date(row.joined_at).toLocaleDateString(),
    },
    {
      field: 'actions',
      headerName: '',
      width: 160,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<IconPencil size={16} />} onClick={() => openEditDialog(params.row)}>
            Editar
          </Button>
          <Button
            size="small"
            color="error"
            startIcon={<IconTrash size={16} />}
            onClick={() => handleRemove(params.row)}
          >
            Eliminar
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Miembros
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<IconPlus size={18} />} onClick={openInviteDialog}>
            Invitar miembro
          </Button>
        )}
      </Stack>

      {!isAdmin && (
        <Alert severity="info">Solo los administradores de la organización pueden gestionar miembros.</Alert>
      )}

      {isAdmin && (
        <>
          {membersQuery.isError && <Alert severity="error">No se pudieron cargar los miembros.</Alert>}
          {actionError && <Alert severity="error">{actionError}</Alert>}

          <Box sx={{ backgroundColor: 'background.paper' }}>
            <DataGrid
              rows={membersQuery.data ?? []}
              columns={columns}
              loading={membersQuery.isLoading}
              autoHeight
              disableRowSelectionOnClick
              hideFooter={(membersQuery.data?.length ?? 0) <= 25}
            />
          </Box>

          <MemberFormDialog
            open={dialogOpen}
            member={editingMember}
            branches={branches}
            onClose={() => setDialogOpen(false)}
            onSubmit={handleSubmit}
            isSubmitting={inviteMember.isPending || updateMember.isPending}
            error={formError}
          />
        </>
      )}
    </Box>
  );
}
