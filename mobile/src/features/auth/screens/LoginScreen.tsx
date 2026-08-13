import { useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { Image, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Separator, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { GoogleBrandIcon } from '../../../shared/components/GoogleBrandIcon';
import { useGoogleLoginMutation, useLoginMutation } from '../hooks/useAuthMutations';
import { signInWithGoogle } from '../services/googleSignIn';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconLock,
  IconMail,
} from '../../../app/theme/icons';
import { colorTokens } from '../../../app/theme/tokens';
import type { AuthStackParamList } from '../../../app/navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;
const primaryPressStyle = { backgroundColor: '$primaryPress' };
const subtlePressStyle = { opacity: 0.7 };
const logoSource = require('../../../assets/images/prezio_mark.png');

const styles = StyleSheet.create({
  page: {
    position: 'relative',
  },
  glowTopRight: {
    position: 'absolute',
    top: -100,
    right: -110,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: '#22C55E',
    opacity: 0.08,
  },
  glowBottomLeft: {
    position: 'absolute',
    left: -90,
    bottom: 120,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: '#0F172A',
    opacity: 0.05,
  },
  heroBadge: {
    width: 116,
    height: 116,
    borderRadius: 30,
    backgroundColor: colorTokens.background,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 6,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  formCard: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 4,
  },
  field: {
    minHeight: 58,
  },
  fieldIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function AuthField({
  icon,
  ...inputProps
}: {
  icon: ReactNode;
} & ComponentProps<typeof Input>) {
  return (
    <XStack
      alignItems="center"
      gap="$3"
      backgroundColor="$background"
      borderColor="$borderColor"
      borderWidth={1}
      borderRadius="$4"
      paddingHorizontal="$3"
      style={styles.field}
    >
      <YStack backgroundColor="$surface" style={styles.fieldIcon}>
        {icon}
      </YStack>
      <Input
        flex={1}
        unstyled
        fontFamily="$body"
        fontSize="$md"
        color="$color"
        placeholderTextColor={colorTokens.textSecondary}
        {...inputProps}
      />
    </XStack>
  );
}

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
      <YStack flex={1} justifyContent="center" gap="$6" style={styles.page}>
        <YStack pointerEvents="none" style={styles.glowTopRight} />
        <YStack pointerEvents="none" style={styles.glowBottomLeft} />

        <YStack alignItems="center" gap="$4">
          <YStack style={styles.heroBadge}>
            <Image
              source={logoSource}
              style={styles.logo}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </YStack>

          <YStack alignItems="center" gap="$2">
            <Text fontFamily="$heading" fontSize="$display" color="$color" textAlign="center">
              Prezio
            </Text>
            <Text
              fontFamily="$body"
              fontSize="$sm"
              color="$colorSecondary"
              textAlign="center"
              maxWidth={260}
            >
              Tu aliado en cada compra
            </Text>
            <Text
              fontFamily="$body"
              fontSize="$sm"
              color="$colorSecondary"
              textAlign="center"
              maxWidth={300}
            >
              Iniciá sesión para seguir tus listas, comparar precios y volver más rápido a lo que
              necesitás.
            </Text>
          </YStack>
        </YStack>

        <YStack
          gap="$4"
          backgroundColor="$surface"
          borderColor="$borderColor"
          borderWidth={1}
          borderRadius="$6"
          padding="$4"
          style={styles.formCard}
        >
          <YStack gap="$3">
            <AuthField
              icon={
                <IconMail
                  color={colorTokens.textSecondary}
                  size={20}
                  strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                />
              }
              placeholder="Correo electrónico"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <AuthField
              icon={
                <IconLock
                  color={colorTokens.textSecondary}
                  size={20}
                  strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                />
              }
              placeholder="Contraseña"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

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
              pressStyle={primaryPressStyle}
              borderRadius="$4"
              height={56}
            >
              <Text fontFamily="$heading" fontSize="$md" color="$white">
                Iniciar sesión
              </Text>
            </Button>

            <XStack alignItems="center" gap="$3">
              <Separator flex={1} borderColor="$borderColor" />
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                o
              </Text>
              <Separator flex={1} borderColor="$borderColor" />
            </XStack>

            <Button
              onPress={handleGoogleLogin}
              disabled={isSubmitting}
              opacity={isSubmitting ? 0.7 : 1}
              backgroundColor="$background"
              borderColor="$borderColor"
              borderWidth={1}
              borderRadius="$4"
              height={54}
              icon={
                <GoogleBrandIcon width={20} height={20} />
              }
            >
              <Text fontFamily="$body" fontSize="$sm" color="$color">
                Continuar con Google
              </Text>
            </Button>
          </YStack>
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
            pressStyle={subtlePressStyle}
          >
            Registrate
          </Text>
        </XStack>
      </YStack>
    </ScreenContainer>
  );
}
