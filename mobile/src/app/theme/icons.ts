/**
 * Central re-export of the Tabler outline icons used across Prezio, so every
 * screen imports from a single place and stays visually consistent.
 * Each icon is imported from its own subpath (not the package barrel) to
 * keep Metro from pulling every one of Tabler's ~5k icon modules into the
 * bundle graph.
 */
export { default as IconBarcode } from '@tabler/icons-react-native/IconBarcode';
export { default as IconScan } from '@tabler/icons-react-native/IconScan';
export { default as IconShoppingCart } from '@tabler/icons-react-native/IconShoppingCart';
export { default as IconWallet } from '@tabler/icons-react-native/IconWallet';
export { default as IconUser } from '@tabler/icons-react-native/IconUser';
export { default as IconHome2 } from '@tabler/icons-react-native/IconHome2';
export { default as IconHistory } from '@tabler/icons-react-native/IconHistory';
export { default as IconPlus } from '@tabler/icons-react-native/IconPlus';
export { default as IconChevronRight } from '@tabler/icons-react-native/IconChevronRight';
export { default as IconBuildingStore } from '@tabler/icons-react-native/IconBuildingStore';
export { default as IconReceipt } from '@tabler/icons-react-native/IconReceipt';
export { default as IconMail } from '@tabler/icons-react-native/IconMail';
export { default as IconLock } from '@tabler/icons-react-native/IconLock';
export { default as IconBrandGoogleFilled } from '@tabler/icons-react-native/IconBrandGoogleFilled';
export { default as IconCheck } from '@tabler/icons-react-native/IconCheck';
export { default as IconX } from '@tabler/icons-react-native/IconX';
export { default as IconFlag } from '@tabler/icons-react-native/IconFlag';
export { default as IconEdit } from '@tabler/icons-react-native/IconEdit';
export { default as IconScale } from '@tabler/icons-react-native/IconScale';
export { default as IconMapPin } from '@tabler/icons-react-native/IconMapPin';
export { default as IconAlertTriangle } from '@tabler/icons-react-native/IconAlertTriangle';

export const DEFAULT_ICON_STROKE_WIDTH = 1.75;
