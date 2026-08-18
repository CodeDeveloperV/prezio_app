import Config from 'react-native-config';

/**
 * Environment configuration, sourced from `.env` (see env.template) via
 * react-native-config. Falls back to the Android emulator loopback address
 * so the app is still runnable before a `.env` file is created locally.
 */
export const API_BASE_URL = Config.API_BASE_URL ?? 'http://10.0.2.2:8000';
export const WS_BASE_URL = Config.WS_BASE_URL ?? 'ws://10.0.2.2:8000/shopping-lists/ws';
export const GOOGLE_WEB_CLIENT_ID = Config.GOOGLE_WEB_CLIENT_ID ?? '';
