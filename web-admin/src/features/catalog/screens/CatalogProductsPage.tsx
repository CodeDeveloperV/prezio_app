import {
  Alert,
  Avatar,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { IconEye, IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useActiveMembership } from '@/shared/store/authStore';
import { useBranches } from '@/features/organizations/hooks/useBranches';
import { AddToBranchDialog } from '../components/AddToBranchDialog';
import { ModerationStatusChip } from '../components/ModerationStatusChip';
import { OrgStatusChip } from '../components/OrgStatusChip';
import { useBrands, useCategories } from '../hooks/useCatalogLookups';
import { useCatalogProducts } from '../hooks/useCatalogProducts';
import { useCreateListings } from '../hooks/useListingMutations';

import type { CatalogProductFilters } from '../api/catalogApi';
import type { AddToBranchFormValues } from '../components/AddToBranchDialog';
import type { GridColDef } from '@mui/x-data-grid';
import type { CatalogProductSummary, ModerationStatus } from '@prezio/shared-types';

const MODERATION_STATUSES: ModerationStatus[] = ['pending', 'approved', 'rejected', 'merged'];

export function CatalogProductsPage() {
  const navigate = useNavigate();
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;
  const canManage =
    activeMembership?.role === 'organization_admin' || activeMembership?.role === 'manager';

  const [filters, setFilters] = useState<CatalogProductFilters>({});
  const productsQuery = useCatalogProducts(storeId, filters);
  const branchesQuery = useBranches(storeId);
  const categoriesQuery = useCategories();
  const brandsQuery = useBrands();

  const [addDialogProduct, setAddDialogProduct] = useState<CatalogProductSummary | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const createListings = useCreateListings(storeId, addDialogProduct?.id ?? null);

  const availableBranches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);

  const handleAddSubmit = (values: AddToBranchFormValues) => {
    setFormError(null);
    createListings
      .mutateAsync({
        branch_ids: values.branch_ids,
        initial_price: values.initial_price,
        currency: values.currency,
      })
      .then(() => setAddDialogProduct(null))
      .catch(() => setFormError('No se pudo agregar el producto a las sucursales seleccionadas.'));
  };

  const columns: GridColDef<CatalogProductSummary>[] = [
    {
      field: 'image_url',
      headerName: '',
      width: 56,
      sortable: false,
      renderCell: (params) => <Avatar src={params.row.image_url ?? undefined} variant="rounded" />,
    },
    { field: 'canonical_name', headerName: 'Nombre', flex: 1.2 },
    { field: 'brand_name', headerName: 'Marca', flex: 0.8, valueGetter: (_, row) => row.brand_name ?? '—' },
    {
      field: 'presentation',
      headerName: 'Presentación',
      flex: 0.8,
      valueGetter: (_, row) => row.presentation ?? '—',
    },
    {
      field: 'category_name',
      headerName: 'Categoría',
      flex: 0.8,
      valueGetter: (_, row) => row.category_name ?? '—',
    },
    { field: 'barcode', headerName: 'Barcode', flex: 0.9, valueGetter: (_, row) => row.barcode ?? '—' },
    {
      field: 'status',
      headerName: 'Moderación',
      width: 130,
      renderCell: (params) => <ModerationStatusChip status={params.row.status} />,
    },
    {
      field: 'branches_listed_count',
      headerName: 'Sucursales',
      width: 100,
      type: 'number',
    },
    {
      field: 'org_status',
      headerName: 'Estado en mi org.',
      width: 150,
      renderCell: (params) => <OrgStatusChip status={params.row.org_status} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: canManage ? 260 : 130,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<IconEye size={16} />}
            onClick={() => navigate(`/catalog/products/${params.row.id}`)}
          >
            Ver detalle
          </Button>
          {canManage && (
            <Button
              size="small"
              startIcon={<IconPlus size={16} />}
              onClick={() => {
                setFormError(null);
                setAddDialogProduct(params.row);
              }}
            >
              Agregar
            </Button>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Catálogo
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
        <TextField
          label="Nombre"
          size="small"
          value={filters.name ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value || undefined }))}
        />
        <TextField
          label="Barcode"
          size="small"
          value={filters.barcode ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, barcode: e.target.value || undefined }))}
        />
        <TextField
          label="Marca"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.brand_id ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, brand_id: e.target.value ? Number(e.target.value) : undefined }))
          }
        >
          <MenuItem value="">Todas</MenuItem>
          {(brandsQuery.data ?? []).map((brand) => (
            <MenuItem key={brand.id} value={brand.id}>
              {brand.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Categoría"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.category_id ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, category_id: e.target.value ? Number(e.target.value) : undefined }))
          }
        >
          <MenuItem value="">Todas</MenuItem>
          {(categoriesQuery.data ?? []).map((category) => (
            <MenuItem key={category.id} value={category.id}>
              {category.name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Estado"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.status ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, status: (e.target.value || undefined) as ModerationStatus | undefined }))
          }
        >
          <MenuItem value="">Todos</MenuItem>
          {MODERATION_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {status}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {productsQuery.isError && <Alert severity="error">No se pudo cargar el catálogo.</Alert>}

      <Box sx={{ backgroundColor: 'background.paper' }}>
        <DataGrid
          rows={productsQuery.data ?? []}
          columns={columns}
          loading={productsQuery.isLoading}
          autoHeight
          disableRowSelectionOnClick
          hideFooter={(productsQuery.data?.length ?? 0) <= 25}
        />
      </Box>

      <AddToBranchDialog
        open={addDialogProduct !== null}
        branches={availableBranches}
        onClose={() => setAddDialogProduct(null)}
        onSubmit={handleAddSubmit}
        isSubmitting={createListings.isPending}
        error={formError}
      />
    </Box>
  );
}
