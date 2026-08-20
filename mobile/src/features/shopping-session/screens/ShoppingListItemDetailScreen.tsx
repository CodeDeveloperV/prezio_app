import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import type { StoreProductRead } from '@prezio/shared-types';

import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { colorTokens } from '../../../app/theme/tokens';
import { DEFAULT_ICON_STROKE_WIDTH, IconAlertTriangle, IconCheck, IconEdit, IconHistory, IconMinus, IconPlus, IconShoppingCart, IconTrash } from '../../../app/theme/icons';
import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { wsClient } from '../../../shared/services/ws/wsClient';
import { httpClient } from '../../../shared/services/api/httpClient';
import { useConfirmMatchMutation, useCreateStoreProductPriceMutation, useUpdatePriceMutation } from '../../pricing/hooks/usePricingMutations';
import { captureShoppingListItemPrice, deleteShoppingListItem, getShoppingListSummary, updateShoppingListItem } from '../../shopping-lists/api/shoppingListsApi';
import { FlowHeader } from '../components/FlowHeader';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ShoppingListItemDetail'>;
type CorrectionKind = 'WRONG_PRODUCT' | 'WRONG_NAME' | 'WRONG_PRESENTATION' | 'WRONG_BRAND' | 'WRONG_IMAGE';

const styles = StyleSheet.create({ image: { width: 82, height: 82, borderRadius: 16 } });
const money = (value: string | number | null) => `B/. ${Number(value ?? 0).toFixed(2)}`;
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString('es-PA', { dateStyle: 'medium', timeStyle: 'short' }) : null;

function PriceInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <XStack minHeight={56} borderWidth={1} borderColor="$borderColor" borderRadius="$4" alignItems="center" paddingHorizontal="$3" gap="$2">
    <Text fontFamily="$heading" fontSize="$lg">B/.</Text>
    <Input flex={1} unstyled keyboardType="decimal-pad" value={value} onChangeText={onChange} accessibilityLabel="Nuevo precio en balboas" fontFamily="$heading" fontSize="$xl" textAlign="right" />
  </XStack>;
}

function QuantityControl({ quantity, disabled, onChange }: { quantity: number; disabled: boolean; onChange: (next: number) => void }) {
  return <XStack alignItems="center" justifyContent="space-between" paddingHorizontal="$2" minHeight={68}>
    <Button circular size="$5" backgroundColor="rgba(34, 197, 94, 0.10)" disabled={disabled || quantity <= 1} onPress={() => onChange(quantity - 1)} accessibilityLabel="Disminuir cantidad">
      <IconMinus color={colorTokens.primary} size={21} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
    </Button>
    <Text fontFamily="$heading" fontSize="$xxl">{quantity}</Text>
    <Button circular size="$5" backgroundColor="rgba(34, 197, 94, 0.10)" disabled={disabled} onPress={() => onChange(quantity + 1)} accessibilityLabel="Aumentar cantidad">
      <IconPlus color={colorTokens.primary} size={21} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
    </Button>
  </XStack>;
}

