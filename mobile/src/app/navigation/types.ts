import type { NavigatorScreenParams } from '@react-navigation/native';
import type {
  BarcodeType,
  ProductMatchCandidate,
  ScanPriceOffer,
  ScanProductDetails,
  ShoppingListComparisonResult,
  StoreProductRead,
} from '@prezio/shared-types';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  NewPurchase: NavigatorScreenParams<ShoppingSessionStackParamList> | undefined;
  Comparator: undefined;
  History: undefined;
  // Undefined navigates to the tab's initial screen (Profile); passing { screen: 'X' } opens a
  // specific nested screen (e.g. the Dashboard "Ver estadísticas" CTA opening Analytics).
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
};

// Nested stack rendered inside the "Comparator" tab: pick a shopping list + city, then show
// the per-branch totals returned by POST /comparison/shopping-lists/{id}/compare.
export type ComparisonStackParamList = {
  ComparatorSetup: undefined;
  ComparatorResult: { result: ShoppingListComparisonResult };
};

// Nested stack rendered inside the "NewPurchase" tab: open the camera first, optionally with
// a branch context, then resolve a barcode to an existing product or fall through to
// disambiguation/creation.
export type ShoppingSessionStackParamList = {
  BranchSelect: { pendingScan?: ScanResultProductContext } | undefined;
  Scan: { storeBranchId?: number } | undefined;
  ScanResult: ScanResultProductContext & {
    storeBranchId?: number | null;
    priceOffers?: ScanPriceOffer[];
  };
  ScanDisambiguation: {
    storeBranchId?: number | null;
    barcode: string;
    barcodeType: BarcodeType;
    candidates: ProductMatchCandidate[];
  };
  CreateProduct: {
    storeBranchId?: number | null;
    barcode: string;
    barcodeType: BarcodeType;
  };
  PriceHistory: { storeProductId: number };
  PriceUpdate: { storeProductId: number; currentPrice: string; version: number };
  CreateAlert: { productId: number; productName: string; storeBranchId?: number | null };
};

export type ScanResultProductContext = {
  barcodeId?: number | null;
  product: ScanProductDetails;
  storeProduct: StoreProductRead | null;
  priceOffers?: ScanPriceOffer[];
  fromSearch?: boolean;
  // True when this result came from the offline cache (Epic 14) instead of a live lookup --
  // gates the online-only actions (confirm match, price update, report, alerts) and shows the
  // price as a snapshot rather than a guaranteed-current value.
  fromCache?: boolean;
};

// Nested stack rendered inside the "Profile" tab: the profile screen itself plus the
// alerts/notifications inbox screens it links out to.
export type ProfileStackParamList = {
  Profile: undefined;
  Alerts: undefined;
  Notifications: undefined;
  ShoppingLists: undefined;
  // Local WatermelonDB id (Epic 14 offline mode) -- may not have a server_id yet if the list was
  // created offline and hasn't synced.
  ShoppingListDetail: { shoppingListId: string; shoppingListName: string };
  // Invites are online-only, so this is always the backend's numeric id (see ShoppingListDetailScreen).
  InviteMember: { shoppingListId: number };
  ShoppingListInvitations: undefined;
  // Setting the active branch is online-only (needs the backend's numeric id) but the result is
  // written back onto the local WatermelonDB record, so both ids travel together.
  SetActiveBranch: { shoppingListId: number; shoppingListLocalId: string };
  Analytics: undefined;
};
