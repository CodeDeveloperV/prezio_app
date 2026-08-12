import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { DEFAULT_ICON_STROKE_WIDTH, IconCheck, IconMail, IconX } from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import { useAcceptInvitationMutation, useDeclineInvitationMutation } from '../hooks/useInvitationMutations';
import { useInvitationsQuery } from '../hooks/useInvitationsQuery';
import { useInvitationsRealtime } from '../hooks/useShoppingListRealtime';

import type { ShoppingListInvitation } from '@prezio/shared-types';

const styles = StyleSheet.create({
  listContent: {
    gap: 12,
    padding: 16,
  },
});

function InvitationCard({ invitation }: { invitation: ShoppingListInvitation }) {
  const acceptMutation = useAcceptInvitationMutation();
  const declineMutation = useDeclineInvitationMutation();

  return (
    <YStack backgroundColor="$surface" borderRadius="$3" padding="$4" gap="$2">
      <XStack gap="$2" alignItems="center">
        <IconMail color={colorTokens.textPrimary} size={18} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />
        <Text fontFamily="$heading" fontSize="$sm" color="$color">
          Invitación a una lista de compras
        </Text>
      </XStack>

      <XStack gap="$2">
        <Button
          flex={1}
          backgroundColor="$primary"
          icon={<IconCheck color={colorTokens.white} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          disabled={acceptMutation.isPending}
          onPress={() => acceptMutation.mutate(invitation.id)}
        >
          <Text fontFamily="$body" fontSize="$sm" color="$white">
            Aceptar
          </Text>
        </Button>
        <Button
          flex={1}
          backgroundColor="$background"
          icon={<IconX color={colorTokens.textPrimary} size={16} strokeWidth={DEFAULT_ICON_STROKE_WIDTH} />}
          disabled={declineMutation.isPending}
          onPress={() => declineMutation.mutate(invitation.id)}
        >
          Rechazar
        </Button>
      </XStack>
    </YStack>
  );
}

/** "Invitaciones": pending invites addressed to the current user's email/account. */
export function ShoppingListInvitationsScreen() {
  useInvitationsRealtime();
  const invitationsQuery = useInvitationsQuery();
  const invitations = invitationsQuery.data ?? [];

  if (invitationsQuery.isLoading) {
    return (
      <ScreenContainer scroll={false}>
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator color={colorTokens.primary} />
        </YStack>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <FlatList
        data={invitations}
        keyExtractor={(invitation) => String(invitation.id)}
        contentContainerStyle={styles.listContent}
        onRefresh={() => invitationsQuery.refetch()}
        refreshing={invitationsQuery.isRefetching}
        renderItem={({ item }) => <InvitationCard invitation={item} />}
        ListEmptyComponent={
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary" textAlign="center">
            No tienes invitaciones pendientes.
          </Text>
        }
      />
    </ScreenContainer>
  );
}
