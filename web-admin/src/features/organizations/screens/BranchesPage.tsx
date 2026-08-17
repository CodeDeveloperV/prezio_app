import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';

import { useActiveMembership } from '@/shared/store/authStore';
import { BranchFormDialog } from '../components/BranchFormDialog';
import { useCreateBranch, useUpdateBranch } from '../hooks/useBranchMutations';
import { useBranches } from '../hooks/useBranches';

import type { GridColDef } from '@mui/x-data-grid';
import type { StoreBranch } from '@prezio/shared-types';

export function BranchesPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const isAdmin = activeMembership?.role === 'organization_admin';

  const branchesQuery = useBranches(storeId);
  const createBranch = useCreateBranch(storeId);
  const updateBranch = useUpdateBranch(storeId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<StoreBranch | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreateDialog = () => {
    setEditingBranch(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (branch: StoreBranch) => {
    setEditingBranch(branch);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = (values: { name: string; city: string }) => {
    setFormError(null);
    const mutation = editingBranch
      ? updateBranch.mutateAsync({ branchId: editingBranch.id, payload: values })
      : createBranch.mutateAsync(values);

    mutation
      .then(() => setDialogOpen(false))
      .catch(() => setFormError('No se pudo guardar la sucursal. Intenta de nuevo.'));
  };

  const columns: GridColDef<StoreBranch>[] = [
    { field: 'name', headerName: 'Nombre', flex: 1 },
    { field: 'city', headerName: 'Ciudad', flex: 1 },
    ...(isAdmin
      ? [
          {
            field: 'actions',
            headerName: '',
            width: 80,
            sortable: false,
            renderCell: (params: { row: StoreBranch }) => (
              <Button
                size="small"
                startIcon={<IconPencil size={16} />}
                onClick={() => openEditDialog(params.row)}
              >
                Editar
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Sucursales
        </Typography>
        {isAdmin && (
          <Button variant="contained" startIcon={<IconPlus size={18} />} onClick={openCreateDialog}>
            Nueva sucursal
          </Button>
        )}
      </Stack>

      {branchesQuery.isError && <Alert severity="error">No se pudieron cargar las sucursales.</Alert>}

      <Box sx={{ backgroundColor: 'background.paper' }}>
        <DataGrid
          rows={branchesQuery.data ?? []}
          columns={columns}
          loading={branchesQuery.isLoading}
          autoHeight
          disableRowSelectionOnClick
          hideFooter={(branchesQuery.data?.length ?? 0) <= 25}
        />
      </Box>

      <BranchFormDialog
        open={dialogOpen}
        branch={editingBranch}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        isSubmitting={createBranch.isPending || updateBranch.isPending}
        error={formError}
      />
    </Box>
  );
}
