import { useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet } from 'react-native';
// Image upload to S3 isn't configured yet -- see the commented "Foto del producto" section below.
// import { Image } from 'react-native';
// import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Switch, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  // IconCamera,
  IconCheck,
  IconChevronDown,
  IconPhotoPlus,
  IconX,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useCategoriesQuery } from '../../catalog/hooks/useCategoriesQuery';
import { useCreateProductMutation /*, useUploadProductImageMutation */ } from '../../catalog/hooks/useCatalogMutations';
import { useTaxRatesQuery } from '../../pricing/hooks/useTaxRatesQuery';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';
import { addShoppingListItem } from '../../shopping-lists/api/shoppingListsApi';
import { useShoppingListsQuery } from '../../shopping-lists/hooks/useShoppingLists';
import { selectActiveShoppingList } from '../../shopping-lists/utils/selectActiveShoppingList';

// const SUPPORTED_UPLOAD_TYPES: ImageUploadContentType[] = ['image/jpeg', 'image/png', 'image/webp'];
//
// function toUploadContentType(mimeType: string | undefined): ImageUploadContentType {
//   return (SUPPORTED_UPLOAD_TYPES as string[]).includes(mimeType ?? '')
//     ? (mimeType as ImageUploadContentType)
//     : 'image/jpeg';
// }

// Canonical unit tokens recognized by the backend's `_UNIT_ALIASES` (normalization.py).
const PRESENTATION_UNITS: { value: string; label: string }[] = [
  { value: 'g', label: 'g (gramos)' },
  { value: 'kg', label: 'kg (kilogramos)' },
  { value: 'ml', label: 'ml (mililitros)' },
  { value: 'L', label: 'L (litros)' },
  { value: 'und', label: 'und (unidades)' },
];

const styles = StyleSheet.create({
  // preview: {
  //   width: '100%',
  //   height: 172,
  //   borderRadius: 16,
  //   borderWidth: 1,
  //   backgroundColor: '#FFFFFF',
  // },
  // previewPlaceholder: {
  //   width: '100%',
  //   height: 172,
  //   borderRadius: 16,
  //   borderWidth: 1,
  //   borderStyle: 'dashed',
  //   borderColor: 'rgba(100, 116, 139, 0.18)',
  //   backgroundColor: 'rgba(34, 197, 94, 0.06)',
  //   alignItems: 'center',
  //   justifyContent: 'center',
  // },
  selectModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  selectModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '70%',
  },
});

const selectRowPressStyle = { opacity: 0.85 };
// const cameraBadgePressStyle = { backgroundColor: '$primaryPress' };
const selectOptionRowPressStyle = { backgroundColor: '$backgroundHover' };

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'CreateProduct'>;

