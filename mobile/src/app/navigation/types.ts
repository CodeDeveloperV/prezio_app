import type {
  BarcodeType,
  ProductMatchCandidate,
  ScanProductDetails,
  StoreProductRead,
} from '@prezio/shared-types';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  NewPurchase: undefined;
  History: undefined;
  Profile: undefined;
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
