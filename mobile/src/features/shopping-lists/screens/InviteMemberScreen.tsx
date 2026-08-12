import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HTTPError } from 'ky';
import { Button, Input, Text, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import type { ProfileStackParamList } from '../../../app/navigation/types';
import { useInviteToShoppingListMutation } from '../hooks/useShoppingListMutations';

type Props = NativeStackScreenProps<ProfileStackParamList, 'InviteMember'>;

/** Email-only invites to already-registered users -- no links, no anonymous invitees. */
export function InviteMemberScreen({ route, navigation }: Props) {
  const { shoppingListId } = route.params;
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inviteMutation = useInviteToShoppingListMutation(shoppingListId);

  const handleSubmit = async () => {
    setErrorMessage(null);
    const invitedEmail = email.trim();
    if (!invitedEmail) {
      setErrorMessage('Ingresa un correo válido.');
      return;
    }

    try {
      await inviteMutation.mutateAsync({ invited_email: invitedEmail });
      navigation.goBack();
    } catch (error) {
      if (error instanceof HTTPError && error.response.status === 409) {
        setErrorMessage('Ya existe una invitación pendiente para este correo.');
        return;
      }
      if (error instanceof HTTPError && error.response.status === 400) {
        setErrorMessage('Este usuario ya es miembro de la lista.');
        return;
      }
      setErrorMessage('No pudimos enviar la invitación. Intenta de nuevo.');
    }
  };

  return (
    <ScreenContainer>
      <YStack gap="$1">
        <Text fontFamily="$heading" fontSize="$lg" color="$color">
          Invitar a colaborar
        </Text>
        <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
          Solo usuarios ya registrados en Prezio pueden ser invitados.
        </Text>
      </YStack>

      <Input
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        placeholder="correo@ejemplo.com"
        fontSize="$lg"
      />

      {errorMessage && (
        <Text fontFamily="$body" fontSize="$sm" color="$danger">
          {errorMessage}
        </Text>
      )}

      <Button
        backgroundColor="$primary"
        color="$white"
        disabled={inviteMutation.isPending}
        onPress={handleSubmit}
      >
        Enviar invitación
      </Button>
    </ScreenContainer>
  );
}
