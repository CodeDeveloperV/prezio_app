import { useState } from 'react';
import { FlatList } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useCategoriesQuery } from '../../catalog/hooks/useCategoriesQuery';
import { useCreateProductMutation } from '../../catalog/hooks/useCatalogMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';

import type { Category } from '@prezio/shared-types';

type Props = NativeStackScreenProps<ShoppingSessionStackParamList, 'CreateProduct'>;

/** No existing candidate matched: collect the minimum fields to create a brand-new Product
 * (status PENDING) with the scanned barcode attached automatically. */
export function CreateProductScreen({ route, navigation }: Props) {
  const { storeBranchId, barcode, barcodeType } = route.params;
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
        onSuccess: () => navigation.replace('Scan', { storeBranchId }),
      },
    );
  };

  return (
    <ScreenContainer>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Nuevo producto
        </Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Código escaneado: {barcode}
        </Text>
      </YStack>

      <YStack gap="$3">
        <Input
          placeholder="URL de la imagen"
          value={imageUrl}
          onChangeText={setImageUrl}
          autoCapitalize="none"
        />
        <Input placeholder="Nombre del producto" value={canonicalName} onChangeText={setCanonicalName} />
        <Input placeholder="Marca (opcional)" value={brandName} onChangeText={setBrandName} />
        <Input placeholder="Presentación (opcional)" value={presentation} onChangeText={setPresentation} />

        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Categoría
        </Text>
        <FlatList
          horizontal
          data={categoriesQuery.data ?? []}
          keyExtractor={(category) => String(category.id)}
          renderItem={({ item }: { item: Category }) => (
            <XStack
              backgroundColor={categoryId === item.id ? '$primary' : '$surface'}
              borderRadius="$3"
              paddingHorizontal="$3"
              paddingVertical="$2"
              marginRight="$2"
              onPress={() => setCategoryId(item.id)}
            >
              <Text
                fontFamily="$body"
                fontSize="$sm"
                color={categoryId === item.id ? 'white' : '$color'}
              >
                {item.name}
              </Text>
            </XStack>
          )}
        />
      </YStack>

      <Button
        disabled={!canSubmit || createProductMutation.isPending}
        backgroundColor="$primary"
        color="white"
        onPress={handleSubmit}
      >
        Crear producto
      </Button>
    </ScreenContainer>
  );
}
