import type { ReactNode } from 'react';
import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, Text, XStack, YStack } from 'tamagui';

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
  IconPower,
  IconReceipt,
  IconUser,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { ProfileStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;
const rowPressStyle = { opacity: 0.7 };
const logoutPressStyle = { opacity: 0.7 };

function formatMemberSince(createdAt: string): string {
  const label = new Date(createdAt).toLocaleDateString('es-PA', { month: 'long', year: 'numeric' });
  return `Miembro desde ${label}`;
}

interface ProfileMenuRowProps {
  icon: ReactNode;
  label: string;
  onPress: () => void;
}

/** Shared row shape for every navigable profile entry: same badge, radius, and
 * spacing so the menu reads as one group, matching sibling list rows (e.g.
 * ShoppingListRow) elsewhere in the app. */
function ProfileMenuRow({ icon, label, onPress }: ProfileMenuRowProps) {
  return (
    <XStack
      onPress={onPress}
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
        {icon}
      </YStack>
      <Text flex={1} fontFamily="$body" fontSize="$sm" color="$color">
        {label}
      </Text>
      <IconChevronRight color={colorTokens.textSecondary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
    </XStack>
  );
}

function ProfileMenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <YStack gap="$2">
      <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary" paddingHorizontal="$1">
        {label}
      </Text>
      <YStack gap="$2">{children}</YStack>
    </YStack>
  );
}

export function ProfileScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const logout = useLogout();

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', 'Vas a salir de tu cuenta de Prezio en este dispositivo.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <ScreenContainer>
      <Card
        elevation={2}
        backgroundColor="$surface"
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius="$4"
        padding="$5"
        alignItems="center"
        gap="$3"
      >
        <YStack
          width={72}
          height={72}
          borderRadius="$full"
          backgroundColor="rgba(34, 197, 94, 0.14)"
          alignItems="center"
          justifyContent="center"
        >
          <IconUser color={colorTokens.primary} size={32} strokeWidth={SUBTLE_ICON_STROKE_WIDTH} />
        </YStack>

        <YStack alignItems="center" gap="$1">
          <Text fontFamily="$heading" fontSize="$lg" color="$color">
            {user?.email ?? 'Mi perfil'}
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Prezio: tu aliado en cada compra
          </Text>
          {user?.created_at && (
            <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
              {formatMemberSince(user.created_at)}
            </Text>
          )}
        </YStack>
      </Card>

      <ProfileMenuGroup label="Compras">
        <ProfileMenuRow
          icon={<IconReceipt color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          label="Mis listas"
          onPress={() => navigation.navigate('ShoppingLists')}
        />
        <ProfileMenuRow
          icon={<IconMail color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          label="Invitaciones"
          onPress={() => navigation.navigate('ShoppingListInvitations')}
        />
        <ProfileMenuRow
          icon={<IconChartBar color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          label="Estadísticas"
          onPress={() => navigation.navigate('Analytics')}
        />
      </ProfileMenuGroup>

      <ProfileMenuGroup label="Alertas">
        <ProfileMenuRow
          icon={<IconBellRinging color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          label="Mis alertas"
          onPress={() => navigation.navigate('Alerts')}
        />
        <ProfileMenuRow
          icon={<IconBell color={colorTokens.textPrimary} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          label="Notificaciones"
          onPress={() => navigation.navigate('Notifications')}
        />
      </ProfileMenuGroup>

      <Button
        onPress={handleLogout}
        backgroundColor="$surface"
        borderRadius="$3"
        color="$danger"
        fontFamily="$heading"
        fontSize="$sm"
        minHeight={56}
        paddingVertical="$4"
        pressStyle={logoutPressStyle}
        icon={<IconPower color={colorTokens.danger} size={20} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
      >
        Cerrar sesión
      </Button>

      {/* Clears the floating scan tab's halo, which overhangs above the tab dock. */}
      <YStack height={24} />
    </ScreenContainer>
  );
}
