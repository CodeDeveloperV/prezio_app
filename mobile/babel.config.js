module.exports = (api) => {
  const isTest = api.env('test');

  return {
    presets: ['module:@react-native/babel-preset'],
    plugins: [
      // Legacy decorators, required by WatermelonDB's @field/@date/@children API.
      // Must run before the class-properties transform in the RN preset picks
      // up the same class fields, so it's listed first.
      ['@babel/plugin-proposal-decorators', { legacy: true }],
      // Skipped under Jest: @tamagui/babel-plugin is a compile-time style
      // extraction optimization only (not needed for correctness), and it
      // transitively requires `react-dom` (a web-only dep) which breaks
      // under Jest's Node environment.
      !isTest && [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/app/theme/tamagui.config.ts',
          logTimings: true,
        },
      ],
      // react-native-worklets/plugin replaces the legacy react-native-reanimated/plugin
      // starting with Reanimated 4 (which delegates worklet compilation to react-native-worklets).
      // It must remain the last plugin in the list.
      'react-native-worklets/plugin',
    ].filter(Boolean),
  };
};
