import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Image, ScrollView, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Q } from '@nozbe/watermelondb';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconBolt,
  IconCheck,
  IconPhotoPlus,
  IconShoppingCart,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { database } from '../../../shared/services/db/database';
import type ShoppingList from '../../../shared/services/db/models/ShoppingList';
import { addShoppingListItem } from '../../shopping-lists/api/shoppingListsApi';
import { pullShoppingListItems, pullShoppingLists } from '../../shopping-lists/services/offline/shoppingListPull';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'ProductCreatedSuccess'>;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colorTokens.textPrimary },
  content: { flexGrow: 1, padding: 20 },
  checkCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colorTokens.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  productImage: { width: 52, height: 52, borderRadius: 14 },
  productPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const shoppingLists = () => database.get<ShoppingList>('shopping_lists');

function formatPrice(price: number): string {
  return price.toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ConfirmationRow({ children }: { children: string }) {
  return (
    <XStack alignItems="center" gap="$2">
      <IconCheck color={colorTokens.primary} size={17} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
      <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color">
        {children}
      </Text>
    </XStack>
  );
}

export function ProductCreatedSuccessScreen({ route, navigation }: Props) {
  const {
    storeBranchId,
    scanFlow,
    barcode,
    shoppingListId,
    shoppingListName,
    addRequestId,
    shoppingListItemId,
    addErrorMessage,
    price,
    product,
  } = route.params;
  const queryClient = useQueryClient();
  const checkScale = useRef(new Animated.Value(0.82)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const isComplete = shoppingListItemId !== undefined;

  const productDetails = useMemo(
    () => [product.presentation, product.brand_name].filter(Boolean).join(' · '),
    [product.brand_name, product.presentation],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.spring(checkScale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }),
      Animated.timing(checkOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    AccessibilityInfo.announceForAccessibility(
      isComplete ? 'Producto creado correctamente y agregado a tu compra' : 'Producto creado. No se pudo agregar a tu compra.',
    );
  }, [checkOpacity, checkScale, isComplete]);

  const retryAddMutation = useMutation({
    mutationFn: () =>
      addShoppingListItem(shoppingListId, {
        product_id: product.id,
        quantity: 1,
        client_request_id: addRequestId,
      }),
    onSuccess: async (item) => {
      await queryClient.invalidateQueries({ queryKey: ['shoppingLists'] });
      navigation.replace('ProductCreatedSuccess', { ...route.params, shoppingListItemId: item.id, addErrorMessage: undefined });
    },
  });

  const handleNextScan = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Scan', params: { storeBranchId, scanFlow, suppressedBarcode: barcode } }],
    });
  };

  const handleViewShoppingList = async () => {
    const tabNavigation = navigation.getParent() as
      | { navigate: (routeName: string, params?: unknown) => void }
      | undefined;
    try {
      await pullShoppingLists();
      const [localList] = await shoppingLists().query(Q.where('server_id', String(shoppingListId))).fetch();
      if (!localList) {
        throw new Error('Active shopping list was not cached');
      }
      await pullShoppingListItems(localList.id, shoppingListId);
      tabNavigation?.navigate('Profile', {
        screen: 'ShoppingListDetail',
        params: { shoppingListId: localList.id, shoppingListName },
      });
    } catch {
      tabNavigation?.navigate('Profile', { screen: 'ShoppingLists' });
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <YStack flex={1} justifyContent="space-between" gap="$6">
          <YStack alignItems="center" gap="$2" paddingTop="$6" accessibilityRole="summary" accessibilityLabel="Producto creado correctamente">
            <Animated.View style={{ opacity: checkOpacity, transform: [{ scale: checkScale }] }}>
              <YStack style={styles.checkCircle}>
                <IconCheck color={colorTokens.white} size={40} strokeWidth={3} />
              </YStack>
            </Animated.View>
            <Text marginTop="$3" fontFamily="$heading" fontSize="$xl" color="$white" textAlign="center">
              {isComplete ? '¡Producto creado!' : 'Producto creado'}
            </Text>
            <Text fontFamily="$body" fontSize="$sm" color="rgba(255, 255, 255, 0.72)" textAlign="center">
              {isComplete ? 'Se agregó a tu lista de compra' : 'No pudimos agregarlo a tu compra todavía'}
            </Text>
          </YStack>

          <YStack gap="$3">
            <Card backgroundColor="$white" borderRadius="$4" padding="$3" elevation={3}>
              <XStack alignItems="center" gap="$3">
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={styles.productImage} accessibilityLabel={`Imagen de ${product.canonical_name}`} />
                ) : (
                  <YStack style={styles.productPlaceholder}>
                    <IconPhotoPlus color={colorTokens.primary} size={23} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  </YStack>
                )}
                <YStack flex={1} gap="$1">
                  <Text fontFamily="$heading" fontSize="$sm" color="$color" numberOfLines={2}>
                    {product.canonical_name}
                  </Text>
                  {productDetails ? (
                    <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" numberOfLines={1}>
                      {productDetails}
                    </Text>
                  ) : null}
                </YStack>
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  ${formatPrice(price)}
                </Text>
              </XStack>
            </Card>

            {isComplete ? (
              <Card backgroundColor="rgba(255, 255, 255, 0.96)" borderRadius="$4" padding="$4" gap="$3">
                <ConfirmationRow>Guardado con el código leído</ConfirmationRow>
                <ConfirmationRow>Precio registrado para esta tienda</ConfirmationRow>
                <ConfirmationRow>Agregado a tu compra</ConfirmationRow>
              </Card>
            ) : (
              <Card backgroundColor="rgba(245, 158, 11, 0.14)" borderRadius="$4" padding="$4" gap="$2">
                <Text fontFamily="$heading" fontSize="$sm" color="$white">
                  {addErrorMessage ?? 'Producto creado, pero falta agregarlo a tu compra.'}
                </Text>
                <Text fontFamily="$body" fontSize="$xs" color="rgba(255, 255, 255, 0.72)">
                  El producto y su precio ya fueron guardados. Puedes reintentar sin volver a crearlo.
                </Text>
              </Card>
            )}

            {isComplete ? (
              <Card backgroundColor="rgba(255, 255, 255, 0.07)" borderRadius="$4" padding="$3">
                <XStack alignItems="center" gap="$3">
                  <YStack width={36} height={36} borderRadius="$full" backgroundColor="rgba(59, 130, 246, 0.16)" alignItems="center" justifyContent="center">
                    <IconBolt color="#60A5FA" size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                  </YStack>
                  <YStack flex={1} gap="$0.5">
                    <Text fontFamily="$heading" fontSize="$xs" color="$white">Puedes seguir escaneando</Text>
                    <Text fontFamily="$body" fontSize="$xs" color="rgba(255, 255, 255, 0.64)">El lector está listo para continuar.</Text>
                  </YStack>
                </XStack>
              </Card>
            ) : null}
          </YStack>

          <YStack gap="$2" paddingTop="$2">
            {isComplete ? (
              <Button minHeight={56} backgroundColor="$primary" color="$white" onPress={handleNextScan} accessibilityLabel="Escanear siguiente producto">
                Escanear siguiente producto
              </Button>
            ) : (
              <Button minHeight={56} backgroundColor="$primary" color="$white" onPress={() => retryAddMutation.mutate()} disabled={retryAddMutation.isPending} accessibilityLabel="Intentar agregar nuevamente">
                {retryAddMutation.isPending ? <ActivityIndicator color={colorTokens.white} /> : 'Intentar agregar nuevamente'}
              </Button>
            )}
            {retryAddMutation.isError ? (
              <Text fontFamily="$body" fontSize="$xs" color="#FCA5A5" textAlign="center">No pudimos agregarlo todavía. Intenta nuevamente.</Text>
            ) : null}
            <Button chromeless color="$primary" onPress={handleViewShoppingList} accessibilityLabel="Ver mi lista de compra">
              <XStack alignItems="center" gap="$2">
                <IconShoppingCart color={colorTokens.primary} size={17} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
                <Text fontFamily="$heading" fontSize="$sm" color="$primary">Ver mi lista de compra</Text>
              </XStack>
            </Button>
          </YStack>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
