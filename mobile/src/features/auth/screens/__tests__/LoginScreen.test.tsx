import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider } from 'tamagui';

import tamaguiConfig from '../../../../app/theme/tamagui.config';
import { LoginScreen } from '../LoginScreen';
import { useGoogleLoginMutation, useLoginMutation } from '../../hooks/useAuthMutations';
import { signInWithGoogle } from '../../services/googleSignIn';
import { showAuthErrorToast } from '../../services/authToast';

jest.mock('../../hooks/useAuthMutations', () => ({
  useLoginMutation: jest.fn(),
  useGoogleLoginMutation: jest.fn(),
}));
jest.mock('../../services/googleSignIn', () => ({ signInWithGoogle: jest.fn() }));
jest.mock('../../services/authToast', () => ({ showAuthErrorToast: jest.fn() }));

const mockedUseLoginMutation = useLoginMutation as jest.Mock;
const mockedUseGoogleLoginMutation = useGoogleLoginMutation as jest.Mock;
const mockedSignInWithGoogle = signInWithGoogle as jest.Mock;
const mockedShowAuthErrorToast = showAuthErrorToast as jest.Mock;

const navigation = { navigate: jest.fn() };
const loginMutate = jest.fn();
const googleMutate = jest.fn();

function renderScreen() {
  let renderer: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
        <LoginScreen navigation={navigation as never} route={{} as never} />
      </TamaguiProvider>,
    );
  });
  return renderer!;
}

function pressButton(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  const button = renderer.root.find((node) => {
    const text = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
    return node.props.onPress && text.some((child) => child?.props?.children === label);
  });
  button.props.onPress();
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseLoginMutation.mockReturnValue({ mutate: loginMutate, isPending: false });
  mockedUseGoogleLoginMutation.mockReturnValue({ mutate: googleMutate, isPending: false });
  mockedSignInWithGoogle.mockResolvedValue('google-id-token');
});

test('submits email and password only once while the request is in flight', () => {
  const renderer = renderScreen();
  const [emailInput] = renderer.root.findAllByProps({ accessibilityLabel: 'Correo electrónico' });
  const [passwordInput] = renderer.root.findAllByProps({ accessibilityLabel: 'Contraseña' });

  ReactTestRenderer.act(() => {
    emailInput.props.onChangeText('ana@example.com');
    passwordInput.props.onChangeText('secret123');
  });
  ReactTestRenderer.act(() => {
    pressButton(renderer, 'Iniciar sesión');
    pressButton(renderer, 'Iniciar sesión');
  });

  expect(loginMutate).toHaveBeenCalledTimes(1);
  expect(loginMutate).toHaveBeenCalledWith(
    { email: 'ana@example.com', password: 'secret123' },
    expect.objectContaining({ onError: expect.any(Function), onSettled: expect.any(Function) }),
  );
});

test('shows a helpful error when traditional login fails', () => {
  const renderer = renderScreen();
  const [emailInput] = renderer.root.findAllByProps({ accessibilityLabel: 'Correo electrónico' });
  const [passwordInput] = renderer.root.findAllByProps({ accessibilityLabel: 'Contraseña' });

  ReactTestRenderer.act(() => {
    emailInput.props.onChangeText('ana@example.com');
    passwordInput.props.onChangeText('incorrecta');
  });
  ReactTestRenderer.act(() => {
    pressButton(renderer, 'Iniciar sesión');
  });
  loginMutate.mock.calls[0][1].onError();

  expect(mockedShowAuthErrorToast).toHaveBeenCalledWith({
    title: 'No pudimos iniciar sesión',
    message: 'Revisa tus datos e intenta de nuevo.',
  });
});

test('sends the Google ID token to the Google login mutation', async () => {
  const renderer = renderScreen();

  await ReactTestRenderer.act(async () => {
    pressButton(renderer, 'Continuar con Google');
  });

  expect(mockedSignInWithGoogle).toHaveBeenCalledTimes(1);
  expect(googleMutate).toHaveBeenCalledWith(
    'google-id-token',
    expect.objectContaining({ onError: expect.any(Function), onSettled: expect.any(Function) }),
  );
});

test('shows a helpful error when Google Sign-In cannot return a token', async () => {
  mockedSignInWithGoogle.mockRejectedValueOnce(new Error('cancelled'));
  const renderer = renderScreen();

  await ReactTestRenderer.act(async () => {
    pressButton(renderer, 'Continuar con Google');
  });

  expect(mockedShowAuthErrorToast).toHaveBeenCalledWith({
    title: 'No pudimos continuar con Google',
    message: 'Revisa tu conexión e intenta de nuevo.',
  });
});
