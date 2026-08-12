import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useGoogleLoginMutation, useLoginMutation } from '../hooks/useAuthMutations';
import { signInWithGoogle } from '../services/googleSignIn';
import { IconBrandGoogleFilled, IconLock, IconMail } from '../../../app/theme/icons';
import type { AuthStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useLoginMutation();
  const googleLoginMutation = useGoogleLoginMutation();

  const handleLogin = () => {
    loginMutation.mutate({ email, password });
  };

  const handleGoogleLogin = async () => {
    try {
      const idToken = await signInWithGoogle();
      googleLoginMutation.mutate(idToken);
    } catch (error) {
      // Surfacing a toast/snackbar is future work — logged for now.
      console.warn('[Auth] Google sign-in failed', error);
    }
  };

  const isSubmitting = loginMutation.isPending || googleLoginMutation.isPending;
  const errorMessage = loginMutation.error?.message ?? googleLoginMutation.error?.message;

  return (
    <ScreenContainer>
      <YStack flex={1} justifyContent="center" gap="$6">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$display" color="$color">
            Prezio
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Tu aliado en cada compra
          </Text>
        </YStack>

        <YStack gap="$3">
          <XStack
            alignItems="center"
            gap="$2"
            backgroundColor="$surface"
            borderRadius="$3"
            paddingHorizontal="$3"
          >
            <IconMail color="#64748B" size={18} strokeWidth={1.75} />
            <Input
              flex={1}
              unstyled
              paddingVertical="$3"
              fontFamily="$body"
              placeholder="Correo electrónico"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </XStack>

          <XStack
            alignItems="center"
            gap="$2"
            backgroundColor="$surface"
            borderRadius="$3"
            paddingHorizontal="$3"
          >
            <IconLock color="#64748B" size={18} strokeWidth={1.75} />
            <Input
              flex={1}
              unstyled
              paddingVertical="$3"
              fontFamily="$body"
              placeholder="Contraseña"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </XStack>

          {errorMessage ? (
            <Text fontFamily="$body" fontSize="$xs" color="$danger">
              {errorMessage}
            </Text>
          ) : null}
        </YStack>

        <YStack gap="$3">
          <Button
            onPress={handleLogin}
            disabled={isSubmitting}
            opacity={isSubmitting ? 0.7 : 1}
            backgroundColor="$primary"
            pressStyle={{ backgroundColor: '$primaryPress' }}
            borderRadius="$3"
            size="$5"
          >
            <Text fontFamily="$heading" fontSize="$md" color="white">
              Iniciar sesión
            </Text>
          </Button>

          <Button
            onPress={handleGoogleLogin}
            disabled={isSubmitting}
            opacity={isSubmitting ? 0.7 : 1}
            backgroundColor="$background"
            borderColor="$borderColor"
            borderWidth={1}
            borderRadius="$3"
            size="$5"
            icon={<IconBrandGoogleFilled color="#0F172A" size={18} strokeWidth={1.5} />}
          >
            <Text fontFamily="$body" fontSize="$sm" color="$color">
              Continuar con Google
            </Text>
          </Button>
        </YStack>

        <XStack justifyContent="center" gap="$1">
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            ¿No tenés cuenta?
          </Text>
          <Text
            onPress={() => navigation.navigate('Register')}
            fontFamily="$heading"
            fontSize="$sm"
            color="$primary"
          >
            Registrate
          </Text>
        </XStack>
      </YStack>
    </ScreenContainer>
  );
}
