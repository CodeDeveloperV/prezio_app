import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getCatalogProduct } from '@/features/catalog/api/catalogApi';
import { useCatalogProducts } from '@/features/catalog/hooks/useCatalogProducts';
import { PROMOTION_TYPE_LABELS, PROMOTION_TYPE_OPTIONS } from '../constants';

import type { CatalogProductSummary, PromotionCreate, PromotionRead, PromotionType, StoreBranch } from '@prezio/shared-types';

interface ProductOption {
  id: number;
  canonical_name: string;
}

interface PromotionFormDialogProps {
  open: boolean;
  storeId: number | null;
  /** null = creating a new promotion; otherwise editing this existing DRAFT one. */
  promotion: PromotionRead | null;
  /** True while `promotion`'s detail is still being fetched for an edit (list rows don't carry
   * every field the form needs) -- the form renders a loading state instead of stale/empty
   * fields until this resolves. */
  loadingDetail?: boolean;
  branches: StoreBranch[];
  onClose: () => void;
  onSubmit: (values: PromotionCreate) => void;
  isSubmitting: boolean;
  error: string | null;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function PromotionFormDialog({
  open,
  storeId,
  promotion,
  loadingDetail = false,
  branches,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: PromotionFormDialogProps) {
  const isEditing = promotion !== null || loadingDetail;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<PromotionType>('percentage_discount');
  const [percentageValue, setPercentageValue] = useState('');
  const [fixedDiscountValue, setFixedDiscountValue] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [buyQuantity, setBuyQuantity] = useState('');
  const [payQuantity, setPayQuantity] = useState('');
  const [priority, setPriority] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [branchIds, setBranchIds] = useState<number[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const existingProductQueries = useQueries({
    queries: (promotion?.product_ids ?? []).map((productId) => ({
      queryKey: ['b2b', 'organizations', storeId, 'catalog', 'products', productId],
      queryFn: () => getCatalogProduct(storeId as number, productId),
      enabled: storeId !== null && open,
    })),
  });

  useEffect(() => {
    if (!open) return;
    if (promotion) {
      setName(promotion.name);
      setDescription(promotion.description ?? '');
      setType(promotion.type);
      setPercentageValue(promotion.percentage_value ?? '');
      setFixedDiscountValue(promotion.fixed_discount_value ?? '');
      setSpecialPrice(promotion.special_price ?? '');
      setBuyQuantity(promotion.buy_quantity !== null ? String(promotion.buy_quantity) : '');
      setPayQuantity(promotion.pay_quantity !== null ? String(promotion.pay_quantity) : '');
      setPriority(String(promotion.priority));
      setStartAt(toDatetimeLocal(promotion.start_at));
      setEndAt(toDatetimeLocal(promotion.end_at));
      setBranchIds(promotion.branch_ids);
    } else {
      setName('');
      setDescription('');
      setType('percentage_discount');
      setPercentageValue('');
      setFixedDiscountValue('');
      setSpecialPrice('');
      setBuyQuantity('');
      setPayQuantity('');
      setPriority('');
      setStartAt('');
      setEndAt('');
      setBranchIds([]);
      setSelectedProducts([]);
    }
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotion, open]);

  useEffect(() => {
    if (!promotion) return;
    const loaded = existingProductQueries
      .filter((q) => q.data)
      .map((q) => ({ id: q.data!.id, canonical_name: q.data!.canonical_name }));
    if (loaded.length === promotion.product_ids.length && loaded.length > 0) {
      setSelectedProducts(loaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotion, existingProductQueries.map((q) => q.dataUpdatedAt).join(',')]);

  const productSearchQuery = useCatalogProducts(storeId, { name: productSearch || undefined });
  const productOptions: ProductOption[] = (productSearchQuery.data ?? []).map((p: CatalogProductSummary) => ({
    id: p.id,
    canonical_name: p.canonical_name,
  }));

  const handleTypeChange = (newType: PromotionType) => {
    setType(newType);
    setPercentageValue('');
    setFixedDiscountValue('');
    setSpecialPrice('');
    setBuyQuantity('');
    setPayQuantity('');
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'El nombre es obligatorio';

    if (type === 'percentage_discount') {
      const v = Number(percentageValue);
      if (!percentageValue || Number.isNaN(v) || v <= 0 || v > 100) {
        errors.percentageValue = 'Debe ser mayor a 0 y como máximo 100';
      }
    } else if (type === 'fixed_discount') {
      const v = Number(fixedDiscountValue);
      if (!fixedDiscountValue || Number.isNaN(v) || v <= 0) {
        errors.fixedDiscountValue = 'Debe ser mayor a 0';
      }
    } else if (type === 'special_price') {
      const v = Number(specialPrice);
      if (specialPrice === '' || Number.isNaN(v) || v < 0) {
        errors.specialPrice = 'Debe ser cero o mayor';
      }
    } else if (type === 'buy_x_get_y') {
      const buy = Number(buyQuantity);
      const pay = Number(payQuantity);
      if (!buyQuantity || !Number.isInteger(buy) || !payQuantity || !Number.isInteger(pay) || pay < 1) {
        errors.payQuantity = 'La cantidad a pagar debe ser al menos 1';
      } else if (buy <= pay) {
        errors.buyQuantity = 'La cantidad a llevar debe ser mayor a la cantidad a pagar';
      }
    }

    if (!startAt) errors.startAt = 'La fecha de inicio es obligatoria';
    if (!endAt) errors.endAt = 'La fecha de fin es obligatoria';
    if (startAt && endAt) {
      const start = fromDatetimeLocal(startAt);
      const end = fromDatetimeLocal(endAt);
      if (start && end && start >= end) {
        errors.endAt = 'La fecha de fin debe ser posterior a la de inicio';
      }
    }

    if (priority && (!Number.isInteger(Number(priority)) || Number(priority) < 0)) {
      errors.priority = 'Debe ser un número entero positivo';
    }

    return errors;
  };

  const handleSubmit = () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: PromotionCreate = {
      name: name.trim(),
      description: description.trim() || null,
      type,
      priority: priority ? Number(priority) : null,
      percentage_value: type === 'percentage_discount' ? percentageValue : null,
      fixed_discount_value: type === 'fixed_discount' ? fixedDiscountValue : null,
      special_price: type === 'special_price' ? specialPrice : null,
      buy_quantity: type === 'buy_x_get_y' ? Number(buyQuantity) : null,
      pay_quantity: type === 'buy_x_get_y' ? Number(payQuantity) : null,
      start_at: fromDatetimeLocal(startAt) as string,
      end_at: fromDatetimeLocal(endAt) as string,
      branch_ids: branchIds,
      product_ids: selectedProducts.map((p) => p.id),
    };
    onSubmit(payload);
  };

  if (loadingDetail) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Editar promoción</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancelar</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEditing ? 'Editar promoción' : 'Nueva promoción'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={!!fieldErrors.name}
            helperText={fieldErrors.name}
            fullWidth
            autoFocus
          />

          <TextField
            label="Descripción"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          <TextField
            label="Tipo de promoción"
            select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as PromotionType)}
            fullWidth
          >
            {PROMOTION_TYPE_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {PROMOTION_TYPE_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>

          {type === 'percentage_discount' && (
            <TextField
              label="Porcentaje de descuento (%)"
              value={percentageValue}
              onChange={(e) => setPercentageValue(e.target.value)}
              error={!!fieldErrors.percentageValue}
              helperText={fieldErrors.percentageValue}
              fullWidth
            />
          )}

          {type === 'fixed_discount' && (
            <TextField
              label="Monto de descuento fijo"
              value={fixedDiscountValue}
              onChange={(e) => setFixedDiscountValue(e.target.value)}
              error={!!fieldErrors.fixedDiscountValue}
              helperText={fieldErrors.fixedDiscountValue}
              fullWidth
            />
          )}

          {type === 'special_price' && (
            <TextField
              label="Precio especial"
              value={specialPrice}
              onChange={(e) => setSpecialPrice(e.target.value)}
              error={!!fieldErrors.specialPrice}
              helperText={fieldErrors.specialPrice}
              fullWidth
            />
          )}

          {type === 'buy_x_get_y' && (
            <Stack direction="row" spacing={2}>
              <TextField
                label="Cantidad a llevar"
                value={buyQuantity}
                onChange={(e) => setBuyQuantity(e.target.value)}
                error={!!fieldErrors.buyQuantity}
                helperText={fieldErrors.buyQuantity}
                fullWidth
              />
              <TextField
                label="Cantidad a pagar"
                value={payQuantity}
                onChange={(e) => setPayQuantity(e.target.value)}
                error={!!fieldErrors.payQuantity}
                helperText={fieldErrors.payQuantity}
                fullWidth
              />
            </Stack>
          )}

          <TextField
            label="Prioridad (opcional)"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            error={!!fieldErrors.priority}
            helperText={fieldErrors.priority ?? 'Menor número = mayor prioridad si hay solapamiento'}
            fullWidth
          />

          <Stack direction="row" spacing={2}>
            <TextField
              label="Inicio"
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              error={!!fieldErrors.startAt}
              helperText={fieldErrors.startAt}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Fin"
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              error={!!fieldErrors.endAt}
              helperText={fieldErrors.endAt}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>

          <Select
            multiple
            displayEmpty
            fullWidth
            value={branchIds}
            onChange={(e) => setBranchIds(e.target.value as number[])}
            renderValue={(selected) =>
              (selected as number[]).length === 0
                ? 'Sin sucursales seleccionadas'
                : branches
                    .filter((b) => (selected as number[]).includes(b.id))
                    .map((b) => b.name)
                    .join(', ')
            }
          >
            {branches.map((branch) => (
              <MenuItem key={branch.id} value={branch.id}>
                <Checkbox checked={branchIds.includes(branch.id)} />
                <ListItemText primary={branch.name} />
              </MenuItem>
            ))}
          </Select>

          <Autocomplete
            multiple
            options={productOptions}
            value={selectedProducts}
            filterOptions={(x) => x}
            getOptionLabel={(option) => option.canonical_name}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_, value) => setSelectedProducts(value)}
            onInputChange={(_, value) => setProductSearch(value)}
            loading={productSearchQuery.isLoading}
            renderInput={(params) => <TextField {...params} label="Productos" placeholder="Buscar producto…" />}
          />

          <Typography variant="caption" color="text.secondary">
            Publicar requiere al menos un producto y una sucursal, todos con precio activo en cada sucursal
            seleccionada.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting}>
          {isEditing ? 'Guardar' : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
