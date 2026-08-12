import type {
  BarcodeType,
  ProductMatchCandidate,
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
  NewPurchase: undefined;
  Comparator: undefined;
  History: undefined;
  Profile: undefined;
};

// Nested stack rendered inside the "Comparator" tab: pick a shopping list + city, then show
// the per-branch totals returned by POST /comparison/shopping-lists/{id}/compare.
export type ComparisonStackParamList = {
  ComparatorSetup: undefined;
  ComparatorResult: { result: ShoppingListComparisonResult };
};

// Nested stack rendered inside the "NewPurchase" tab: pick a branch, scan a barcode, then
// either resolve to an existing product or fall through to disambiguation/creation.
export type ShoppingSessionStackParamList = {
  BranchSelect: undefined;
  Scan: { storeBranchId: number };
  ScanResult: {
    storeBranchId: number;
    barcodeId: number;
    product: ScanProductDetails;
    storeProduct: StoreProductRead | null;
  };
  ScanDisambiguation: {
    storeBranchId: number;
    barcode: string;
    barcodeType: BarcodeType;
    candidates: ProductMatchCandidate[];
  };
  CreateProduct: {
    storeBranchId: number;
    barcode: string;
    barcodeType: BarcodeType;
  };
  PriceHistory: { storeProductId: number };
  PriceUpdate: { storeProductId: number; currentPrice: string; version: number };
};
