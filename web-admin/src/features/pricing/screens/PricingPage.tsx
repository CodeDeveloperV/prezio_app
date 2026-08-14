import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { IconClockHour4, IconEdit } from '@tabler/icons-react';
import { useState } from 'react';

import { useBranches } from '@/features/organizations/hooks/useBranches';
import { useActiveMembership } from '@/shared/store/authStore';
import { useCategories } from '@/features/catalog/hooks/useCatalogLookups';
import { AvailabilityChip } from '../components/AvailabilityChip';
import { BatchAvailabilityDialog } from '../components/BatchAvailabilityDialog';
import { EditPricingDialog } from '../components/EditPricingDialog';
import { PriceHistoryDialog } from '../components/PriceHistoryDialog';
import { PriceSourceChip } from '../components/PriceSourceChip';
import { usePricing } from '../hooks/usePricing';
import { usePricingRealtime } from '../hooks/usePricingRealtime';

import type { PricingFilters } from '../api/pricingApi';
import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid';
import type { Availability, PricingListItemRead } from '@prezio/shared-types';

const AVAILABILITY_FILTER_OPTIONS: { value: Availability; label: string }[] = [
  { value: 'in_stock', label: 'En stock' },
  { value: 'out_of_stock', label: 'Agotado' },
  { value: 'unknown', label: 'Desconocido' },
];

const STALE_THRESHOLD_DAYS = 7;

const EMPTY_SELECTION: GridRowSelectionModel = { type: 'include', ids: new Set() };

export function PricingPage() {
  const activeMembership = useActiveMembership();
  const storeId = activeMembership?.organization.id ?? null;

  const [filters, setFilters] = useState<PricingFilters>({});
  const [staleOnly, setStaleOnly] = useState(false);
  const pricingQuery = usePricing(storeId, {
    ...filters,
    stale_before: staleOnly
      ? new Date(Date.now() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  });
  const branchesQuery = useBranches(storeId);
  const categoriesQuery = useCategories();

  const [editItem, setEditItem] = useState<PricingListItemRead | null>(null);
  const [historyItem, setHistoryItem] = useState<PricingListItemRead | null>(null);
  const [selectionModel, setSelectionModel] = useState<GridRowSelectionModel>(EMPTY_SELECTION);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  const rows = pricingQuery.data ?? [];

  usePricingRealtime(
    storeId,
    rows.map((row) => row.store_product_id),
  );

  const selectedItems =
    selectionModel.type === 'include'
      ? rows.filter((row) => selectionModel.ids.has(row.store_product_id))
      : rows.filter((row) => !selectionModel.ids.has(row.store_product_id));

  const columns: GridColDef<PricingListItemRead>[] = [
    { field: 'canonical_name', headerName: 'Nombre', flex: 1.2 },
    { field: 'barcode', headerName: 'Barcode', flex: 0.8, valueGetter: (_, row) => row.barcode ?? '—' },
    { field: 'branch_name', headerName: 'Sucursal', flex: 0.8 },
    { field: 'category_name', headerName: 'Categoría', flex: 0.8, valueGetter: (_, row) => row.category_name ?? '—' },
    {
      field: 'current_price',
      headerName: 'Precio',
      flex: 0.6,
      valueGetter: (_, row) => `${row.currency} ${row.current_price}`,
    },
    {
      field: 'availability',
      headerName: 'Disponibilidad',
      width: 150,
      renderCell: (params) => <AvailabilityChip availability={params.row.availability} />,
    },
    {
      field: 'last_verified_at',
      headerName: 'Última verificación',
      flex: 0.9,
      valueGetter: (_, row) => (row.last_verified_at ? new Date(row.last_verified_at).toLocaleString() : 'Nunca'),
    },
    {
      field: 'last_update_source',
      headerName: 'Origen',
      width: 140,
      renderCell: (params) => <PriceSourceChip source={params.row.last_update_source} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: 200,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<IconEdit size={16} />} onClick={() => setEditItem(params.row)}>
            Editar
          </Button>
          <Button size="small" startIcon={<IconClockHour4 size={16} />} onClick={() => setHistoryItem(params.row)}>
            Historial
          </Button>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Precios
      </Typography>

      <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
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
          label="Sucursal"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.branch_id ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value ? Number(e.target.value) : undefined }))}
        >
          <MenuItem value="">Todas</MenuItem>
          {(branchesQuery.data ?? []).map((branch) => (
            <MenuItem key={branch.id} value={branch.id}>
              {branch.name}
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
          label="Disponibilidad"
          size="small"
          select
          sx={{ minWidth: 160 }}
          value={filters.availability ?? ''}
          onChange={(e) =>
            setFilters((f) => ({ ...f, availability: (e.target.value || undefined) as Availability | undefined }))
          }
        >
          <MenuItem value="">Todas</MenuItem>
          {AVAILABILITY_FILTER_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel
          control={<Checkbox checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />}
          label={`Solo desactualizados (+${STALE_THRESHOLD_DAYS} días)`}
        />
      </Stack>

      {selectedItems.length > 0 && (
        <Stack direction="row" spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <Typography variant="body2">{selectedItems.length} seleccionados</Typography>
          <Button size="small" variant="outlined" onClick={() => setBatchDialogOpen(true)}>
            Actualizar disponibilidad en lote
          </Button>
        </Stack>
      )}

      {pricingQuery.isError && <Alert severity="error">No se pudo cargar la lista de precios.</Alert>}

      <Box sx={{ backgroundColor: 'background.paper' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.store_product_id}
          loading={pricingQuery.isLoading}
          autoHeight
          checkboxSelection
          disableRowSelectionOnClick
          rowSelectionModel={selectionModel}
          onRowSelectionModelChange={setSelectionModel}
          hideFooter={rows.length <= 25}
        />
      </Box>

      <EditPricingDialog storeId={storeId} item={editItem} onClose={() => setEditItem(null)} />
      <PriceHistoryDialog storeId={storeId} item={historyItem} onClose={() => setHistoryItem(null)} />
      <BatchAvailabilityDialog
        storeId={storeId}
        items={selectedItems}
        open={batchDialogOpen}
        onClose={() => {
          setBatchDialogOpen(false);
          setSelectionModel(EMPTY_SELECTION);
        }}
      />
    </Box>
  );
}
