import { ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { IconBuildingStore } from '../../../app/theme/icons';
import type { MockStore } from '../mockData';

interface StoreQuickAccessProps {
  stores: MockStore[];
  onPressStore: (store: MockStore) => void;
}

/** Horizontal shortcuts to the supermarket chains the user shops at most. */
export function StoreQuickAccess({ stores, onPressStore }: StoreQuickAccessProps) {
  return (
    <YStack gap="$3">
      <Text fontFamily="$heading" fontSize="$lg" color="$color">
        Tus tiendas frecuentes
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <XStack gap="$3" paddingRight="$4">
          {stores.map((store) => (
            <YStack
              key={store.id}
              onPress={() => onPressStore(store)}
              backgroundColor="$surface"
              borderRadius="$3"
              padding="$3"
              width={92}
              alignItems="center"
              gap="$2"
              pressStyle={{ opacity: 0.7 }}
            >
              <YStack
                width={44}
                height={44}
                borderRadius="$full"
                backgroundColor="$background"
                alignItems="center"
                justifyContent="center"
              >
                <IconBuildingStore color="#22C55E" size={22} strokeWidth={1.75} />
              </YStack>
              <Text
                fontFamily="$body"
                fontSize="$xs"
                color="$color"
                textAlign="center"
                numberOfLines={1}
              >
                {store.name}
              </Text>
            </YStack>
          ))}
        </XStack>
      </ScrollView>
    </YStack>
  );
}
