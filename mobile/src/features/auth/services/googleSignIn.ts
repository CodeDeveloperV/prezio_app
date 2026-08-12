import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { GOOGLE_WEB_CLIENT_ID } from '../../../shared/services/api/config';

let configured = false;

function ensureConfigured() {
  if (configured) {
    return;
  }

  // `webClientId` (not the Android client ID) is what makes GoogleSignin
  // return an ID token whose audience the backend can verify — this MUST
  // match the OAuth 2.0 Web client configured in Google Cloud Console.
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Runs the native Google Sign-In flow and returns the Google ID token to send
 * to POST /auth/login/google.
 *
 * PENDING MANUAL STEP: this only works once real Android native config
 * (google-services.json + SHA-1 fingerprint registered in Google Cloud
 * Console) and a real GOOGLE_WEB_CLIENT_ID are in place. See final report.
 */
export async function signInWithGoogle(): Promise<string> {
  ensureConfigured();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();

  if (!response.data?.idToken) {
    throw new Error('Google Sign-In did not return an ID token.');
  }

  return response.data.idToken;
}
