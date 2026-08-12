// Type augmentation for react-native-config so `Config.API_BASE_URL` etc. are
// typed instead of falling back to `string | undefined` for any key.
import 'react-native-config';

declare module 'react-native-config' {
  export interface NativeConfig {
    API_BASE_URL?: string;
    WS_BASE_URL?: string;
    GOOGLE_WEB_CLIENT_ID?: string;
  }
}
