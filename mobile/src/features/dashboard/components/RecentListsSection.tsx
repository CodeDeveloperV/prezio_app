import { Text, XStack, YStack } from 'tamagui';

import { IconChevronRight, IconReceipt } from '../../../app/theme/icons';
import type { MockShoppingList } from '../mockData';

interface RecentListsSectionProps {
  lists: MockShoppingList[];
  onPressList: (list: MockShoppingList) => void;
}

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
          <IconReceipt color="#64748B" size={28} strokeWidth={1.5} />
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
              pressStyle={{ opacity: 0.7 }}
            >
              <YStack
                width={40}
                height={40}
                borderRadius="$2"
                backgroundColor="$background"
                alignItems="center"
                justifyContent="center"
              >
                <IconReceipt color="#0F172A" size={20} strokeWidth={1.75} />
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
                <IconChevronRight color="#64748B" size={18} strokeWidth={1.75} />
              </YStack>
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
