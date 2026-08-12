import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { useGoogleLoginMutation, useRegisterMutation } from '../hooks/useAuthMutations';
import { signInWithGoogle } from '../services/googleSignIn';
import { IconBrandGoogleFilled, IconLock, IconMail } from '../../../app/theme/icons';
import type { AuthStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const registerMutation = useRegisterMutation();
  const googleLoginMutation = useGoogleLoginMutation();

  const handleRegister = () => {
    registerMutation.mutate({ email, password });
  };

  const handleGoogleSignUp = async () => {
    try {
      const idToken = await signInWithGoogle();
      googleLoginMutation.mutate(idToken);
    } catch (error) {
      console.warn('[Auth] Google sign-up failed', error);
    }
  };

  const isSubmitting = registerMutation.isPending || googleLoginMutation.isPending;
  const errorMessage = registerMutation.error?.message ?? googleLoginMutation.error?.message;

  return (
    <ScreenContainer>
      <YStack flex={1} justifyContent="center" gap="$6">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontSize="$xxl" color="$color">
            Creá tu cuenta
          </Text>
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            Empezá a comparar precios en segundos.
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
            onPress={handleRegister}
            disabled={isSubmitting}
            opacity={isSubmitting ? 0.7 : 1}
            backgroundColor="$primary"
            pressStyle={{ backgroundColor: '$primaryPress' }}
            borderRadius="$3"
            size="$5"
          >
            <Text fontFamily="$heading" fontSize="$md" color="white">
              Crear cuenta
            </Text>
          </Button>

          <Button
            onPress={handleGoogleSignUp}
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
            ¿Ya tenés cuenta?
          </Text>
          <Text
            onPress={() => navigation.navigate('Login')}
            fontFamily="$heading"
            fontSize="$sm"
            color="$primary"
          >
            Iniciá sesión
          </Text>
        </XStack>
      </YStack>
    </ScreenContainer>
  );
}
