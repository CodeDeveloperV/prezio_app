import { useState } from 'react';
import { FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconAlertTriangle, IconCheck, IconBarcode } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useCategoriesQuery } from '../../catalog/hooks/useCategoriesQuery';
import { useCreateProductMutation } from '../../catalog/hooks/useCatalogMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';

import type { Category } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'CreateProduct'>;

function CategorySeparator() {
  return <YStack width="$2" />;
}

function CategoryPill({
  item,
  isSelected,
  onPress,
}: {
  item: Category;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      backgroundColor={isSelected ? '$primary' : '$surface'}
      borderWidth={1}
      borderColor={isSelected ? '$primary' : '$borderColor'}
      borderRadius="$full"
      paddingHorizontal="$3"
      paddingVertical="$2"
      onPress={onPress}
      minHeight={40}
    >
      <Text fontFamily="$body" fontSize="$sm" color={isSelected ? '$white' : '$color'}>
        {item.name}
      </Text>
    </Button>
  );
}

/** No existing candidate matched: collect the minimum fields to create a brand-new Product
 * (status PENDING) with the scanned barcode attached automatically. */
export function CreateProductScreen({ route, navigation }: Props) {
  const { storeBranchId, scanFlow = 'quick', barcode, barcodeType } = route.params;
  const [imageUrl, setImageUrl] = useState('');
  const [canonicalName, setCanonicalName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [presentation, setPresentation] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const categoriesQuery = useCategoriesQuery();
  const createProductMutation = useCreateProductMutation();

  const canSubmit = imageUrl.trim() && canonicalName.trim() && categoryId !== null;

  const handleSubmit = () => {
    if (!canSubmit || categoryId === null) {
      return;
    }
    createProductMutation.mutate(
      {
        image_url: imageUrl.trim(),
        canonical_name: canonicalName.trim(),
        brand_name: brandName.trim() || undefined,
        presentation: presentation.trim() || undefined,
        category_id: categoryId,
        barcode,
        barcode_type: barcodeType,
      },
      {
        onSuccess: () => navigation.replace('Scan', { storeBranchId: storeBranchId ?? undefined, scanFlow }),
      },
    );
  };

  return (
    <ScreenContainer>
      <FlowHeader
        title="No encontramos este producto"
        subtitle={`Código leído: ${barcode}`}
        onBack={() => navigation.goBack()}
      />

      <YStack gap="$4">
        <Card elevation={2} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <XStack alignItems="center" gap="$3">
            <YStack
              width={48}
              height={48}
              borderRadius="$full"
              backgroundColor="rgba(245, 158, 11, 0.10)"
              alignItems="center"
              justifyContent="center"
            >
              <IconAlertTriangle color={colorTokens.warning} size={24} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            </YStack>
            <YStack flex={1} gap="$1">
              <Text fontFamily="$heading" fontSize="$lg" color="$color">
                Creemos un producto nuevo
              </Text>
              <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                Completá los datos mínimos para registrar este código y seguir con el flujo.
              </Text>
            </YStack>
          </XStack>
        </Card>

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <XStack alignItems="center" gap="$2">
            <IconBarcode color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Imagen y nombre
            </Text>
          </XStack>

          <Input
            placeholder="URL de la imagen"
            value={imageUrl}
            onChangeText={setImageUrl}
            autoCapitalize="none"
          />
          <Input placeholder="Nombre del producto" value={canonicalName} onChangeText={setCanonicalName} />
        </Card>

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <Text fontFamily="$heading" fontSize="$sm" color="$color">
            Marca y presentación
          </Text>

          <Input placeholder="Marca (opcional)" value={brandName} onChangeText={setBrandName} />
          <Input placeholder="Presentación (opcional)" value={presentation} onChangeText={setPresentation} />
        </Card>

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$4" gap="$3">
          <Text fontFamily="$heading" fontSize="$sm" color="$color">
            Categoría
          </Text>

          {categoriesQuery.isPending ? (
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              Cargando categorías...
            </Text>
          ) : categoriesQuery.isError ? (
            <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
              No pudimos cargar las categorías.
            </Text>
          ) : (
              <FlatList
              horizontal
              data={categoriesQuery.data ?? []}
              keyExtractor={(category) => String(category.id)}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={CategorySeparator}
              renderItem={({ item }: { item: Category }) => (
                <CategoryPill item={item} isSelected={categoryId === item.id} onPress={() => setCategoryId(item.id)} />
              )}
            />
          )}
        </Card>

        <Card elevation={1} backgroundColor="rgba(34, 197, 94, 0.08)" borderRadius="$4" padding="$4" gap="$2">
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
          disabled={!canSubmit || createProductMutation.isPending}
          backgroundColor="$primary"
          color="$white"
          onPress={handleSubmit}
          minHeight={56}
        >
          Crear producto
        </Button>
      </YStack>
    </ScreenContainer>
  );
}
