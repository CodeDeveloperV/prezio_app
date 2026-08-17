import { Alert, Box, Button, MenuItem, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { IconBan, IconPencil, IconPlus, IconRocket, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useBranches } from '@/features/organizations/hooks/useBranches';
import { useActiveMembership } from '@/shared/store/authStore';
import { PromotionActionError } from '../api/promotionsApi';
import { PromotionConfirmDialog } from '../components/PromotionConfirmDialog';
import { PromotionFormDialog } from '../components/PromotionFormDialog';
import { PromotionStatusChip } from '../components/PromotionStatusChip';
import { PROMOTION_DISPLAY_STATUS_LABELS, PROMOTION_TYPE_LABELS, PROMOTION_TYPE_OPTIONS } from '../constants';
import {
  useCancelPromotion,
  useCreatePromotion,
  useDeletePromotion,
  usePublishPromotion,
  useUpdatePromotion,
} from '../hooks/usePromotionMutations';
import { usePromotion, usePromotions } from '../hooks/usePromotions';

import type { PromotionFilters } from '../api/promotionsApi';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import type { PromotionCreate, PromotionDisplayStatus, PromotionListItemRead, PromotionType } from '@prezio/shared-types';

type ConfirmAction = { kind: 'publish' | 'cancel' | 'delete'; promotion: PromotionListItemRead };

const DISPLAY_STATUS_OPTIONS: PromotionDisplayStatus[] = ['draft', 'scheduled', 'active', 'expired', 'cancelled'];

export function PromotionsPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const isAdmin = activeMembership?.role === 'organization_admin';
  const canWrite = activeMembership?.role === 'organization_admin' || activeMembership?.role === 'manager';
  const managedBranchIds = activeMembership?.branch_ids ?? [];

  const [filters, setFilters] = useState<Omit<PromotionFilters, 'page' | 'page_size'>>({});
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });

  const branchesQuery = useBranches(storeId);
  const branches = branchesQuery.data ?? [];
  const availableBranches = isAdmin ? branches : branches.filter((b) => managedBranchIds.includes(b.id));

  const promotionsQuery = usePromotions(storeId, {
    ...filters,
    page: paginationModel.page + 1,
    page_size: paginationModel.pageSize,
  });

  const createPromotion = useCreatePromotion(storeId);
  const updatePromotion = useUpdatePromotion(storeId);
  const publishPromotion = usePublishPromotion(storeId);
  const cancelPromotion = useCancelPromotion(storeId);
  const deletePromotion = useDeletePromotion(storeId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPromotionId, setEditingPromotionId] = useState<number | null>(null);
  const editingPromotionQuery = usePromotion(storeId, editingPromotionId);
  const editingPromotion = editingPromotionQuery.data ?? null;
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rows = promotionsQuery.data?.items ?? [];
  const total = promotionsQuery.data?.total ?? 0;

  const canManage = (promotion: Pick<PromotionListItemRead, 'branch_ids'>) =>
    isAdmin || promotion.branch_ids.every((id) => managedBranchIds.includes(id));

  const openCreateDialog = () => {
    setEditingPromotionId(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (promotion: PromotionListItemRead) => {
    setEditingPromotionId(promotion.id);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = (values: PromotionCreate) => {
    setFormError(null);
    const mutation = editingPromotionId
      ? updatePromotion.mutateAsync({ promotionId: editingPromotionId, payload: values })
      : createPromotion.mutateAsync(values);

    mutation
      .then(() => {
        setDialogOpen(false);
        setToast(editingPromotionId ? 'Promoción actualizada' : 'Promoción creada');
      })
      .catch((err: unknown) => {
        setFormError(err instanceof PromotionActionError ? err.message : 'No se pudo guardar la promoción.');
      });
  };

  const runConfirmAction = () => {
    if (!confirmAction) return;
    setConfirmError(null);
    const { kind, promotion } = confirmAction;
    const mutation =
      kind === 'publish'
        ? publishPromotion.mutateAsync(promotion.id)
        : kind === 'cancel'
          ? cancelPromotion.mutateAsync(promotion.id)
          : deletePromotion.mutateAsync(promotion.id);

    mutation
      .then(() => {
        setConfirmAction(null);
        setToast(
          kind === 'publish' ? 'Promoción publicada' : kind === 'cancel' ? 'Promoción cancelada' : 'Promoción eliminada',
        );
      })
      .catch((err: unknown) => {
        setConfirmError(err instanceof PromotionActionError ? err.message : 'No se pudo completar la acción.');
      });
  };

  const columns: GridColDef<PromotionListItemRead>[] = [
    { field: 'name', headerName: 'Nombre', flex: 1.2 },
    {
      field: 'type',
      headerName: 'Tipo',
      flex: 0.8,
      valueGetter: (_, row) => PROMOTION_TYPE_LABELS[row.type],
    },
    {
      field: 'display_status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => <PromotionStatusChip status={params.row.display_status} />,
    },
    { field: 'priority', headerName: 'Prioridad', width: 90 },
    {
      field: 'start_at',
      headerName: 'Inicio',
      flex: 0.9,
      valueGetter: (_, row) => new Date(row.start_at).toLocaleString(),
    },
    {
      field: 'end_at',
      headerName: 'Fin',
      flex: 0.9,
      valueGetter: (_, row) => new Date(row.end_at).toLocaleString(),
    },
    {
      field: 'branch_ids',
      headerName: 'Sucursales',
      width: 100,
      valueGetter: (_, row) => row.branch_ids.length,
    },
    {
      field: 'product_ids',
      headerName: 'Productos',
      width: 100,
      valueGetter: (_, row) => row.product_ids.length,
    },
    {
      field: 'actions',
      headerName: '',
      width: 220,
      sortable: false,
      renderCell: (params) => {
        const promotion = params.row;
        if (!canWrite || !canManage(promotion)) return null;
        return (
          <Stack direction="row" spacing={1}>
            {promotion.status === 'draft' && (
              <Button size="small" startIcon={<IconPencil size={16} />} onClick={() => openEditDialog(promotion)}>
                Editar
              </Button>
            )}
            {promotion.status === 'draft' && (
              <Button
                size="small"
                color="success"
                startIcon={<IconRocket size={16} />}
                onClick={() => setConfirmAction({ kind: 'publish', promotion })}
              >
                Publicar
              </Button>
            )}
            {promotion.status === 'published' && (
              <Button
                size="small"
                color="warning"
                startIcon={<IconBan size={16} />}
                onClick={() => setConfirmAction({ kind: 'cancel', promotion })}
              >
                Cancelar
              </Button>
            )}
            {promotion.status === 'draft' && promotion.branch_ids.length === 0 && promotion.product_ids.length === 0 && (
              <Button
                size="small"
                color="error"
                startIcon={<IconTrash size={16} />}
                onClick={() => setConfirmAction({ kind: 'delete', promotion })}
              >
                Eliminar
              </Button>
            )}
          </Stack>
        );
      },
    },
  ];

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          Promociones
        </Typography>
        {canWrite && (
          <Button variant="contained" startIcon={<IconPlus size={18} />} onClick={openCreateDialog}>
            Nueva promoción
          </Button>
        )}
      </Stack>

      {!canWrite && <Alert severity="info" sx={{ mb: 2 }}>Solo puedes consultar las promociones de tu sucursal.</Alert>}

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Nombre"
          size="small"
          value={filters.name ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value || undefined }))}
        />
        <TextField
          label="Tipo"
          size="small"
          select
          sx={{ minWidth: 180 }}
          value={filters.type ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, type: (e.target.value || undefined) as PromotionType | undefined }))}
        >
          <MenuItem value="">Todos</MenuItem>
          {PROMOTION_TYPE_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {PROMOTION_TYPE_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Estado"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.display_status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({
              ...f,
              display_status: (e.target.value || undefined) as PromotionDisplayStatus | undefined,
            }))
          }
        >
          <MenuItem value="">Todos</MenuItem>
          {DISPLAY_STATUS_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {PROMOTION_DISPLAY_STATUS_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Sucursal"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.branch_id ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value ? Number(e.target.value) : undefined }))}
        >
          <MenuItem value="">Todas</MenuItem>
          {availableBranches.map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {promotionsQuery.isError && <Alert severity="error" sx={{ mb: 2 }}>No se pudo cargar la lista de promociones.</Alert>}
      {confirmError && <Alert severity="error" sx={{ mb: 2 }}>{confirmError}</Alert>}

      <Box sx={{ backgroundColor: 'background.paper' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={promotionsQuery.isLoading}
          autoHeight
          disableRowSelectionOnClick
          paginationMode="server"
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[20, 50, 100]}
        />
      </Box>

      <PromotionFormDialog
        open={dialogOpen}
        storeId={storeId}
        promotion={editingPromotion}
        loadingDetail={editingPromotionId !== null && editingPromotionQuery.isLoading}
        branches={availableBranches}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        isSubmitting={createPromotion.isPending || updatePromotion.isPending}
        error={formError}
      />

      <PromotionConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.kind === 'publish'
            ? 'Publicar promoción'
            : confirmAction?.kind === 'cancel'
              ? 'Cancelar promoción'
              : 'Eliminar promoción'
        }
        description={
          confirmAction?.kind === 'publish'
            ? `¿Publicar "${confirmAction.promotion.name}"? Quedará visible de inmediato según sus fechas.`
            : confirmAction?.kind === 'cancel'
              ? `¿Cancelar "${confirmAction.promotion.name}"? Esta acción no se puede deshacer.`
              : `¿Eliminar "${confirmAction?.promotion.name}"? Esta acción no se puede deshacer.`
        }
        confirmLabel={
          confirmAction?.kind === 'publish' ? 'Publicar' : confirmAction?.kind === 'cancel' ? 'Cancelar promoción' : 'Eliminar'
        }
        confirmColor={confirmAction?.kind === 'publish' ? 'primary' : 'error'}
        isSubmitting={publishPromotion.isPending || cancelPromotion.isPending || deletePromotion.isPending}
        onConfirm={runConfirmAction}
        onClose={() => setConfirmAction(null)}
      />

      <Snackbar
        open={toast !== null}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        message={toast ?? ''}
      />
    </Box>
  );
}
