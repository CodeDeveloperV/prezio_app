import { Button, Text, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useAuthStore } from '../../../shared/store/authStore';
import { useLogout } from '../hooks/useLogout';
import { IconUser } from '../../../app/theme/icons';

export function ProfileScreen() {
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
          <IconUser color="#0F172A" size={32} strokeWidth={1.5} />
        </YStack>

        <YStack alignItems="center" gap="$1">
          <Text fontFamily="$heading" fontSize="$lg" color="$color">
            {user?.email ?? 'Mi perfil'}
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Prezio: tu aliado en cada compra
          </Text>
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