function SelectRowSeparator() {
  return <YStack height={1} backgroundColor="$borderColor" />;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <YStack gap="$1">
      <Text fontFamily="$heading" fontSize="$lg" color="$color">
        {title}
      </Text>
      {subtitle ? (
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}

function SelectOptionRow({
  label,
  isSelected,
  onPress,
  indented = false,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  indented?: boolean;
}) {
  return (
    <XStack
      onPress={onPress}
      pressStyle={selectOptionRowPressStyle}
      alignItems="center"
      justifyContent="space-between"
      minHeight={52}
      paddingHorizontal="$2"
      paddingLeft={indented ? '$5' : '$2'}
    >
      <Text fontFamily="$body" fontSize="$md" color={isSelected ? '$primary' : '$color'}>
        {label}
      </Text>
      {isSelected ? <IconCheck color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} /> : null}
    </XStack>
  );
}

/** No existing candidate matched: collect the minimum fields to create a brand-new Product
 * (status PENDING) with the scanned barcode attached automatically. */
export function CreateProductScreen({ route, navigation }: Props) {
  const { storeBranchId, scanFlow = 'quick', barcode, barcodeType } = route.params;
  // const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  // const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [canonicalName, setCanonicalName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [presentationQuantity, setPresentationQuantity] = useState('');
  const [presentationUnit, setPresentationUnit] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isUnitPickerOpen, setIsUnitPickerOpen] = useState(false);
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [isTaxable, setIsTaxable] = useState(false);
  const [taxRateId, setTaxRateId] = useState<number | null>(null);
  const [isTaxPickerOpen, setIsTaxPickerOpen] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [isAddingToList, setIsAddingToList] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const addRequestIdRef = useRef<string | null>(null);
  const submissionStartedRef = useRef(false);

  const categoriesQuery = useCategoriesQuery();
  const createProductMutation = useCreateProductMutation();
  const taxRatesQuery = useTaxRatesQuery('PA');
  const shoppingListsQuery = useShoppingListsQuery();
  const activeShoppingList = selectActiveShoppingList(shoppingListsQuery.data);
  const queryClient = useQueryClient();
  // const uploadImageMutation = useUploadProductImageMutation();

  const selectedCategory = categoriesQuery.data?.find((category) => category.id === categoryId) ?? null;
  const categories = categoriesQuery.data ?? [];
  const categoryGroups = categories
    .filter((category) => category.parent_id === null)
    .map((group) => ({
      group,
      children: categories.filter((category) => category.parent_id === group.id),
    }))
    .filter(({ children }) => children.length > 0);
  const presentation = presentationQuantity.trim() && presentationUnit
    ? `${presentationQuantity.trim()} ${presentationUnit}`
    : '';
  const normalizedPrice = price.trim().replace(',', '.');
  const isValidPrice = /^\d+(\.\d{1,2})?$/.test(normalizedPrice) && Number(normalizedPrice) > 0;
  const standardTaxRate = taxRatesQuery.data?.find((rate) => rate.code === 'ITBMS_7') ?? null;
  const selectedTaxRate = taxRatesQuery.data?.find((rate) => rate.id === taxRateId) ?? standardTaxRate;
  const effectiveTaxRateId = isTaxable ? selectedTaxRate?.id ?? null : null;
  const canSubmit = Boolean(canonicalName.trim()) && categoryId !== null && isValidPrice && storeBranchId != null;
  const isSubmitDisabled = !canSubmit || createProductMutation.isPending || isAddingToList;
  const nameError = nameTouched && !canonicalName.trim() ? 'Ingresa el nombre del producto.' : null;
  const categoryError = categoryTouched && categoryId === null ? 'Selecciona una categoría.' : null;
  const priceError = priceTouched && !isValidPrice ? 'Ingresa un precio mayor que 0 con máximo 2 decimales.' : null;

  // const handlePickImage = async (source: 'camera' | 'library') => {
  //   const pick = source === 'camera' ? launchCamera : launchImageLibrary;
  //   const result = await pick({ mediaType: 'photo', quality: 0.8 });
  //   const asset = result.assets?.[0];
  //   if (!asset?.uri) {
  //     return;
  //   }
  //
  //   setLocalImageUri(asset.uri);
  //   setImageUrl(null);
  //   uploadImageMutation.mutate(
  //     { localUri: asset.uri, contentType: toUploadContentType(asset.type) },
  //     { onSuccess: setImageUrl },
  //   );
  // };

  const handleSubmit = async () => {
    if (submissionStartedRef.current) {
      return;
    }
    setNameTouched(true);
    setCategoryTouched(true);
    setPriceTouched(true);
    if (!canSubmit || categoryId === null) {
      return;
    }
    if (!activeShoppingList) {
      setSubmitError('No encontramos una compra activa. Vuelve a iniciar la compra antes de crear el producto.');
      return;
    }

    submissionStartedRef.current = true;
    setSubmitError(null);
    const addRequestId = addRequestIdRef.current ?? `created-product-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    addRequestIdRef.current = addRequestId;

    try {
      const product = await createProductMutation.mutateAsync({
        canonical_name: canonicalName.trim(),
        brand_name: brandName.trim() || undefined,
        presentation: presentation.trim() || undefined,
        category_id: categoryId,
        barcode,
        barcode_type: barcodeType,
        store_branch_id: storeBranchId,
        initial_price: Number(normalizedPrice),
        tax_rate_id: effectiveTaxRateId,
      });

      setIsAddingToList(true);
      const successParams = {
        storeBranchId,
        scanFlow,
        barcode,
        shoppingListId: activeShoppingList.id,
        shoppingListName: activeShoppingList.name,
        addRequestId,
        price: Number(normalizedPrice),
        product,
      };

      try {
        const item = await addShoppingListItem(activeShoppingList.id, {
          product_id: product.id,
          quantity: 1,
          client_request_id: addRequestId,
        });
        await queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Scan', params: { storeBranchId, scanFlow, suppressedBarcode: barcode } },
            { name: 'ProductCreatedSuccess', params: { ...successParams, shoppingListItemId: item.id } },
          ],
        });
      } catch {
        navigation.reset({
          index: 1,
          routes: [
            { name: 'Scan', params: { storeBranchId, scanFlow, suppressedBarcode: barcode } },
            {
              name: 'ProductCreatedSuccess',
              params: {
                ...successParams,
                addErrorMessage: 'Producto creado, pero no pudimos agregarlo a tu compra.',
              },
            },
          ],
        });
      } finally {
        setIsAddingToList(false);
      }
    } catch {
      setSubmitError('No pudimos crear el producto. Revisa tu conexión e inténtalo de nuevo.');
      submissionStartedRef.current = false;
    }
  };

  return (
    <ScreenContainer>
      <FlowHeader
        title="Crear producto"
        subtitle={
          <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="center">
            Código leído: <Text fontFamily="$heading" fontSize="$xs" color="$primary">{barcode}</Text>
          </Text>
        }
        onBack={() =>
          navigation.replace('ProductNotFound', {
            storeBranchId: storeBranchId ?? undefined,
            scanFlow,
            barcode,
            barcodeType,
          })
        }
      />

      <YStack gap="$4">
        <Card
          elevation={2}
          backgroundColor={colorTokens.primarySoft}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          borderWidth={1}
          borderColor="rgba(34, 197, 94, 0.16)"
        >
          <XStack alignItems="center" gap="$3">
            <YStack
              width={56}
              height={56}
              borderRadius="$full"
              backgroundColor="rgba(34, 197, 94, 0.12)"
              alignItems="center"
              justifyContent="center"
            >
              <IconPhotoPlus color={colorTokens.primary} size={26} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </YStack>
            <YStack flex={1} gap="$1">
              <Text fontFamily="$heading" fontSize="$lg" color="$color">
                Creemos un producto nuevo
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Completa lo mínimo para registrar este código y seguir con el flujo.
              </Text>
            </YStack>
          </XStack>
        </Card>

        <YStack gap="$3">
          <SectionHeading
            title="Información básica"
            subtitle="Primero resolvemos la imagen y el nombre para que el producto quede reconocible al instante."
          />

          <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$4">
            {/* Foto del producto -- disabled until S3 image upload is configured.
            <YStack gap="$2">
              <Text fontFamily="$heading" fontSize="$sm" color="$color">
                Foto del producto *
              </Text>

              <YStack onPress={() => handlePickImage('library')} pressStyle={selectRowPressStyle}>
                {localImageUri ? (
                  <Image source={{ uri: localImageUri }} style={[styles.preview, { borderColor: colorTokens.border }]} />
                ) : (
                  <YStack style={styles.previewPlaceholder}>
                    <IconPhotoPlus color={colorTokens.primary} size={28} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                    <Text fontFamily="$heading" fontSize="$sm" color="$primary" marginTop="$2">
                      Agregar imagen
                    </Text>
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" textAlign="center" marginTop="$1">
                      Toca para elegir de la galería
                    </Text>
                  </YStack>
                )}

                <YStack
                  position="absolute"
                  right={10}
                  bottom={10}
                  width={44}
                  height={44}
                  borderRadius="$full"
                  backgroundColor="$primary"
                  borderWidth={3}
                  borderColor="$surface"
                  alignItems="center"
                  justifyContent="center"
                  onPress={() => handlePickImage('camera')}
                  pressStyle={cameraBadgePressStyle}
                >
                  <IconCamera color={colorTokens.white} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                </YStack>
              </YStack>

              {uploadImageMutation.isPending ? (
                <XStack alignItems="center" gap="$2">
                  <ActivityIndicator color={colorTokens.primary} />
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                    Subiendo imagen...
                  </Text>
                </XStack>
              ) : uploadImageMutation.isError ? (
                <Text fontFamily="$body" fontSize="$xs" color={colorTokens.warning}>
                  No pudimos subir la imagen. Intenta de nuevo.
                </Text>
              ) : null}
            </YStack>
            */}

            <YStack gap="$2">
              <Text fontFamily="$heading" fontSize="$sm" color="$color">
                Nombre del producto *
              </Text>
              <Input
                placeholder="Escribe el nombre"
                value={canonicalName}
                onChangeText={setCanonicalName}
                onBlur={() => setNameTouched(true)}
                minHeight={56}
                borderRadius="$4"
                borderWidth={1}
                borderColor={nameError ? '$danger' : '$borderColor'}
                backgroundColor="$background"
                paddingHorizontal="$4"
                fontFamily="$body"
                fontSize="$md"
                placeholderTextColor="$colorSecondary"
              />
              {nameError ? (
                <Text fontFamily="$body" fontSize="$xs" color="$danger">
                  {nameError}
                </Text>
              ) : null}
            </YStack>

            <YStack backgroundColor={colorTokens.primarySoft} borderRadius="$4" padding="$3" gap="$2">
              <XStack alignItems="center" gap="$2">
                <IconCheck color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  Tip rápido
                </Text>
              </XStack>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Usa un nombre claro para encontrarlo fácilmente después.
              </Text>
            </YStack>
          </Card>
        </YStack>

        <YStack gap="$3">
          <SectionHeading title="Categoría *" subtitle="Elige la más cercana para guardar el producto en la lista correcta." />

          <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
            {categoriesQuery.isError ? (
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                No pudimos cargar las categorías.
              </Text>
            ) : (
              <XStack
                onPress={() => {
                  setIsCategoryPickerOpen(true);
                }}
                pressStyle={selectRowPressStyle}
                disabled={categoriesQuery.isPending}
                alignItems="center"
                justifyContent="space-between"
                minHeight={56}
                borderRadius="$4"
                borderWidth={1}
                borderColor={categoryError ? '$danger' : '$borderColor'}
                backgroundColor="$background"
                paddingHorizontal="$4"
              >
                <Text
                  fontFamily="$body"
                  fontSize="$md"
                  color={selectedCategory ? '$color' : '$colorSecondary'}
                >
                  {categoriesQuery.isPending
                    ? 'Cargando categorías...'
                    : (selectedCategory?.name ?? 'Selecciona una categoría')}
                </Text>
                <IconChevronDown color={colorTokens.textSecondary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
              </XStack>
            )}
            {categoryError ? (
              <Text fontFamily="$body" fontSize="$xs" color="$danger">
                {categoryError}
              </Text>
            ) : null}
          </Card>
        </YStack>

        <Modal
          transparent
          visible={isCategoryPickerOpen}
          animationType="slide"
          onRequestClose={() => setIsCategoryPickerOpen(false)}
        >
          <Pressable style={styles.selectModalBackdrop} onPress={() => setIsCategoryPickerOpen(false)}>
            <Pressable style={styles.selectModalSheet} onPress={() => undefined}>
              <XStack alignItems="center" justifyContent="space-between" marginBottom="$3">
                <Text fontFamily="$heading" fontSize="$lg" color="$color">
                  Selecciona una categoría
                </Text>
                <YStack
                  onPress={() => setIsCategoryPickerOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar selector de categorías"
                  width={48}
                  height={48}
                  alignItems="center"
                  justifyContent="center"
                >
                  <IconX color={colorTokens.textSecondary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                </YStack>
              </XStack>
              <FlatList
                data={categoryGroups}
                keyExtractor={({ group }) => String(group.id)}
                renderItem={({ item, index }) => (
                  <YStack paddingBottom={index === categoryGroups.length - 1 ? '$0' : '$3'}>
                    <Text
                      fontFamily="$heading"
                      fontSize="$sm"
                      color="$colorSecondary"
                      paddingHorizontal="$2"
                      paddingTop="$2"
                      paddingBottom="$1"
                    >
                      {item.group.name}
                    </Text>
                    {item.children.map((category, childIndex) => (
                      <YStack key={category.id}>
                        {childIndex > 0 ? <SelectRowSeparator /> : null}
                        <SelectOptionRow
                          label={category.name}
                          indented
                          isSelected={categoryId === category.id}
                          onPress={() => {
                            setCategoryId(category.id);
                            setIsCategoryPickerOpen(false);
                          }}
                        />
                      </YStack>
                    ))}
                  </YStack>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          transparent
          visible={isUnitPickerOpen}
          animationType="slide"
          onRequestClose={() => setIsUnitPickerOpen(false)}
        >
          <Pressable style={styles.selectModalBackdrop} onPress={() => setIsUnitPickerOpen(false)}>
            <Pressable style={styles.selectModalSheet} onPress={() => undefined}>
              <XStack alignItems="center" justifyContent="space-between" marginBottom="$3">
                <Text fontFamily="$heading" fontSize="$lg" color="$color">
                  Selecciona una unidad
                </Text>
                <YStack
                  onPress={() => setIsUnitPickerOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cerrar selector de unidades"
                  width={48}
                  height={48}
                  alignItems="center"
                  justifyContent="center"
                >
                  <IconX color={colorTokens.textSecondary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                </YStack>
              </XStack>
              <FlatList
                data={PRESENTATION_UNITS}
                keyExtractor={(unit) => unit.value}
                ItemSeparatorComponent={SelectRowSeparator}
                renderItem={({ item }) => (
                  <SelectOptionRow
                    label={item.label}
                    isSelected={presentationUnit === item.value}
                    onPress={() => {
                      setPresentationUnit(item.value);
                      setIsUnitPickerOpen(false);
                    }}
                  />
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>

        <YStack gap="$3">
          <SectionHeading title="Marca y presentación" subtitle="Estos campos ayudan a distinguir variantes del mismo producto (opcional)." />

          <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
            <XStack gap="$3" alignItems="flex-start" flexWrap="wrap">
              <YStack flex={1} minWidth={150} gap="$2">
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  Marca
                </Text>
                <Input
                  placeholder="Ej. Nestlé"
                  value={brandName}
                  onChangeText={setBrandName}
                  minHeight={56}
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor="$borderColor"
                  backgroundColor="$background"
                  paddingHorizontal="$4"
                  fontFamily="$body"
                  fontSize="$md"
                  placeholderTextColor="$colorSecondary"
                />
              </YStack>

              <YStack flex={1} minWidth={150} gap="$2">
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  Presentación
                </Text>
                <XStack gap="$2">
                  <Input
                    placeholder="Ej. 350"
                    value={presentationQuantity}
                    onChangeText={setPresentationQuantity}
                    keyboardType="decimal-pad"
                    minHeight={56}
                    flex={1}
                    borderRadius="$4"
                    borderWidth={1}
                    borderColor="$borderColor"
                    backgroundColor="$background"
                    paddingHorizontal="$4"
                    fontFamily="$body"
                    fontSize="$md"
                    placeholderTextColor="$colorSecondary"
                  />
                  <XStack
                    onPress={() => setIsUnitPickerOpen(true)}
                    pressStyle={selectRowPressStyle}
                    alignItems="center"
                    justifyContent="space-between"
                    minWidth={92}
                    minHeight={56}
                    borderRadius="$4"
                    borderWidth={1}
                    borderColor="$borderColor"
                    backgroundColor="$background"
                    paddingHorizontal="$3"
                    gap="$1"
                  >
                    <Text fontFamily="$body" fontSize="$md" color={presentationUnit ? '$color' : '$colorSecondary'}>
                      {presentationUnit ?? 'Unidad'}
                    </Text>
                    <IconChevronDown color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  </XStack>
                </XStack>
              </YStack>
            </XStack>
          </Card>
        </YStack>

        <YStack gap="$3">
          <SectionHeading title="Precio e impuesto" subtitle="Registra el precio mostrado hoy en esta sucursal." />

          <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$4">
            <YStack gap="$2">
              <Text fontFamily="$heading" fontSize="$sm" color="$color">
                Precio en tienda *
              </Text>
              <Input
                placeholder="0.00"
                value={price}
                onChangeText={setPrice}
                onBlur={() => setPriceTouched(true)}
                keyboardType="decimal-pad"
                minHeight={56}
                borderRadius="$4"
                borderWidth={1}
                borderColor={priceError ? '$danger' : '$borderColor'}
                backgroundColor="$background"
                paddingHorizontal="$4"
                fontFamily="$body"
                fontSize="$md"
                placeholderTextColor="$colorSecondary"
              />
              {priceError ? (
                <Text fontFamily="$body" fontSize="$xs" color="$danger">{priceError}</Text>
              ) : (
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                  Usa hasta dos decimales. El precio se guarda tal como aparece en el estante.
                </Text>
              )}
            </YStack>

            <YStack gap="$3" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$4">
              <XStack alignItems="center" justifyContent="space-between" gap="$3">
                <YStack flex={1} gap="$1">
                  <Text fontFamily="$heading" fontSize="$sm" color="$color">¿Aplica impuesto?</Text>
                  <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                    Actívalo para elegir la tasa que corresponde al producto.
                  </Text>
                </YStack>
                <Switch checked={isTaxable} onCheckedChange={setIsTaxable}>
                  <Switch.Thumb />
                </Switch>
              </XStack>

              {isTaxable ? (
                <XStack
                  onPress={() => setIsTaxPickerOpen(true)}
                  pressStyle={selectRowPressStyle}
                  disabled={taxRatesQuery.isPending || taxRatesQuery.isError}
                  alignItems="center"
                  justifyContent="space-between"
                  minHeight={56}
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor="$borderColor"
                  backgroundColor="$background"
                  paddingHorizontal="$4"
                >
                  <Text fontFamily="$body" fontSize="$md" color={selectedTaxRate ? '$color' : '$colorSecondary'}>
                    {taxRatesQuery.isPending ? 'Cargando tasas...' : (selectedTaxRate?.name ?? 'Selecciona una tasa')}
                  </Text>
                  <IconChevronDown color={colorTokens.textSecondary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                </XStack>
              ) : null}
              {isTaxable && taxRatesQuery.isError ? (
                <Text fontFamily="$body" fontSize="$xs" color="$danger">No pudimos cargar las tasas de impuesto.</Text>
              ) : null}
            </YStack>
          </Card>
        </YStack>

        <Modal
          transparent
          visible={isTaxPickerOpen}
          animationType="slide"
          onRequestClose={() => setIsTaxPickerOpen(false)}
        >
          <Pressable style={styles.selectModalBackdrop} onPress={() => setIsTaxPickerOpen(false)}>
            <Pressable style={styles.selectModalSheet} onPress={() => undefined}>
              <XStack alignItems="center" justifyContent="space-between" marginBottom="$3">
                <Text fontFamily="$heading" fontSize="$lg" color="$color">Selecciona el impuesto</Text>
                <YStack onPress={() => setIsTaxPickerOpen(false)} width={48} height={48} alignItems="center" justifyContent="center">
                  <IconX color={colorTokens.textSecondary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                </YStack>
              </XStack>
              <FlatList
                data={taxRatesQuery.data ?? []}
                keyExtractor={(rate) => String(rate.id)}
                ItemSeparatorComponent={SelectRowSeparator}
                renderItem={({ item }) => (
                  <SelectOptionRow
                    label={item.name}
                    isSelected={effectiveTaxRateId === item.id}
                    onPress={() => {
                      setTaxRateId(item.id);
                      setIsTaxPickerOpen(false);
                    }}
                  />
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>

        <Card
          elevation={1}
          backgroundColor={colorTokens.primarySoft}
          borderRadius="$4"
          padding="$4"
          gap="$2"
          borderWidth={1}
          borderColor="rgba(34, 197, 94, 0.16)"
        >
          <XStack alignItems="center" gap="$2">
            <IconCheck color={colorTokens.primary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Se guardará con el código leído
            </Text>
          </XStack>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            El producto quedará listo para continuar con precio, historial y alertas.
          </Text>
        </Card>

        <Button
          disabled={isSubmitDisabled}
          opacity={isSubmitDisabled ? 0.7 : 1}
          backgroundColor="$primary"
          color="$white"
          onPress={handleSubmit}
          minHeight={56}
        >
          {createProductMutation.isPending || isAddingToList ? <ActivityIndicator color={colorTokens.white} /> : 'Crear producto'}
        </Button>
        {submitError ? (
          <Text fontFamily="$body" fontSize="$sm" color="$danger" textAlign="center">
            {submitError}
          </Text>
        ) : null}
      </YStack>
    </ScreenContainer>
  );
}
