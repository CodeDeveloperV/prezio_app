import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { HTTPError } from 'ky';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconCheck,
  IconEdit,
  IconHistory,
  IconMinus,
  IconPlus,
  IconShoppingCart,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { httpClient } from '../../../shared/services/api/httpClient';
import {
  useConfirmMatchMutation,
  useCreateStoreProductPriceMutation,
  useUpdatePriceMutation,
} from '../../pricing/hooks/usePricingMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';
import { addShoppingListItem } from '../../shopping-lists/api/shoppingListsApi';
import { selectActiveShoppingList } from '../../shopping-lists/utils/selectActiveShoppingList';
import { useShoppingListsQuery } from '../../shopping-lists/hooks/useShoppingLists';

import type { StoreProductRead } from '@prezio/shared-types';

type Props = NativeStackScreenProps<
  ShoppingSessionStackParamList,
  'ScanResult'
>;
type Step = 'verify' | 'quantity' | 'update' | 'missing-price' | 'success';
type CorrectionKind =
  | 'WRONG_PRODUCT'
  | 'WRONG_NAME'
  | 'WRONG_PRESENTATION'
  | 'WRONG_BRAND'
  | 'WRONG_IMAGE';

type ProductCorrectionRequest = {
  type: 'incorrect_barcode' | 'incorrect_product_info';
  product_id: number;
  barcode_id: number;
  correction_kind: Lowercase<CorrectionKind>;
  description?: string;
};

function createProductCorrection(
  request: ProductCorrectionRequest,
): Promise<{ id: number }> {
  return httpClient.post('reports', { json: request }).json<{ id: number }>();
}

const styles = StyleSheet.create({
  image: { width: 76, height: 76, borderRadius: 16 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 20,
    paddingBottom: 32,
  },
});

