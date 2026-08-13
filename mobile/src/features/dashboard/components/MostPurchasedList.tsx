import { Text, XStack, YStack } from 'tamagui';

import { DEFAULT_ICON_STROKE_WIDTH, IconShoppingCart } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';

import type { MostPurchasedProduct } from '@prezio/shared-types';

interface MostPurchasedListProps {
  products: MostPurchasedProduct[];
}

/** "Productos más comprados": all-time top 5 by total checked quantity. */
export function MostPurchasedList({ products }: MostPurchasedListProps) {
  return (
    <YStack gap="$3">
      <Text fontFamily="$heading" fontSize="$lg" color="$color">
        Productos más comprados
      </Text>

      {products.length === 0 ? (
        <YStack backgroundColor="$surface" borderRadius="$3" padding="$5" alignItems="center" gap="$2">
          <IconShoppingCart color={colorTokens.textSecondary} size={28} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            Todavía no marcaste productos como comprados.
          </Text>
        </YStack>
      ) : (
        <YStack gap="$2">
          {products.map((product, index) => (
            <XStack
              key={product.product_id}
              alignItems="center"
              gap="$3"
              backgroundColor="$surface"
              borderRadius="$3"
              padding="$3"
            >
              <YStack
                width={28}
                height={28}
                borderRadius="$full"
                backgroundColor="$background"
                alignItems="center"
                justifyContent="center"
              >
                <Text fontFamily="$heading" fontSize="$xs" color="$primary">
                  {index + 1}
                </Text>
              </YStack>
              <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color" numberOfLines={1}>
                {product.product_name}
              </Text>
              <Text fontFamily="$heading" fontSize="$sm" color="$colorSecondary">
                x{product.total_quantity}
              </Text>
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