export function ShoppingListItemDetailScreen({ route, navigation }: Props) {
  const { shoppingListId, itemId } = route.params;
  const client = useQueryClient();
  const summaryKey = useMemo(() => ['shoppingLists', shoppingListId, 'summary'] as const, [shoppingListId]);
  const summaryQuery = useQuery({ queryKey: summaryKey, queryFn: () => getShoppingListSummary(shoppingListId) });
  const item = summaryQuery.data?.items.find((candidate) => candidate.shopping_list_item_id === itemId);
  const [draftQuantity, setDraftQuantity] = useState<number | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [editingPrice, setEditingPrice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const confirm = useConfirmMatchMutation();
  const createPrice = useCreateStoreProductPriceMutation();
  const updatePrice = useUpdatePriceMutation();
  const quantityMutation = useMutation({ mutationFn: (quantity: number) => updateShoppingListItem(shoppingListId, itemId, { version: item!.version, quantity }) });
  const captureMutation = useMutation({ mutationFn: (storeProduct: StoreProductRead) => captureShoppingListItemPrice(shoppingListId, itemId, { version: item!.version, store_product_id: storeProduct.id, store_product_version: storeProduct.version }) });
  const removeMutation = useMutation({ mutationFn: () => deleteShoppingListItem(shoppingListId, itemId) });
  const reportMutation = useMutation({ mutationFn: (kind: CorrectionKind) => httpClient.post('reports', { json: { type: kind === 'WRONG_PRODUCT' ? 'incorrect_barcode' : 'incorrect_product_info', product_id: item!.product_id, barcode_id: item!.barcode_id, correction_kind: kind.toLowerCase() } }).json<{ id: number }>() });

  useEffect(() => { setDraftQuantity(null); }, [item?.quantity]);
  useEffect(() => {
    if (!item?.store_product_id) return undefined;
    return wsClient.subscribe(item.store_product_id, () => {
      // StoreProduct changed; the server-side summary preserves the captured price.
      client.invalidateQueries({ queryKey: summaryKey });
      if (editingPrice) setMessage('El precio fue actualizado por otro comprador. Revisa el precio más reciente antes de guardar.');
    });
  }, [client, editingPrice, item?.store_product_id, summaryKey]);

  const invalidate = () => client.invalidateQueries({ queryKey: summaryKey });
  const capture = async (storeProduct: StoreProductRead) => { await captureMutation.mutateAsync(storeProduct); await invalidate(); };
  const changeQuantity = async (quantity: number) => {
    if (!item || quantity < 1) return;
    setDraftQuantity(quantity);
    try { await quantityMutation.mutateAsync(quantity); await invalidate(); } catch { setDraftQuantity(null); setMessage('No pudimos actualizar la cantidad. Intenta nuevamente.'); }
  };
  const confirmPrice = async () => {
    if (!item?.store_product_id) return;
    try {
      const storeProduct = await confirm.mutateAsync(item.store_product_id);
      if (item.captured_unit_price !== String(storeProduct.current_price)) await capture(storeProduct);
      setMessage('Precio confirmado. Gracias por ayudar a mantener Prezio actualizado.');
      await invalidate();
    } catch { setMessage('No pudimos confirmar el precio. Intenta nuevamente.'); }
  };
  const savePrice = async () => {
    if (!item || !Number(priceInput) || !summaryQuery.data?.active_store_branch_id) { setMessage('Ingresa un precio mayor que 0.'); return; }
    try {
      const listing = item.store_product_id
        ? await updatePrice.mutateAsync({ storeProductId: item.store_product_id, request: { price: Number(priceInput), version: item.store_product_version! } })
        : await createPrice.mutateAsync({ product_id: item.product_id, store_branch_id: summaryQuery.data.active_store_branch_id, current_price: Number(priceInput) });
      await capture(listing);
      setEditingPrice(false); setMessage('Precio actualizado para tu compra.'); await invalidate();
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 409) { await invalidate(); setMessage('El precio cambió mientras estabas actualizando. Mostramos el precio más reciente.'); return; }
      setMessage('No pudimos actualizar el precio. Intenta nuevamente.');
    }
  };
  const sendReport = async (kind: CorrectionKind) => {
    if (!item?.barcode_id) { setMessage('Este producto no tiene un código disponible para reportar.'); return; }
    try { await reportMutation.mutateAsync(kind); setReporting(false); setMessage('Sugerencia enviada. Gracias por ayudar a mejorar Prezio.'); } catch { setMessage('No pudimos enviar la sugerencia. Intenta nuevamente.'); }
  };
  const remove = () => Alert.alert('¿Eliminar este producto de tu compra?', `${item?.name ?? 'Este producto'} se quitará de la lista.`, [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: async () => { try { await removeMutation.mutateAsync(); await invalidate(); navigation.goBack(); } catch { setMessage('No pudimos eliminar el producto. Intenta nuevamente.'); } } }]);

  if (summaryQuery.isPending) return <YStack flex={1} alignItems="center" justifyContent="center" backgroundColor="$background"><ActivityIndicator color={colorTokens.primary} /></YStack>;
  if (!item) return <ScreenContainer><FlowHeader title="Detalle del producto" onBack={() => navigation.goBack()} /><Text>No pudimos encontrar este producto en tu compra.</Text></ScreenContainer>;
  const quantity = draftQuantity ?? item.quantity;
  const captured = item.captured_unit_price;
  const current = item.current_price;
  const subtotal = captured ? Number(captured) * quantity : null;
  const busy = quantityMutation.isPending || captureMutation.isPending;

  return <ScreenContainer>
    <FlowHeader title="Detalle del producto" onBack={() => navigation.goBack()} />
    <XStack gap="$3" alignItems="center">
      {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="contain" /> : <YStack width={82} height={82} borderRadius="$4" backgroundColor="$surface" alignItems="center" justifyContent="center"><IconShoppingCart color={colorTokens.textSecondary} size={30} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} /></YStack>}
      <YStack flex={1} gap="$1"><Text fontFamily="$heading" fontSize="$lg">{item.name}</Text><Text color="$colorSecondary">{[item.brand, item.presentation].filter(Boolean).join(' · ')}</Text>{item.barcode ? <Text fontSize="$xs" color="$colorSecondary">Código: {item.barcode}</Text> : null}</YStack>
    </XStack>
    {message ? <Card backgroundColor="rgba(34,197,94,0.08)" borderRadius="$4" padding="$3"><Text color="$colorSecondary">{message}</Text></Card> : null}
    {reporting ? <YStack gap="$3"><Text fontFamily="$heading" fontSize="$lg">¿Qué está incorrecto?</Text>{([['WRONG_PRODUCT','El código pertenece a otro producto'], ['WRONG_NAME','Nombre o información incorrecta'], ['WRONG_PRESENTATION','Presentación incorrecta'], ['WRONG_BRAND','Marca incorrecta'], ['WRONG_IMAGE','Imagen incorrecta']] as const).map(([kind, label]) => <Button key={kind} backgroundColor="$background" borderWidth={1} borderColor="$borderColor" justifyContent="flex-start" onPress={() => sendReport(kind)} disabled={reportMutation.isPending}>{label}</Button>)}<Button unstyled onPress={() => setReporting(false)}>Cancelar</Button></YStack> : <>
      <Card elevation={2} backgroundColor="$background" borderRadius="$4" padding="$4" gap="$1">
        <Text fontFamily="$heading" fontSize="$sm" color="$primary">Precio registrado para esta tienda</Text>
        {current !== null ? <><XStack alignItems="baseline" justifyContent="space-between"><Text fontFamily="$heading" fontSize="$display" color="$primary">{money(current)}</Text>{item.last_verified_at ? <Text color="$primary">✓ Verificado {timestamp(item.last_verified_at)}</Text> : null}</XStack><Text fontSize="$xs" color="$colorSecondary">Última actualización: {timestamp(item.last_updated_at) ?? 'sin registro'}</Text></> : <><Text fontFamily="$heading" fontSize="$xl">Sin precio registrado</Text><Text color="$colorSecondary">Aún no tenemos un precio confirmado para este producto en esta sucursal.</Text></>}
      </Card>
      {editingPrice || current === null ? <YStack gap="$3"><Text fontFamily="$heading">{current === null ? 'Agregar precio' : 'Actualizar precio'}</Text>{current !== null ? <Text color="$colorSecondary">Precio actual: {money(current)}</Text> : null}<PriceInput value={priceInput} onChange={setPriceInput} /><Button backgroundColor="$primary" color="$white" disabled={createPrice.isPending || updatePrice.isPending || captureMutation.isPending} onPress={savePrice}>{createPrice.isPending || updatePrice.isPending ? 'Actualizando precio...' : current === null ? 'Agregar precio' : 'Actualizar precio'}</Button>{current !== null ? <Button backgroundColor="$background" borderWidth={1} borderColor="$borderColor" onPress={() => setEditingPrice(false)}>Cancelar</Button> : null}</YStack> : <YStack gap="$2"><Text fontFamily="$heading" fontSize="$lg">¿El precio coincide con el que ves?</Text><Button backgroundColor="$primary" color="$white" onPress={confirmPrice} disabled={confirm.isPending} icon={<IconCheck color={colorTokens.white} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}>{confirm.isPending ? 'Confirmando precio...' : 'Sí, coincide'}</Button><Button backgroundColor="$background" borderWidth={1} borderColor="$borderColor" onPress={() => { setPriceInput(String(current)); setEditingPrice(true); }} icon={<IconEdit color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}>Cambió el precio</Button><Button backgroundColor="$background" borderWidth={1} borderColor="$borderColor" onPress={() => setReporting(true)} icon={<IconAlertTriangle color={colorTokens.warning} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}>Producto incorrecto</Button></YStack>}
      <YStack gap="$2"><Text fontFamily="$heading" fontSize="$lg">Cantidad en tu compra</Text><QuantityControl quantity={quantity} disabled={busy} onChange={changeQuantity} /><XStack justifyContent="space-between"><Text color="$colorSecondary">{captured ? `${money(captured)} c/u` : 'Precio no disponible'}</Text><Text fontFamily="$heading">Subtotal: {subtotal === null ? '—' : money(subtotal)}</Text></XStack></YStack>
      {item.store_product_id ? <Button unstyled onPress={() => navigation.navigate('PriceHistory', { storeProductId: item.store_product_id! })} accessibilityLabel="Ver historial de precios" icon={<IconHistory color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}>Ver historial de precios</Button> : null}
      <Button backgroundColor="$background" borderWidth={1} borderColor="$danger" color="$danger" onPress={remove} disabled={removeMutation.isPending} accessibilityLabel="Eliminar producto de la compra" icon={<IconTrash color={colorTokens.danger} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}>{removeMutation.isPending ? 'Eliminando...' : 'Eliminar de mi compra'}</Button>
    </>}
  </ScreenContainer>;
}
