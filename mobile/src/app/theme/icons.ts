/**
 * Central re-export of the Tabler outline icons used across Prezio, so every
 * screen imports from a single place and stays visually consistent.
 * Each icon is imported from its own subpath (not the package barrel) to
 * keep Metro from pulling every one of Tabler's ~5k icon modules into the
 * bundle graph.
 */
import { brand } from './tokens';

export { default as IconBarcode } from '@tabler/icons-react-native/IconBarcode';
export { default as IconScan } from '@tabler/icons-react-native/IconScan';
export { default as IconShoppingCart } from '@tabler/icons-react-native/IconShoppingCart';
export { default as IconWallet } from '@tabler/icons-react-native/IconWallet';
export { default as IconUser } from '@tabler/icons-react-native/IconUser';
export { default as IconHome2 } from '@tabler/icons-react-native/IconHome2';
export { default as IconHistory } from '@tabler/icons-react-native/IconHistory';
export { default as IconChartLine } from '@tabler/icons-react-native/IconChartLine';
export { default as IconPlus } from '@tabler/icons-react-native/IconPlus';
export { default as IconChevronRight } from '@tabler/icons-react-native/IconChevronRight';
export { default as IconBuildingStore } from '@tabler/icons-react-native/IconBuildingStore';
export { default as IconReceipt } from '@tabler/icons-react-native/IconReceipt';
export { default as IconMail } from '@tabler/icons-react-native/IconMail';
export { default as IconLock } from '@tabler/icons-react-native/IconLock';
export { default as IconEye } from '@tabler/icons-react-native/IconEye';
export { default as IconEyeOff } from '@tabler/icons-react-native/IconEyeOff';
export { default as IconBrandGoogleFilled } from '@tabler/icons-react-native/IconBrandGoogleFilled';
export { default as IconCheck } from '@tabler/icons-react-native/IconCheck';
export { default as IconX } from '@tabler/icons-react-native/IconX';
export { default as IconFlag } from '@tabler/icons-react-native/IconFlag';
export { default as IconEdit } from '@tabler/icons-react-native/IconEdit';
export { default as IconScale } from '@tabler/icons-react-native/IconScale';
export { default as IconMapPin } from '@tabler/icons-react-native/IconMapPin';
export { default as IconAlertTriangle } from '@tabler/icons-react-native/IconAlertTriangle';
export { default as IconBell } from '@tabler/icons-react-native/IconBell';
export { default as IconBellRinging } from '@tabler/icons-react-native/IconBellRinging';
export { default as IconTrash } from '@tabler/icons-react-native/IconTrash';
export { default as IconPower } from '@tabler/icons-react-native/IconPower';
export { default as IconUsers } from '@tabler/icons-react-native/IconUsers';
export { default as IconUserPlus } from '@tabler/icons-react-native/IconUserPlus';
export { default as IconCrown } from '@tabler/icons-react-native/IconCrown';
export { default as IconWifi } from '@tabler/icons-react-native/IconWifi';
export { default as IconWifiOff } from '@tabler/icons-react-native/IconWifiOff';
export { default as IconClock } from '@tabler/icons-react-native/IconClock';
export { default as IconMinus } from '@tabler/icons-react-native/IconMinus';
export { default as IconRefresh } from '@tabler/icons-react-native/IconRefresh';
export { default as IconChartBar } from '@tabler/icons-react-native/IconChartBar';
export { default as IconChartPie } from '@tabler/icons-react-native/IconChartPie';
export { default as IconCamera } from '@tabler/icons-react-native/IconCamera';
export { default as IconLibraryPhoto } from '@tabler/icons-react-native/IconLibraryPhoto';
export { default as IconPhotoPlus } from '@tabler/icons-react-native/IconPhotoPlus';
export { default as IconTag } from '@tabler/icons-react-native/IconTag';
export { default as IconCategory } from '@tabler/icons-react-native/IconCategory';

export const DEFAULT_ICON_STROKE_WIDTH = brand.iconography.strokeWidth.regular;
export const SUBTLE_ICON_STROKE_WIDTH = brand.iconography.strokeWidth.subtle;
export const STRONG_ICON_STROKE_WIDTH = brand.iconography.strokeWidth.strong;
