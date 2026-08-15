import { Alert, Box, Button, MenuItem, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { IconBan, IconPencil, IconPlus, IconRocket, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';

import { useBranches } from '@/features/organizations/hooks/useBranches';
import { useActiveMembership } from '@/shared/store/authStore';
import { CouponActionError } from '../api/couponsApi';
import { CouponConfirmDialog } from '../components/CouponConfirmDialog';
import { CouponFormDialog } from '../components/CouponFormDialog';
import { CouponStatusChip } from '../components/CouponStatusChip';
import { COUPON_DISPLAY_STATUS_LABELS, COUPON_TYPE_LABELS, COUPON_TYPE_OPTIONS } from '../constants';
import {
  useCancelCoupon,
  useCreateCoupon,
  useDeleteCoupon,
  usePublishCoupon,
  useUpdateCoupon,
} from '../hooks/useCouponMutations';
import { useCoupon, useCoupons } from '../hooks/useCoupons';

import type { CouponFilters } from '../api/couponsApi';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import type { CouponCreate, CouponDisplayStatus, CouponListItemRead, CouponType } from '@prezio/shared-types';

type ConfirmAction = { kind: 'publish' | 'cancel' | 'delete'; coupon: CouponListItemRead };

const DISPLAY_STATUS_OPTIONS: CouponDisplayStatus[] = ['draft', 'scheduled', 'active', 'expired', 'cancelled'];

function benefitSummary(coupon: CouponListItemRead): string {
  return coupon.type === 'percentage_discount' ? `${coupon.percentage_value}% de descuento` : `$${coupon.fixed_amount_value} de descuento`;
}

function scopeSummary(coupon: CouponListItemRead): string {
  const commercial = coupon.applies_to_entire_purchase ? 'toda la compra' : `${coupon.product_ids.length} producto(s)`;
  const branches = coupon.applies_to_all_branches ? 'todas las sucursales' : `${coupon.branch_ids.length} sucursal(es)`;
  return `${commercial} · ${branches}`;
}

export function CouponsPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const isAdmin = activeMembership?.role === 'organization_admin';
  // Stricter than Promotions: MANAGER and EMPLOYEE are strictly read-only for coupons.
  const canWrite = isAdmin;
  const managedBranchIds = activeMembership?.branch_ids ?? [];

  const [filters, setFilters] = useState<Omit<CouponFilters, 'page' | 'page_size'>>({});
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });

  const branchesQuery = useBranches(storeId);
  const branches = branchesQuery.data ?? [];
  const availableBranches = isAdmin ? branches : branches.filter((b) => managedBranchIds.includes(b.id));

  const couponsQuery = useCoupons(storeId, {
    ...filters,
    page: paginationModel.page + 1,
    page_size: paginationModel.pageSize,
  });

  const createCoupon = useCreateCoupon(storeId);
  const updateCoupon = useUpdateCoupon(storeId);
  const publishCoupon = usePublishCoupon(storeId);
  const cancelCoupon = useCancelCoupon(storeId);
  const deleteCoupon = useDeleteCoupon(storeId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null);
  const editingCouponQuery = useCoupon(storeId, editingCouponId);
  const editingCoupon = editingCouponQuery.data ?? null;
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const rows = couponsQuery.data?.items ?? [];
  const total = couponsQuery.data?.total ?? 0;

  const openCreateDialog = () => {
    setEditingCouponId(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (coupon: CouponListItemRead) => {
    setEditingCouponId(coupon.id);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = (values: CouponCreate) => {
    setFormError(null);
    const mutation = editingCouponId
      ? updateCoupon.mutateAsync({ couponId: editingCouponId, payload: values })
      : createCoupon.mutateAsync(values);

    mutation
      .then(() => {
        setDialogOpen(false);
        setToast(editingCouponId ? 'Cupón actualizado' : 'Cupón creado');
      })
      .catch((err: unknown) => {
        setFormError(err instanceof CouponActionError ? err.message : 'No se pudo guardar el cupón.');
      });
  };

  const runConfirmAction = () => {
    if (!confirmAction) return;
    setConfirmError(null);
    const { kind, coupon } = confirmAction;
    const mutation =
      kind === 'publish'
        ? publishCoupon.mutateAsync(coupon.id)
        : kind === 'cancel'
          ? cancelCoupon.mutateAsync(coupon.id)
          : deleteCoupon.mutateAsync(coupon.id);

    mutation
      .then(() => {
        setConfirmAction(null);
        setToast(kind === 'publish' ? 'Cupón publicado' : kind === 'cancel' ? 'Cupón cancelado' : 'Cupón eliminado');
      })
      .catch((err: unknown) => {
        setConfirmError(err instanceof CouponActionError ? err.message : 'No se pudo completar la acción.');
      });
  };

  const columns: GridColDef<CouponListItemRead>[] = [
    { field: 'code', headerName: 'Código', width: 130 },
    { field: 'name', headerName: 'Nombre', flex: 1.1 },
    {
      field: 'type',
      headerName: 'Beneficio',
      flex: 0.9,
      valueGetter: (_, row) => benefitSummary(row),
    },
    {
      field: 'display_status',
      headerName: 'Estado',
      width: 130,
      renderCell: (params) => <CouponStatusChip status={params.row.display_status} />,
    },
    {
      field: 'scope',
      headerName: 'Alcance',
      flex: 1,
      valueGetter: (_, row) => scopeSummary(row),
    },
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
      field: 'actions',
      headerName: '',
      width: 220,
      sortable: false,
      renderCell: (params) => {
        const coupon = params.row;
        if (!canWrite) return null;
        return (
          <Stack direction="row" spacing={1}>
            {coupon.status === 'draft' && (
              <Button size="small" startIcon={<IconPencil size={16} />} onClick={() => openEditDialog(coupon)}>
                Editar
              </Button>
            )}
            {coupon.status === 'draft' && (
              <Button
                size="small"
                color="success"
                startIcon={<IconRocket size={16} />}
                onClick={() => setConfirmAction({ kind: 'publish', coupon })}
              >
                Publicar
              </Button>
            )}
            {coupon.status === 'published' && (
              <Button
                size="small"
                color="warning"
                startIcon={<IconBan size={16} />}
                onClick={() => setConfirmAction({ kind: 'cancel', coupon })}
              >
                Cancelar
              </Button>
            )}
            {coupon.status === 'draft' && coupon.branch_ids.length === 0 && coupon.product_ids.length === 0 && (
              <Button
                size="small"
                color="error"
                startIcon={<IconTrash size={16} />}
                onClick={() => setConfirmAction({ kind: 'delete', coupon })}
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
          Cupones
        </Typography>
        {canWrite && (
          <Button variant="contained" startIcon={<IconPlus size={18} />} onClick={openCreateDialog}>
            Nuevo cupón
          </Button>
        )}
      </Stack>

      {!canWrite && <Alert severity="info" sx={{ mb: 2 }}>Solo puedes consultar los cupones de tu organización.</Alert>}

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          label="Nombre o código"
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
          onChange={(e) => setFilters((f) => ({ ...f, type: (e.target.value || undefined) as CouponType | undefined }))}
        >
          <MenuItem value="">Todos</MenuItem>
          {COUPON_TYPE_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {COUPON_TYPE_LABELS[option]}
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
              display_status: (e.target.value || undefined) as CouponDisplayStatus | undefined,
            }))
          }
        >
          <MenuItem value="">Todos</MenuItem>
          {DISPLAY_STATUS_OPTIONS.map((option) => (
            <MenuItem key={option} value={option}>
              {COUPON_DISPLAY_STATUS_LABELS[option]}
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

      {couponsQuery.isError && <Alert severity="error" sx={{ mb: 2 }}>No se pudo cargar la lista de cupones.</Alert>}
      {confirmError && <Alert severity="error" sx={{ mb: 2 }}>{confirmError}</Alert>}

      <Box sx={{ backgroundColor: 'background.paper' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={couponsQuery.isLoading}
          autoHeight
          disableRowSelectionOnClick
          paginationMode="server"
          rowCount={total}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[20, 50, 100]}
        />
      </Box>

      <CouponFormDialog
        open={dialogOpen}
        storeId={storeId}
        coupon={editingCoupon}
        loadingDetail={editingCouponId !== null && editingCouponQuery.isLoading}
        branches={availableBranches}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
        isSubmitting={createCoupon.isPending || updateCoupon.isPending}
        error={formError}
      />

      <CouponConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.kind === 'publish'
            ? 'Publicar cupón'
            : confirmAction?.kind === 'cancel'
              ? 'Cancelar cupón'
              : 'Eliminar cupón'
        }
        description={
          confirmAction?.kind === 'publish'
            ? `¿Publicar el cupón "${confirmAction.coupon.code}" (${confirmAction.coupon.name})? ${benefitSummary(confirmAction.coupon)}, aplica a ${scopeSummary(confirmAction.coupon)}. Quedará visible de inmediato según sus fechas.`
            : confirmAction?.kind === 'cancel'
              ? `¿Cancelar el cupón "${confirmAction.coupon.code}"? Esta acción no se puede deshacer.`
              : `¿Eliminar el cupón "${confirmAction?.coupon.code}"? Esta acción no se puede deshacer.`
        }
        confirmLabel={
          confirmAction?.kind === 'publish' ? 'Publicar' : confirmAction?.kind === 'cancel' ? 'Cancelar cupón' : 'Eliminar'
        }
        confirmColor={confirmAction?.kind === 'publish' ? 'primary' : 'error'}
        isSubmitting={publishCoupon.isPending || cancelCoupon.isPending || deleteCoupon.isPending}
        onConfirm={runConfirmAction}
        onClose={() => setConfirmAction(null)}
      />

      <Snackbar open={toast !== null} autoHideDuration={3000} onClose={() => setToast(null)} message={toast ?? ''} />
    </Box>
  );
}
