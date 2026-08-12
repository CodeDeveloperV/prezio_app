import { httpClient } from '../../../shared/services/api/httpClient';

import type {
  GoogleLoginRequest,
  LoginRequest,
  LogoutRequest,
  RefreshRequest,
  RegisterRequest,
  TokenResponse,
  User,
} from '@prezio/shared-types';

export interface AuthCredentials {
  email: string;
  password: string;
}

// POST /auth/register, /auth/login, /auth/login/google, /auth/refresh all
// return a flat TokenResponse (no combined user/tokens envelope). Fetch the
// user separately via GET /users/me (see getCurrentUser below).
export function register(credentials: AuthCredentials): Promise<TokenResponse> {
  const body: RegisterRequest = credentials;
  return httpClient.post('auth/register', { json: body }).json<TokenResponse>();
}

export function login(credentials: AuthCredentials): Promise<TokenResponse> {
  const body: LoginRequest = credentials;
  return httpClient.post('auth/login', { json: body }).json<TokenResponse>();
}

export function loginWithGoogle(idToken: string): Promise<TokenResponse> {
  const body: GoogleLoginRequest = { id_token: idToken };
  return httpClient.post('auth/login/google', { json: body }).json<TokenResponse>();
}

export function refresh(refreshToken: string): Promise<TokenResponse> {
  const body: RefreshRequest = { refresh_token: refreshToken };
  return httpClient.post('auth/refresh', { json: body }).json<TokenResponse>();
}

export function logout(refreshToken: string): Promise<void> {
  const body: LogoutRequest = { refresh_token: refreshToken };
  return httpClient.post('auth/logout', { json: body }).then(() => undefined);
}

// GET /users/me — protected, requires Authorization: Bearer <access_token>.
// Call this right after login/register succeeds, or during session bootstrap
// once tokens are restored from the keychain.
export function getCurrentUser(): Promise<User> {
  return httpClient.get('users/me').json<User>();
}
