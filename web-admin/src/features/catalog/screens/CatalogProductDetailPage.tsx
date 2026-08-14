import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { useActiveMembership } from '@/shared/store/authStore';
import { AddToBranchDialog } from '../components/AddToBranchDialog';
import { ModerationStatusChip } from '../components/ModerationStatusChip';
import { OrgStatusChip } from '../components/OrgStatusChip';
import { useCatalogProduct } from '../hooks/useCatalogProduct';
import { useCreateListings, useUpdateListingStatus } from '../hooks/useListingMutations';

import type { AddToBranchFormValues } from '../components/AddToBranchDialog';
import type { BranchListingRead, StoreBranch } from '@prezio/shared-types';

function branchListingToStoreBranch(branch: BranchListingRead, storeId: number): StoreBranch {
  return { id: branch.branch_id, store_id: storeId, name: branch.branch_name, city: branch.city };
}

export function CatalogProductDetailPage() {
  const navigate = useNavigate();
  const { productId } = useParams<{ productId: string }>();
  const productIdNum = productId ? Number(productId) : null;

  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const isAdmin = activeMembership?.role === 'organization_admin';
  const isManager = activeMembership?.role === 'manager';

  const canManageBranch = (branchId: number) =>
    isAdmin || (isManager && (activeMembership?.branch_ids.includes(branchId) ?? false));

  const productQuery = useCatalogProduct(storeId, productIdNum);
  const updateStatus = useUpdateListingStatus(storeId, productIdNum);
  const createListings = useCreateListings(storeId, productIdNum);

  const [addDialogBranch, setAddDialogBranch] = useState<BranchListingRead | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDeactivate = (branch: BranchListingRead) => {
    setActionError(null);
    updateStatus
      .mutateAsync({ branchId: branch.branch_id, payload: { status: 'inactive' } })
      .catch(() => setActionError('No se pudo desactivar el producto en esta sucursal.'));
  };

  const handleReactivate = (branch: BranchListingRead) => {
    setActionError(null);
    createListings
      .mutateAsync({
        branch_ids: [branch.branch_id],
        initial_price: branch.current_price ?? '0',
        currency: branch.currency ?? 'USD',
      })
      .catch(() => setActionError('No se pudo reactivar el producto en esta sucursal.'));
  };

  const handleAddSubmit = (values: AddToBranchFormValues) => {
    setFormError(null);
    createListings
      .mutateAsync({
        branch_ids: values.branch_ids,
        initial_price: values.initial_price,
        currency: values.currency,
      })
      .then(() => setAddDialogBranch(null))
      .catch(() => setFormError('No se pudo agregar el producto a esta sucursal.'));
  };

  if (productQuery.isLoading) {
    return <Typography>Cargando...</Typography>;
  }

  if (productQuery.isError || !productQuery.data) {
    return <Alert severity="error">No se pudo cargar el producto.</Alert>;
  }

  const product = productQuery.data;

  return (
    <Box>
      <Button startIcon={<IconArrowLeft size={16} />} onClick={() => navigate('/catalog')} sx={{ mb: 2 }}>
        Volver al catálogo
      </Button>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={3}>
            <Avatar src={product.image_url ?? undefined} variant="rounded" sx={{ width: 96, height: 96 }} />
            <Stack spacing={1} sx={{ flex: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {product.canonical_name}
              </Typography>
              <Stack direction="row" spacing={1}>
                <ModerationStatusChip status={product.status} />
              </Stack>
              <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap' }}>
                <Typography variant="body2" color="text.secondary">
                  Marca: {product.brand_name ?? '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Presentación: {product.presentation ?? '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Categoría: {product.category_name ?? '—'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Barcode: {product.barcode ?? '—'}
                </Typography>
              </Stack>
              {product.description && (
                <Typography variant="body2" color="text.secondary">
                  {product.description}
                </Typography>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Disponibilidad en mis sucursales
      </Typography>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {actionError}
        </Alert>
      )}

      <Stack spacing={1}>
        {product.branches.map((branch) => {
          const canManage = canManageBranch(branch.branch_id);
          return (
            <Card key={branch.branch_id} variant="outlined">
              <CardContent>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Stack>
                    <Typography sx={{ fontWeight: 500 }}>
                      {branch.branch_name} — {branch.city}
                    </Typography>
                    {branch.current_price && (
                      <Typography variant="body2" color="text.secondary">
                        Precio actual: {branch.currency} {branch.current_price}
                      </Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <OrgStatusChip status={branch.status} />
                    {canManage && branch.status === 'active' && (
                      <Button
                        size="small"
                        color="warning"
                        onClick={() => handleDeactivate(branch)}
                        disabled={updateStatus.isPending}
                      >
                        Desactivar
                      </Button>
                    )}
                    {canManage && branch.status === 'inactive' && (
                      <Button
                        size="small"
                        color="success"
                        onClick={() => handleReactivate(branch)}
                        disabled={createListings.isPending}
                      >
                        Reactivar
                      </Button>
                    )}
                    {canManage && branch.status === 'not_listed' && (
                      <Button
                        size="small"
                        onClick={() => {
                          setFormError(null);
                          setAddDialogBranch(branch);
                        }}
                      >
                        Agregar
                      </Button>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <AddToBranchDialog
        open={addDialogBranch !== null}
        branches={addDialogBranch && storeId !== null ? [branchListingToStoreBranch(addDialogBranch, storeId)] : []}
        preselectedBranchId={addDialogBranch?.branch_id}
        onClose={() => setAddDialogBranch(null)}
        onSubmit={handleAddSubmit}
        isSubmitting={createListings.isPending}
        error={formError}
      />
    </Box>
  );
}
