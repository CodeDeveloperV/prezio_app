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
  Divider,
  FormControlLabel,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getCatalogProduct } from '@/features/catalog/api/catalogApi';
import { useCatalogProducts } from '@/features/catalog/hooks/useCatalogProducts';
import { COUPON_TYPE_LABELS, COUPON_TYPE_OPTIONS } from '../constants';

import type { CatalogProductSummary, CouponCreate, CouponRead, CouponType, StoreBranch } from '@prezio/shared-types';

interface ProductOption {
  id: number;
  canonical_name: string;
}

interface CouponFormDialogProps {
  open: boolean;
  storeId: number | null;
  /** null = creating a new coupon; otherwise editing this existing DRAFT one. */
  coupon: CouponRead | null;
  /** True while `coupon`'s detail is still being fetched for an edit (list rows don't carry
   * every field the form needs) -- the form renders a loading state instead of stale/empty
   * fields until this resolves. */
  loadingDetail?: boolean;
  branches: StoreBranch[];
  onClose: () => void;
  onSubmit: (values: CouponCreate) => void;
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

export function CouponFormDialog({
  open,
  storeId,
  coupon,
  loadingDetail = false,
  branches,
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: CouponFormDialogProps) {
  const isEditing = coupon !== null || loadingDetail;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<CouponType>('percentage_discount');
  const [percentageValue, setPercentageValue] = useState('');
  const [fixedAmountValue, setFixedAmountValue] = useState('');
  const [maximumDiscountAmount, setMaximumDiscountAmount] = useState('');
  const [appliesToEntirePurchase, setAppliesToEntirePurchase] = useState(true);
  const [appliesToAllBranches, setAppliesToAllBranches] = useState(true);
  const [minimumPurchaseAmount, setMinimumPurchaseAmount] = useState('');
  const [maxRedemptionsTotal, setMaxRedemptionsTotal] = useState('');
  const [maxRedemptionsPerUser, setMaxRedemptionsPerUser] = useState('');
  const [isStackable, setIsStackable] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [branchIds, setBranchIds] = useState<number[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<ProductOption[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const existingProductQueries = useQueries({
    queries: (coupon?.product_ids ?? []).map((productId) => ({
      queryKey: ['b2b', 'organizations', storeId, 'catalog', 'products', productId],
      queryFn: () => getCatalogProduct(storeId as number, productId),
      enabled: storeId !== null && open,
    })),
  });

  useEffect(() => {
    if (!open) return;
    if (coupon) {
      setName(coupon.name);
      setDescription(coupon.description ?? '');
      setCode(coupon.code);
      setType(coupon.type);
      setPercentageValue(coupon.percentage_value ?? '');
      setFixedAmountValue(coupon.fixed_amount_value ?? '');
      setMaximumDiscountAmount(coupon.maximum_discount_amount ?? '');
      setAppliesToEntirePurchase(coupon.applies_to_entire_purchase);
      setAppliesToAllBranches(coupon.applies_to_all_branches);
      setMinimumPurchaseAmount(coupon.minimum_purchase_amount ?? '');
      setMaxRedemptionsTotal(coupon.max_redemptions_total !== null ? String(coupon.max_redemptions_total) : '');
      setMaxRedemptionsPerUser(coupon.max_redemptions_per_user !== null ? String(coupon.max_redemptions_per_user) : '');
      setIsStackable(coupon.is_stackable);
      setStartAt(toDatetimeLocal(coupon.start_at));
      setEndAt(toDatetimeLocal(coupon.end_at));
      setBranchIds(coupon.branch_ids);
    } else {
      setName('');
      setDescription('');
      setCode('');
      setType('percentage_discount');
      setPercentageValue('');
      setFixedAmountValue('');
      setMaximumDiscountAmount('');
      setAppliesToEntirePurchase(true);
      setAppliesToAllBranches(true);
      setMinimumPurchaseAmount('');
      setMaxRedemptionsTotal('');
      setMaxRedemptionsPerUser('');
      setIsStackable(false);
      setStartAt('');
      setEndAt('');
      setBranchIds([]);
      setSelectedProducts([]);
    }
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon, open]);

  useEffect(() => {
    if (!coupon) return;
    const loaded = existingProductQueries
      .filter((q) => q.data)
      .map((q) => ({ id: q.data!.id, canonical_name: q.data!.canonical_name }));
    if (loaded.length === coupon.product_ids.length && loaded.length > 0) {
      setSelectedProducts(loaded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coupon, existingProductQueries.map((q) => q.dataUpdatedAt).join(',')]);

  const productSearchQuery = useCatalogProducts(storeId, { name: productSearch || undefined });
  const productOptions: ProductOption[] = (productSearchQuery.data ?? []).map((p: CatalogProductSummary) => ({
    id: p.id,
    canonical_name: p.canonical_name,
  }));

  const handleTypeChange = (newType: CouponType) => {
    setType(newType);
    setPercentageValue('');
    setFixedAmountValue('');
    setMaximumDiscountAmount('');
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'El nombre es obligatorio';
    if (!code.trim()) errors.code = 'El código es obligatorio';

    if (type === 'percentage_discount') {
      const v = Number(percentageValue);
      if (!percentageValue || Number.isNaN(v) || v <= 0 || v > 100) {
        errors.percentageValue = 'Debe ser mayor a 0 y como máximo 100';
      }
      if (maximumDiscountAmount !== '') {
        const cap = Number(maximumDiscountAmount);
        if (Number.isNaN(cap) || cap < 0) errors.maximumDiscountAmount = 'Debe ser cero o mayor';
      }
    } else if (type === 'fixed_amount') {
      const v = Number(fixedAmountValue);
      if (!fixedAmountValue || Number.isNaN(v) || v <= 0) {
        errors.fixedAmountValue = 'Debe ser mayor a 0';
      }
    }

    if (minimumPurchaseAmount !== '') {
      const v = Number(minimumPurchaseAmount);
      if (Number.isNaN(v) || v < 0) errors.minimumPurchaseAmount = 'Debe ser cero o mayor';
    }
    if (maxRedemptionsTotal !== '') {
      const v = Number(maxRedemptionsTotal);
      if (!Number.isInteger(v) || v <= 0) errors.maxRedemptionsTotal = 'Debe ser un entero mayor a 0';
    }
    if (maxRedemptionsPerUser !== '') {
      const v = Number(maxRedemptionsPerUser);
      if (!Number.isInteger(v) || v <= 0) errors.maxRedemptionsPerUser = 'Debe ser un entero mayor a 0';
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

    return errors;
  };

  const handleSubmit = () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const payload: CouponCreate = {
      name: name.trim(),
      description: description.trim() || null,
      code: code.trim(),
      type,
      percentage_value: type === 'percentage_discount' ? percentageValue : null,
      fixed_amount_value: type === 'fixed_amount' ? fixedAmountValue : null,
      maximum_discount_amount: type === 'percentage_discount' && maximumDiscountAmount !== '' ? maximumDiscountAmount : null,
      applies_to_entire_purchase: appliesToEntirePurchase,
      applies_to_all_branches: appliesToAllBranches,
      minimum_purchase_amount: minimumPurchaseAmount !== '' ? minimumPurchaseAmount : null,
      max_redemptions_total: maxRedemptionsTotal !== '' ? Number(maxRedemptionsTotal) : null,
      max_redemptions_per_user: maxRedemptionsPerUser !== '' ? Number(maxRedemptionsPerUser) : null,
      is_stackable: isStackable,
      start_at: fromDatetimeLocal(startAt) as string,
      end_at: fromDatetimeLocal(endAt) as string,
      branch_ids: appliesToAllBranches ? [] : branchIds,
      product_ids: appliesToEntirePurchase ? [] : selectedProducts.map((p) => p.id),
    };
    onSubmit(payload);
  };

  if (loadingDetail) {
    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle>Editar cupón</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEditing ? 'Editar cupón' : 'Nuevo cupón'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <Typography variant="overline" color="text.secondary">
            General
          </Typography>
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
            label="Código"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={!!fieldErrors.code}
            helperText={fieldErrors.code ?? 'El cliente lo presenta o ingresa para usar el cupón'}
            fullWidth
          />

          <Divider />
          <Typography variant="overline" color="text.secondary">
            Beneficio
          </Typography>
          <TextField
            label="Tipo de cupón"
            select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as CouponType)}
            fullWidth
          >
            {COUPON_TYPE_OPTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {COUPON_TYPE_LABELS[option]}
              </MenuItem>
            ))}
          </TextField>

          {type === 'percentage_discount' && (
            <Stack direction="row" spacing={2}>
              <TextField
                label="Porcentaje de descuento (%)"
                value={percentageValue}
                onChange={(e) => setPercentageValue(e.target.value)}
                error={!!fieldErrors.percentageValue}
                helperText={fieldErrors.percentageValue}
                fullWidth
              />
              <TextField
                label="Tope de descuento (opcional)"
                value={maximumDiscountAmount}
                onChange={(e) => setMaximumDiscountAmount(e.target.value)}
                error={!!fieldErrors.maximumDiscountAmount}
                helperText={fieldErrors.maximumDiscountAmount}
                fullWidth
              />
            </Stack>
          )}

          {type === 'fixed_amount' && (
            <TextField
              label="Monto de descuento"
              value={fixedAmountValue}
              onChange={(e) => setFixedAmountValue(e.target.value)}
              error={!!fieldErrors.fixedAmountValue}
              helperText={fieldErrors.fixedAmountValue}
              fullWidth
            />
          )}

          <Divider />
          <Typography variant="overline" color="text.secondary">
            Aplica a
          </Typography>
          <FormControlLabel
            control={
              <Switch checked={appliesToEntirePurchase} onChange={(e) => setAppliesToEntirePurchase(e.target.checked)} />
            }
            label="Aplica a toda la compra"
          />
          {!appliesToEntirePurchase && (
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
          )}

          <Divider />
          <Typography variant="overline" color="text.secondary">
            Sucursales
          </Typography>
          <FormControlLabel
            control={<Switch checked={appliesToAllBranches} onChange={(e) => setAppliesToAllBranches(e.target.checked)} />}
            label="Aplica a todas las sucursales"
          />
          {!appliesToAllBranches && (
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
          )}

          <Divider />
          <Typography variant="overline" color="text.secondary">
            Condiciones
          </Typography>
          <TextField
            label="Compra mínima (opcional)"
            value={minimumPurchaseAmount}
            onChange={(e) => setMinimumPurchaseAmount(e.target.value)}
            error={!!fieldErrors.minimumPurchaseAmount}
            helperText={fieldErrors.minimumPurchaseAmount}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Máx. usos totales (opcional)"
              value={maxRedemptionsTotal}
              onChange={(e) => setMaxRedemptionsTotal(e.target.value)}
              error={!!fieldErrors.maxRedemptionsTotal}
              helperText={fieldErrors.maxRedemptionsTotal}
              fullWidth
            />
            <TextField
              label="Máx. usos por cliente (opcional)"
              value={maxRedemptionsPerUser}
              onChange={(e) => setMaxRedemptionsPerUser(e.target.value)}
              error={!!fieldErrors.maxRedemptionsPerUser}
              helperText={fieldErrors.maxRedemptionsPerUser}
              fullWidth
            />
          </Stack>
          <FormControlLabel
            control={<Switch checked={isStackable} onChange={(e) => setIsStackable(e.target.checked)} />}
            label="Combinable con otras promociones o cupones"
          />

          <Divider />
          <Typography variant="overline" color="text.secondary">
            Vigencia
          </Typography>
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

          <Typography variant="caption" color="text.secondary">
            Publicar requiere al menos una sucursal (si no aplica a todas) y al menos un producto (si no aplica a toda
            la compra).
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
