// @tabler/icons-react-native ships one module per icon under subpath exports
// (e.g. '@tabler/icons-react-native/IconBarcode'); its package.json "exports"
// map only declares "import"/"require" conditions, which TS's "bundler"
// resolution + "customConditions": ["react-native"] combo (set by
// @react-native/typescript-config) doesn't always pick up cleanly. This
// ambient wildcard declaration covers every icon subpath with the shape each
// icon component actually has (see createReactNativeComponent.mjs upstream).
declare module '@tabler/icons-react-native/*' {
  import type { ComponentType } from 'react';
  import type { SvgProps } from 'react-native-svg';

  export interface TablerIconProps extends Omit<SvgProps, 'width' | 'height'> {
    size?: number;
    color?: string;
    strokeWidth?: number;
    title?: string;
  }

  const Icon: ComponentType<TablerIconProps>;
  export default Icon;
}
