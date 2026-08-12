import { Text, XStack, YStack } from 'tamagui';

import {
  DEFAULT_ICON_STROKE_WIDTH,
  SUBTLE_ICON_STROKE_WIDTH,
  IconChevronRight,
  IconReceipt,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { MockShoppingList } from '../mockData';

interface RecentListsSectionProps {
  lists: MockShoppingList[];
  onPressList: (list: MockShoppingList) => void;
}
const rowPressStyle = { opacity: 0.7 };

export function RecentListsSection({ lists, onPressList }: RecentListsSectionProps) {
  return (
    <YStack gap="$3">
      <Text fontFamily="$heading" fontSize="$lg" color="$color">
        Listas recientes
      </Text>

      {lists.length === 0 ? (
        <YStack
          backgroundColor="$surface"
          borderRadius="$3"
          padding="$5"
          alignItems="center"
          gap="$2"
        >
          <IconReceipt color={colorTokens.textSecondary} size={28} strokeWidth={SUBTLE_ICON_STROKE_WIDTH} />
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            Todavía no tenés listas de compra. Creá una desde "Nueva compra".
          </Text>
        </YStack>
      ) : (
        <YStack gap="$2">
          {lists.map((list) => (
            <XStack
              key={list.id}
              onPress={() => onPressList(list)}
              backgroundColor="$surface"
              borderRadius="$3"
              padding="$3"
              alignItems="center"
              gap="$3"
              pressStyle={rowPressStyle}
            >
              <YStack
                width={40}
                height={40}
                borderRadius="$2"
                backgroundColor="$background"
                alignItems="center"
                justifyContent="center"
              >
                <IconReceipt
                  color={colorTokens.textPrimary}
                  size={20}
                  strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                />
              </YStack>

              <YStack flex={1} gap="$0.5">
                <Text fontFamily="$heading" fontSize="$sm" color="$color">
                  {list.name}
                </Text>
                <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                  {list.itemCount} productos · {list.updatedAtLabel}
                </Text>
              </YStack>

              <YStack alignItems="flex-end" gap="$0.5">
                <Text fontFamily="$heading" fontSize="$sm" color="$primary">
                  {list.totalEstimate}
                </Text>
                <IconChevronRight
                  color={colorTokens.textSecondary}
                  size={18}
                  strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                />
              </YStack>
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
