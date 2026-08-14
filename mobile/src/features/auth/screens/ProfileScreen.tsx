import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useAuthStore } from '../../../shared/store/authStore';
import { useLogout } from '../hooks/useLogout';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  SUBTLE_ICON_STROKE_WIDTH,
  IconBell,
  IconBellRinging,
  IconChartBar,
  IconChevronRight,
  IconMail,
  IconReceipt,
  IconUser,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { ProfileStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;
const rowPressStyle = { opacity: 0.7 };

export function ProfileScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  return (
    <ScreenContainer scroll={false}>
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$4">
        <YStack
          width={72}
          height={72}
          borderRadius="$full"
          backgroundColor="$surface"
          alignItems="center"
          justifyContent="center"
        >
          <IconUser color={colorTokens.textPrimary} size={32} strokeWidth={SUBTLE_ICON_STROKE_WIDTH} />
        </YStack>

        <YStack alignItems="center" gap="$1">
          <Text fontFamily="$heading" fontSize="$lg" color="$color">
            {user?.email ?? 'Mi perfil'}
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Prezio: tu aliado en cada compra
          </Text>
        </YStack>

        <YStack width="100%" gap="$2">
          <XStack
            onPress={() => navigation.navigate('ShoppingLists')}
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            gap="$3"
            pressStyle={rowPressStyle}
          >
            <IconReceipt color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color">
              Mis listas
            </Text>
            <IconChevronRight
              color={colorTokens.textSecondary}
              size={18}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
          </XStack>

          <XStack
            onPress={() => navigation.navigate('ShoppingListInvitations')}
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            gap="$3"
            pressStyle={rowPressStyle}
          >
            <IconMail color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color">
              Invitaciones
            </Text>
            <IconChevronRight
              color={colorTokens.textSecondary}
              size={18}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
          </XStack>

          <XStack
            onPress={() => navigation.navigate('Analytics')}
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            gap="$3"
            pressStyle={rowPressStyle}
          >
            <IconChartBar color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color">
              Estadísticas
            </Text>
            <IconChevronRight
              color={colorTokens.textSecondary}
              size={18}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
          </XStack>

          <XStack
            onPress={() => navigation.navigate('Alerts')}
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            gap="$3"
            pressStyle={rowPressStyle}
          >
            <IconBellRinging
              color={colorTokens.textPrimary}
              size={20}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
            <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color">
              Mis alertas
            </Text>
            <IconChevronRight
              color={colorTokens.textSecondary}
              size={18}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
          </XStack>

          <XStack
            onPress={() => navigation.navigate('Notifications')}
            backgroundColor="$surface"
            borderRadius="$3"
            padding="$3"
            alignItems="center"
            gap="$3"
            pressStyle={rowPressStyle}
          >
            <IconBell color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
            <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color">
              Notificaciones
            </Text>
            <IconChevronRight
              color={colorTokens.textSecondary}
              size={18}
              strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
            />
          </XStack>
        </YStack>

        <Button
          onPress={logout}
          backgroundColor="$surface"
          borderRadius="$3"
          size="$4"
        >
          <Text fontFamily="$heading" fontSize="$sm" color="$danger">
            Cerrar sesión
          </Text>
        </Button>
      </YStack>
    </ScreenContainer>
  );
}
