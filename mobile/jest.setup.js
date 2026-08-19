/**
 * @format
 */
/* eslint-env jest */

jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock'));

// The barcode scanner bridges to NitroModules on-device. App-level Jest renders only need a
// stable no-op hook; native barcode behavior is exercised on an emulator/device instead.
jest.mock('react-native-vision-camera-barcode-scanner', () => ({
  useBarcodeScannerOutput: () => null,
}));
