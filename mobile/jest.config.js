// Packages that ship as ESM (or RN-specific syntax) and therefore need to be
// transformed by babel-jest instead of being skipped like regular node_modules.
const TRANSFORM_ALLOWLIST = [
  '(jest-)?react-native',
  '@react-native(-community)?',
  '@react-navigation',
  'react-native-.*',
  '@react-native-google-signin/.*',
  '@tamagui/.*',
  'tamagui',
  '@tabler/.*',
  '@nozbe/watermelondb',
  'ky',
].join('|');

module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [`node_modules/(?!(${TRANSFORM_ALLOWLIST})/)`],
  setupFiles: ['react-native-gesture-handler/jestSetup'],
};
