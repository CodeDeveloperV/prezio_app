import { forwardRef, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, type TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Input, Separator, Text, XStack, YStack } from 'tamagui';

import { ScreenContainer } from '../../../shared/components/ScreenContainer';
import { GoogleBrandIcon } from '../../../shared/components/GoogleBrandIcon';
import { showAuthErrorToast } from '../services/authToast';
import { useGoogleLoginMutation, useLoginMutation } from '../hooks/useAuthMutations';
import { signInWithGoogle } from '../services/googleSignIn';
import {
  DEFAULT_ICON_STROKE_WIDTH,
  IconEye,
  IconEyeOff,
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
    backgroundColor: colorTokens.primary,
    opacity: 0.08,
  },
  glowBottomLeft: {
    position: 'absolute',
    left: -90,
    bottom: 120,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: colorTokens.textPrimary,
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
    shadowColor: colorTokens.textPrimary,
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
    shadowColor: colorTokens.textPrimary,
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
  fieldTrailingIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const AuthField = forwardRef<
  TextInput,
  {
    icon: ReactNode;
    trailing?: ReactNode;
    onTrailingPress?: () => void;
    trailingAccessibilityLabel?: string;
  } & ComponentProps<typeof Input>
>(function AuthFieldInner(
  { icon, trailing, onTrailingPress, trailingAccessibilityLabel, ...inputProps },
  ref,
) {
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
        ref={ref}
        flex={1}
        unstyled
        fontFamily="$body"
        fontSize="$md"
        color="$color"
        placeholderTextColor={colorTokens.textSecondary}
        {...inputProps}
      />
      {trailing ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={trailingAccessibilityLabel}
          hitSlop={8}
          onPress={onTrailingPress}
          style={styles.fieldTrailingIcon}
        >
          {trailing}
        </Pressable>
      ) : null}
    </XStack>
  );
});

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const passwordInputRef = useRef<TextInput>(null);

  const loginMutation = useLoginMutation();
  const googleLoginMutation = useGoogleLoginMutation();

  const handleLogin = () => {
    loginMutation.mutate(
      { email, password },
      {
        onError: () =>
          showAuthErrorToast({
            title: 'No pudimos iniciar sesión',
            message: 'Revisá tus datos e intentá de nuevo.',
          }),
      },
    );
  };

  const handleGoogleLogin = async () => {
    try {
      const idToken = await signInWithGoogle();
      googleLoginMutation.mutate(idToken, {
        onError: () =>
          showAuthErrorToast({
            title: 'No pudimos continuar con Google',
            message: 'Intentá de nuevo en unos segundos.',
          }),
      });
    } catch {
      showAuthErrorToast({
        title: 'No pudimos continuar con Google',
        message: 'Revisá tu conexión e intentá de nuevo.',
      });
    }
  };

  const isSubmitting = loginMutation.isPending || googleLoginMutation.isPending;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

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
            <Text
              fontFamily="$heading"
              fontSize="$xxl"
              fontWeight="700"
              color="$color"
              textAlign="center"
            >
              Prezio
            </Text>
            <Text
              fontFamily="$body"
              fontSize="$sm"
              color="$colorSecondary"
              textAlign="center"
              maxWidth={280}
            >
              Iniciá sesión para seguir tus listas y comparar precios más rápido.
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
              accessibilityLabel="Correo electrónico"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              blurOnSubmit={false}
              value={email}
              onChangeText={setEmail}
            />

            <AuthField
              ref={passwordInputRef}
              icon={
                <IconLock
                  color={colorTokens.textSecondary}
                  size={20}
                  strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                />
              }
              placeholder="Contraseña"
              accessibilityLabel="Contraseña"
              secureTextEntry={!isPasswordVisible}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSubmit) {
                  handleLogin();
                }
              }}
              value={password}
              onChangeText={setPassword}
              trailing={
                isPasswordVisible ? (
                  <IconEyeOff
                    color={colorTokens.textSecondary}
                    size={20}
                    strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                  />
                ) : (
                  <IconEye
                    color={colorTokens.textSecondary}
                    size={20}
                    strokeWidth={DEFAULT_ICON_STROKE_WIDTH}
                  />
                )
              }
              onTrailingPress={() => setIsPasswordVisible((visible) => !visible)}
              trailingAccessibilityLabel={
                isPasswordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'
              }
            />
          </YStack>

          <YStack gap="$3">
            <Button
              onPress={handleLogin}
              disabled={!canSubmit}
              opacity={canSubmit ? 1 : 0.7}
              backgroundColor="$primary"
              pressStyle={primaryPressStyle}
              borderRadius="$4"
              height={56}
              width="92%"
              alignSelf="center"
            >
              {loginMutation.isPending ? (
                <ActivityIndicator color={colorTokens.white} />
              ) : (
                <Text fontFamily="$heading" fontSize="$md" color="$white">
                  Iniciar sesión
                </Text>
              )}
            </Button>

            <XStack alignItems="center" gap="$3">
              <Separator flex={1} borderColor="$borderColor" />
              <Text fontFamily="$body" fontSize="$xs" color="$colorSecondary">
                o continúa con
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
                googleLoginMutation.isPending ? undefined : (
                  <GoogleBrandIcon width={20} height={20} />
                )
              }
            >
              {googleLoginMutation.isPending ? (
                <ActivityIndicator color={colorTokens.textPrimary} />
              ) : (
                <Text fontFamily="$body" fontSize="$sm" color="$color">
                  Continuar con Google
                </Text>
              )}
            </Button>
          </YStack>
        </YStack>

        <XStack justifyContent="center" gap="$1">
          <Text fontFamily="$body" fontSize="$sm" color="$colorSecondary">
            ¿No tenés cuenta?
          </Text>
          <Text
            onPress={() => navigation.navigate('Register')}
            accessibilityRole="button"
            accessibilityLabel="Registrate, crear una cuenta nueva"
            hitSlop={8}
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