function money(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('es-PA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : String(value);
}

function validPrice(value: string) {
  const normalized = value.trim().replace(',', '.');
  return /^\d+(\.\d{1,2})?$/.test(normalized) && Number(normalized) > 0;
}

function QuantitySelector({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (value: number) => void;
}) {
  return (
    <XStack
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$4"
      minHeight={72}
      alignItems="center"
      justifyContent="space-between"
      paddingHorizontal="$3"
    >
      <Button
        unstyled
        accessibilityLabel="Disminuir cantidad"
        disabled={quantity <= 1}
        onPress={() => onChange(Math.max(1, quantity - 1))}
        padding="$3"
      >
        <IconMinus
          color={
            quantity <= 1 ? colorTokens.textSecondary : colorTokens.textPrimary
          }
          size={22}
          strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
        />
      </Button>
      <Text fontFamily="$heading" fontSize="$xl" color="$color">
        {quantity}
      </Text>
      <Button
        unstyled
        accessibilityLabel="Aumentar cantidad"
        onPress={() => onChange(quantity + 1)}
        padding="$3"
      >
        <IconPlus
          color={colorTokens.textPrimary}
          size={22}
          strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
        />
      </Button>
    </XStack>
  );
}

/** Purchase scan flow is intentionally branch-strict: price offers from another branch never
 * participate here. A product without a listing at the active branch starts at missing-price. */
export function ScanResultScreen({ route, navigation }: Props) {
  const {
    storeBranchId,
    barcodeId,
    product,
    storeProduct,
    fromCache = false,
    scanFlow = 'quick',
  } = route.params;
  const purchaseFlow = scanFlow === 'purchase';
  const initialStoreProduct =
    !purchaseFlow || storeProduct?.store_branch_id === storeBranchId
      ? storeProduct
      : null;
  const [storeProductState, setStoreProductState] =
    useState<StoreProductRead | null>(initialStoreProduct);
  const [step, setStep] = useState<Step>(
    initialStoreProduct ? 'verify' : 'missing-price',
  );
  const [quantity, setQuantity] = useState(1);
  const [priceInput, setPriceInput] = useState(
    initialStoreProduct ? String(initialStoreProduct.current_price) : '',
  );
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [correction, setCorrection] = useState<CorrectionKind | null>(null);
  const [reported, setReported] = useState(false);
  const shoppingLists = useShoppingListsQuery();
  const activeList = selectActiveShoppingList(shoppingLists.data);
  const queryClient = useQueryClient();
  const confirmPrice = useConfirmMatchMutation();
  const createStoreProduct = useCreateStoreProductPriceMutation();
  const updatePrice = useUpdatePriceMutation();
  const reportBarcode = useMutation<
    { id: number },
    Error,
    ProductCorrectionRequest
  >({
    mutationFn: createProductCorrection,
  });
  const unitPrice =
    storeProductState?.current_price ?? Number(priceInput.replace(',', '.'));

  useEffect(() => {
    if (step !== 'success') return undefined;
    const timeout = setTimeout(
      () =>
        navigation.replace('Scan', {
          storeBranchId: storeBranchId ?? undefined,
          scanFlow,
        }),
      750,
    );
    return () => clearTimeout(timeout);
  }, [navigation, scanFlow, step, storeBranchId]);

  const addItem = useMutation({
    mutationFn: async () => {
      if (!activeList || !storeProductState || storeBranchId == null)
        throw new Error('Purchase context is incomplete');
      // The server performs the atomic add-or-increment by shopping_list_id + product_id and
      // derives the capture from this branch-scoped StoreProduct.
      const request = {
        product_id: product.id,
        quantity,
        client_request_id: `scan-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`,
        captured_store_product_id: storeProductState.id,
      };
      return addShoppingListItem(activeList.id, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
      queryClient.invalidateQueries({
        queryKey: ['shoppingLists', activeList?.id, 'summary'],
      });
      setStep('success');
    },
    onError: () =>
      setError(
        'No pudimos agregar el producto a tu compra. Intenta nuevamente.',
      ),
  });

  const confirm = async () => {
    if (!storeProductState || fromCache) return;
    setError(null);
    try {
      setStoreProductState(
        await confirmPrice.mutateAsync(storeProductState.id),
      );
      setStep('quantity');
    } catch {
      setError('No pudimos confirmar el precio. Intenta nuevamente.');
    }
  };
  const savePrice = async () => {
    if (!storeProductState || !validPrice(priceInput)) {
      setError('Ingresa un precio mayor que 0 con máximo 2 decimales.');
      return;
    }
    setError(null);
    try {
      const updated = await updatePrice.mutateAsync({
        storeProductId: storeProductState.id,
        request: {
          price: Number(priceInput.replace(',', '.')),
          version: storeProductState.version,
        },
      });
      setStoreProductState(updated);
      setStep('quantity');
    } catch (requestError) {
      if (
        requestError instanceof HTTPError &&
        requestError.response.status === 409
      ) {
        const conflict = (await requestError.response.json()) as {
          current_price: string | number;
          version: number;
        };
        setStoreProductState({
          ...storeProductState,
          current_price: Number(conflict.current_price),
          version: conflict.version,
        });
        setPriceInput(String(conflict.current_price));
        setError(
          'El precio cambió mientras lo actualizabas. Mostramos el precio más reciente; puedes editarlo y volver a actualizar.',
        );
        return;
      }
      setError(
        'No pudimos actualizar el precio. Verifica el precio más reciente e intenta nuevamente.',
      );
    }
  };
  const registerMissingPrice = async () => {
    if (storeBranchId == null || !validPrice(priceInput)) {
      setError('Ingresa un precio mayor que 0 con máximo 2 decimales.');
      return;
    }
    setError(null);
    try {
      const created = await createStoreProduct.mutateAsync({
        product_id: product.id,
        store_branch_id: storeBranchId,
        current_price: Number(priceInput.replace(',', '.')),
      });
      setStoreProductState(created);
      setStep('quantity');
    } catch {
      setError('No pudimos registrar el precio. Intenta nuevamente.');
    }
  };
  const report = () => {
    if (barcodeId == null || !correction) return;
    reportBarcode.mutate(
      {
        type:
          correction === 'WRONG_PRODUCT'
            ? 'incorrect_barcode'
            : 'incorrect_product_info',
        product_id: product.id,
        barcode_id: barcodeId,
        correction_kind: correction.toLowerCase() as Lowercase<CorrectionKind>,
      },
      {
        onSuccess: () => {
          setSheetOpen(false);
          setReported(true);
        },
        onError: () =>
          setError('No pudimos enviar la corrección. Intenta nuevamente.'),
      },
    );
  };

  const productSummary = (
    <XStack alignItems="center" gap="$3" paddingVertical="$2">
      {product.image_url ? (
        <Image
          source={{ uri: product.image_url }}
          style={styles.image}
          resizeMode="contain"
        />
      ) : (
        <YStack
          width={76}
          height={76}
          borderRadius="$4"
          backgroundColor="$surface"
          alignItems="center"
          justifyContent="center"
        >
          <IconShoppingCart
            color={colorTokens.textSecondary}
            size={28}
            strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
          />
        </YStack>
      )}
      <YStack flex={1} gap="$1">
        <Text
          fontFamily="$heading"
          fontSize="$lg"
          color="$color"
          numberOfLines={2}
        >
          {product.canonical_name}
        </Text>
        {(product.brand_name || product.presentation) && (
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            {[product.brand_name, product.presentation]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
      </YStack>
    </XStack>
  );

  return (
    <ScreenContainer scroll={step !== 'success'}>
      <FlowHeader
        title={
          step === 'quantity'
            ? 'Agregar producto'
            : step === 'update'
            ? 'Actualizar precio'
            : step === 'missing-price'
            ? 'Agregar precio'
            : 'Producto encontrado'
        }
        onBack={() => navigation.goBack()}
      />
      <YStack
        flex={1}
        gap="$5"
        justifyContent={step === 'success' ? 'center' : 'flex-start'}
      >
        {step === 'success' ? (
          <YStack alignItems="center" gap="$3" padding="$6">
            <YStack
              width={76}
              height={76}
              borderRadius="$full"
              backgroundColor="$primary"
              alignItems="center"
              justifyContent="center"
            >
              <IconCheck
                color={colorTokens.white}
                size={40}
                strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
              />
            </YStack>
            <Text fontFamily="$heading" fontSize="$xl" color="$color">
              Agregado
            </Text>
            <Text fontFamily="$body" fontSize="$md" color="$colorSecondary">
              {quantity} × {product.canonical_name}
            </Text>
          </YStack>
        ) : (
          <>
            {productSummary}
            {step === 'verify' && storeProductState && (
              <YStack gap="$4">
                <YStack gap="$1">
                  <Text fontFamily="$heading" fontSize="$md" color="$color">
                    Precio registrado
                  </Text>
                  <Text
                    fontFamily="$heading"
                    fontSize="$display"
                    color="$primary"
                  >
                    B/. {money(storeProductState.current_price)}
                  </Text>
                  <Text
                    fontFamily="$body"
                    fontSize="$sm"
                    color="$colorSecondary"
                  >
                    {storeProductState.last_verified_at
                      ? `Verificado ${new Date(
                          storeProductState.last_verified_at,
                        ).toLocaleString('es-PA', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}`
                      : 'Aún no hay una verificación reciente'}
                  </Text>
                </YStack>
                <YStack gap="$3">
                  <Text fontFamily="$heading" fontSize="$lg" color="$color">
                    ¿El precio coincide con el que ves?
                  </Text>
                  <Button
                    backgroundColor="$primary"
                    color="$white"
                    minHeight={56}
                    disabled={confirmPrice.isPending || fromCache}
                    onPress={confirm}
                    icon={
                      <IconCheck
                        color={colorTokens.white}
                        size={19}
                        strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                      />
                    }
                  >
                    {confirmPrice.isPending
                      ? 'Confirmando precio...'
                      : 'Sí, coincide'}
                  </Button>
                  <Button
                    backgroundColor="$background"
                    borderWidth={1}
                    borderColor="$borderColor"
                    minHeight={56}
                    disabled={fromCache}
                    onPress={() => {
                      setError(null);
                      setPriceInput(String(storeProductState.current_price));
                      setStep('update');
                    }}
                    icon={
                      <IconEdit
                        color={colorTokens.textPrimary}
                        size={18}
                        strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                      />
                    }
                  >
                    Cambió el precio
                  </Button>
                  <Button
                    unstyled
                    disabled={fromCache || barcodeId == null}
                    onPress={() => setSheetOpen(true)}
                    paddingVertical="$2"
                  >
                    <Text
                      fontFamily="$body"
                      fontSize="$sm"
                      color="$colorSecondary"
                      textAlign="center"
                    >
                      Producto incorrecto
                    </Text>
                  </Button>
                  <Button
                    unstyled
                    onPress={() =>
                      navigation.navigate('PriceHistory', {
                        storeProductId: storeProductState.id,
                      })
                    }
                    icon={
                      <IconHistory
                        color={colorTokens.textSecondary}
                        size={16}
                        strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                      />
                    }
                  >
                    <Text
                      fontFamily="$body"
                      fontSize="$sm"
                      color="$colorSecondary"
                    >
                      Ver historial de precios
                    </Text>
                  </Button>
                </YStack>
              </YStack>
            )}
            {step === 'missing-price' && (
              <YStack gap="$4">
                <Card
                  elevation={1}
                  backgroundColor="rgba(245, 158, 11, 0.10)"
                  borderRadius="$4"
                  padding="$4"
                >
                  <Text fontFamily="$body" fontSize="$sm" color="$color">
                    Aún no tenemos precio para este producto en esta sucursal.
                    Ayuda a mantener Prezio actualizado.
                  </Text>
                </Card>
                <YStack gap="$2">
                  <Text fontFamily="$heading" fontSize="$sm" color="$color">
                    Precio actual *
                  </Text>
                  <Input
                    keyboardType="decimal-pad"
                    value={priceInput}
                    onChangeText={setPriceInput}
                    placeholder="B/. 0.00"
                    fontSize="$lg"
                  />
                </YStack>
                <Button
                  backgroundColor="$primary"
                  color="$white"
                  minHeight={56}
                  disabled={createStoreProduct.isPending}
                  onPress={registerMissingPrice}
                >
                  {createStoreProduct.isPending
                    ? 'Guardando precio...'
                    : 'Guardar precio y continuar'}
                </Button>
              </YStack>
            )}
            {step === 'update' && storeProductState && (
              <YStack gap="$4">
                <YStack gap="$1">
                  <Text
                    fontFamily="$body"
                    fontSize="$sm"
                    color="$colorSecondary"
                  >
                    Precio actual
                  </Text>
                  <Text fontFamily="$heading" fontSize="$xl" color="$color">
                    B/. {money(storeProductState.current_price)}
                  </Text>
                </YStack>
                <YStack gap="$2">
                  <Text fontFamily="$heading" fontSize="$sm" color="$color">
                    Nuevo precio *
                  </Text>
                  <Input
                    keyboardType="decimal-pad"
                    value={priceInput}
                    onChangeText={setPriceInput}
                    placeholder="B/. 0.00"
                    fontSize="$lg"
                  />
                </YStack>
                <YStack gap="$2">
                  <Text fontFamily="$heading" fontSize="$sm" color="$color">
                    Comentario (opcional)
                  </Text>
                  <Input
                    value={comment}
                    onChangeText={setComment}
                    placeholder="Ej. Precio encontrado en anaquel"
                  />
                </YStack>
                <Button
                  backgroundColor="$primary"
                  color="$white"
                  minHeight={56}
                  disabled={updatePrice.isPending}
                  onPress={savePrice}
                >
                  {updatePrice.isPending
                    ? 'Actualizando precio...'
                    : 'Actualizar precio'}
                </Button>
                <Button
                  backgroundColor="$background"
                  borderWidth={1}
                  borderColor="$borderColor"
                  onPress={() => setStep('verify')}
                >
                  Cancelar
                </Button>
              </YStack>
            )}
            {step === 'quantity' && storeProductState && (
              <YStack gap="$4">
                <YStack gap="$2">
                  <Text fontFamily="$heading" fontSize="$md" color="$color">
                    Cantidad
                  </Text>
                  <QuantitySelector
                    quantity={quantity}
                    onChange={setQuantity}
                  />
                </YStack>
                <YStack gap="$1">
                  <Text
                    fontFamily="$body"
                    fontSize="$sm"
                    color="$colorSecondary"
                  >
                    B/. {money(unitPrice)} c/u
                  </Text>
                  <XStack justifyContent="space-between" alignItems="baseline">
                    <Text fontFamily="$heading" fontSize="$md" color="$color">
                      Subtotal
                    </Text>
                    <Text fontFamily="$heading" fontSize="$xl" color="$primary">
                      B/. {money(unitPrice * quantity)}
                    </Text>
                  </XStack>
                </YStack>
                <Button
                  backgroundColor="$primary"
                  color="$white"
                  minHeight={56}
                  disabled={addItem.isPending || !activeList}
                  onPress={() => {
                    setError(null);
                    addItem.mutate();
                  }}
                >
                  {addItem.isPending
                    ? 'Agregando...'
                    : 'Agregar y seguir escaneando'}
                </Button>
                {!activeList && (
                  <Text fontFamily="$body" fontSize="$sm" color="$danger">
                    No hay una compra activa para agregar este producto.
                  </Text>
                )}
              </YStack>
            )}
          </>
        )}
        {error && (
          <Text fontFamily="$body" fontSize="$sm" color="$danger">
            {error}
          </Text>
        )}
        {reported && (
          <Card
            elevation={1}
            backgroundColor="rgba(34, 197, 94, 0.10)"
            borderRadius="$4"
            padding="$4"
          >
            <Text fontFamily="$heading" color="$primary">
              Gracias por ayudarnos
            </Text>
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              Revisaremos la corrección. Puedes volver al scanner cuando
              quieras.
            </Text>
          </Card>
        )}
      </YStack>
      <Modal
        transparent
        visible={sheetOpen}
        animationType="slide"
        onRequestClose={() => setSheetOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <YStack gap="$3">
              <Text fontFamily="$heading" fontSize="$xl" color="$color">
                ¿Qué está incorrecto?
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Ayúdanos a corregir la información de este código.
              </Text>
              {(
                [
                  ['WRONG_PRODUCT', 'El código pertenece a otro producto'],
                  ['WRONG_NAME', 'Nombre o información incorrecta'],
                  ['WRONG_PRESENTATION', 'Presentación incorrecta'],
                  ['WRONG_BRAND', 'Marca incorrecta'],
                  ['WRONG_IMAGE', 'Imagen incorrecta'],
                ] as Array<[CorrectionKind, string]>
              ).map(([kind, label]) => (
                <Button
                  key={kind}
                  backgroundColor={
                    correction === kind ? 'rgba(34, 197, 94, 0.10)' : '$surface'
                  }
                  borderWidth={1}
                  borderColor={
                    correction === kind ? '$primary' : '$borderColor'
                  }
                  onPress={() => setCorrection(kind)}
                  justifyContent="flex-start"
                >
                  {label}
                </Button>
              ))}
              <Button
                backgroundColor="$primary"
                color="$white"
                disabled={!correction || reportBarcode.isPending}
                onPress={report}
              >
                {reportBarcode.isPending ? 'Enviando...' : 'Enviar corrección'}
              </Button>
              <Button
                backgroundColor="$background"
                onPress={() => setSheetOpen(false)}
              >
                Cancelar
              </Button>
            </YStack>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}
