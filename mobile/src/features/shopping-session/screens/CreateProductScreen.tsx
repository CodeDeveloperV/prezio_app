import { useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconAlertTriangle,
  IconCamera,
  IconCheck,
  IconLibraryPhoto,
  IconCategory,
  IconPhotoPlus,
  IconTag,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useCategoriesQuery } from '../../catalog/hooks/useCategoriesQuery';
import { useCreateProductMutation, useUploadProductImageMutation } from '../../catalog/hooks/useCatalogMutations';
import type { ShoppingSessionStackParamList } from '../../../app/navigation/types';
import { FlowHeader } from '../components/FlowHeader';

import type { Category, ImageUploadContentType } from '@prezio/shared-types';

const SUPPORTED_UPLOAD_TYPES: ImageUploadContentType[] = ['image/jpeg', 'image/png', 'image/webp'];

function toUploadContentType(mimeType: string | undefined): ImageUploadContentType {
  return (SUPPORTED_UPLOAD_TYPES as string[]).includes(mimeType ?? '')
    ? (mimeType as ImageUploadContentType)
    : 'image/jpeg';
}

const styles = StyleSheet.create({
  preview: { width: 140, height: 140, borderRadius: 16, borderWidth: 1 },
});

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
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [canonicalName, setCanonicalName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [presentation, setPresentation] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);

  const categoriesQuery = useCategoriesQuery();
  const createProductMutation = useCreateProductMutation();
  const uploadImageMutation = useUploadProductImageMutation();

  const canSubmit = Boolean(imageUrl) && canonicalName.trim() && categoryId !== null;

  const handlePickImage = async (source: 'camera' | 'library') => {
    const pick = source === 'camera' ? launchCamera : launchImageLibrary;
    const result = await pick({ mediaType: 'photo', quality: 0.8 });
    const asset = result.assets?.[0];
    if (!asset?.uri) {
      return;
    }

    setLocalImageUri(asset.uri);
    setImageUrl(null);
    uploadImageMutation.mutate(
      { localUri: asset.uri, contentType: toUploadContentType(asset.type) },
      { onSuccess: setImageUrl },
    );
  };

  const handleSubmit = () => {
    if (!canSubmit || categoryId === null || !imageUrl) {
      return;
    }
    createProductMutation.mutate(
      {
        image_url: imageUrl,
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
                Completa los datos mínimos para registrar este código y seguir con el flujo.
              </Text>
            </YStack>
          </XStack>
        </Card>

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
          <XStack alignItems="center" gap="$2">
            <IconPhotoPlus color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Imagen y nombre
            </Text>
          </XStack>

          {localImageUri ? (
            <YStack alignItems="center" gap="$3">
              <Image
                source={{ uri: localImageUri }}
                style={[styles.preview, { borderColor: colorTokens.border }]}
              />
              {uploadImageMutation.isPending ? (
                <XStack alignItems="center" gap="$2">
                  <ActivityIndicator color={colorTokens.primary} />
                  <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
                    Subiendo imagen...
                  </Text>
                </XStack>
              ) : uploadImageMutation.isError ? (
                <Text fontFamily="$body" fontSize="$sm" color={colorTokens.warning}>
                  No pudimos subir la imagen. Intenta de nuevo.
                </Text>
              ) : null}
              <XStack gap="$4">
                <Button size="$4" chromeless color="$primary" onPress={() => handlePickImage('camera')}>
                  Cambiar foto
                </Button>
                <Button size="$4" chromeless color="$primary" onPress={() => handlePickImage('library')}>
                  Elegir otra
                </Button>
              </XStack>
            </YStack>
          ) : (
            <XStack gap="$3">
              <Button
                flex={1}
                minHeight={48}
                borderRadius="$4"
                backgroundColor="$surface"
                borderWidth={1}
                borderColor="$borderColor"
                icon={<IconCamera color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
                onPress={() => handlePickImage('camera')}
              >
                Tomar foto
              </Button>
              <Button
                flex={1}
                minHeight={48}
                borderRadius="$4"
                backgroundColor="$surface"
                borderWidth={1}
                borderColor="$borderColor"
                icon={<IconLibraryPhoto color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
                onPress={() => handlePickImage('library')}
              >
                Galería
              </Button>
            </XStack>
          )}
          <Input
            placeholder="Nombre del producto"
            value={canonicalName}
            onChangeText={setCanonicalName}
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
        </Card>

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
          <XStack alignItems="center" gap="$2">
            <IconTag color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Marca y presentación
            </Text>
          </XStack>

          <Input
            placeholder="Marca (opcional)"
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
          <Input
            placeholder="Presentación (opcional)"
            value={presentation}
            onChangeText={setPresentation}
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
        </Card>

        <Card elevation={1} backgroundColor="$surface" borderRadius="$4" padding="$5" gap="$4">
          <XStack alignItems="center" gap="$2">
            <IconCategory color={colorTokens.primary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text fontFamily="$heading" fontSize="$sm" color="$color">
              Categoría
            </Text>
          </XStack>

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

        <Card elevation={1} backgroundColor="rgba(34, 197, 94, 0.08)" borderRadius="$4" padding="$5" gap="$2">
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
          disabled={!canSubmit || uploadImageMutation.isPending || createProductMutation.isPending}
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
