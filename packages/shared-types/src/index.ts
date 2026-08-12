// Shared contract types between the Prezio backend (FastAPI) and mobile client (React Native).
// Field names/casing mirror the actual backend Pydantic schemas verbatim (snake_case on the
// wire — there is no camelCase alias_generator configured) — keep in sync with
// backend/app/features/*/schemas.py, not the SQLAlchemy models.
// IDs are DB autoincrement integers, not UUIDs.

export type ISODateTime = string;

export interface User {
  id: number;
  email: string;
  is_active: boolean;
}

export interface UserProfile {
  id: number;
  user_id: number;
  display_name: string | null;
  avatar_url: string | null;
}

// POST /auth/register, /auth/login, /auth/login/google, /auth/refresh all return this shape.
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface GoogleLoginRequest {
  id_token: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

export interface LogoutRequest {
  refresh_token: string;
}

export interface Store {
  id: number;
  name: string;
  country: string;
}

export interface StoreBranch {
  id: number;
  store_id: number;
  name: string;
  city: string;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface Brand {
  id: number;
  name: string;
}

// The canonical identity of a product. Deliberately has no barcode or price of its own — a
// barcode is one of possibly several labels that resolve to this identity (see ProductBarcode)
// and a price is store-specific (see StoreProductRead) — neither uniquely identifies the product.
export type RecognitionType = 'manual' | 'barcode' | 'alias' | 'image';

// Uniform moderation lifecycle shared by Product, ProductBarcode, ProductAlias and
// ProductMerge — a single vocabulary for every reviewable catalog entity.
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'merged';

export interface Product {
  id: number;
  canonical_name: string;
  brand_id: number | null;
  category_id: number | null;
  presentation: string | null;
  description: string | null;
  image_url: string | null;
  recognition_type: RecognitionType;
  status: ModerationStatus;
  reviewed_by: number | null;
  reviewed_at: ISODateTime | null;
  created_by: number | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export type BarcodeType = 'ean13' | 'ean8' | 'upc_a' | 'upc_e' | 'internal_plu' | 'store_sku' | 'other';
export type BarcodeSource = 'user_scan' | 'store_import' | 'admin' | 'scraped';

// All known barcodes for a Product. The same barcode string can legitimately identify different
// products in different stores/countries, so uniqueness is scoped to (barcode, store_id).
export interface ProductBarcode {
  id: number;
  product_id: number;
  barcode: string;
  barcode_type: BarcodeType;
  store_id: number | null;
  country: string | null;
  source: BarcodeSource;
  confidence: number;
  status: ModerationStatus;
  reviewed_by: number | null;
  reviewed_at: ISODateTime | null;
  created_by: number | null;
  created_at: ISODateTime;
}

// A user-submitted alternate name for a Product — feeds search/matching, never an identity key.
export interface ProductAlias {
  id: number;
  product_id: number;
  alias: string;
  language: string;
  confidence: number;
  status: ModerationStatus;
  reviewed_by: number | null;
  reviewed_at: ISODateTime | null;
  created_by: number | null;
  created_at: ISODateTime;
}

// A proposal to fuse a duplicate `source_product_id` into the canonical `target_product_id`.
// Approving it (moderator-only) migrates its barcodes/aliases/prices/history onto the target
// and marks the source Product MERGED; this row is the permanent audit trail of the merge.
export interface ProductMerge {
  id: number;
  source_product_id: number;
  target_product_id: number;
  status: ModerationStatus;
  reason: string | null;
  proposed_by: number | null;
  reviewed_by: number | null;
  reviewed_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface ProposeProductMergeRequest {
  source_product_id: number;
  target_product_id: number;
  reason?: string;
}

export interface MoveBarcodeRequest {
  target_product_id: number;
}

export interface MoveAliasRequest {
  target_product_id: number;
}

// --- Barcode scan / recognition flow ----------------------------------------------

export interface ScanBarcodeRequest {
  barcode: string;
  barcode_type?: BarcodeType;
  store_branch_id: number;
  country?: string | null;
  // Hints used only to search for candidates when the barcode is unknown -- none of these
  // identify the product on their own, they only feed the matcher's scoring.
  name_hint?: string | null;
  brand_id?: number | null;
  category_id?: number | null;
  presentation?: string | null;
  image_url?: string | null; // reserved for future image-similarity matching
}

// Just what the scan-result screen needs to render a match: image, brand, name,
// presentation -- price/updated_at come from the sibling store_product.
export interface ScanProductDetails {
  id: number;
  canonical_name: string;
  brand_name: string | null;
  presentation: string | null;
  image_url: string | null;
  status: ModerationStatus;
}

export interface ScanFoundResult {
  status: 'found';
  // Lets the client call POST /catalog/barcodes/{barcode_id}/report ("Producto incorrecto").
  barcode_id: number;
  product: ScanProductDetails;
  store_product: StoreProductRead | null;
}

export interface ProductMatchCandidate {
  product: Product;
  score: number;
  matched_on: string[];
}

export interface ScanNeedsDisambiguationResult {
  status: 'needs_disambiguation';
  candidates: ProductMatchCandidate[];
}

export interface ScanNotFoundResult {
  status: 'not_found';
}

export type ScanResult = ScanFoundResult | ScanNeedsDisambiguationResult | ScanNotFoundResult;

// Attaches an already-scanned barcode to an existing Product the user picked from the
// disambiguation list -- never creates or mutates a Product.
export interface AttachBarcodeRequest {
  barcode: string;
  barcode_type?: BarcodeType;
  store_id?: number | null;
  country?: string | null;
}

// Fields collected when no candidate matched the scanned barcode. The resulting Product is
// created with status PENDING; the scanned barcode is attached automatically.
export interface CreateProductRequest {
  image_url: string;
  canonical_name: string;
  brand_id?: number | null;
  brand_name?: string | null;
  presentation?: string | null;
  category_id: number;
  barcode: string;
  barcode_type?: BarcodeType;
  store_id?: number | null;
  country?: string | null;
}

// POST /catalog/barcodes/{id}/report ("Producto incorrecto") -- no request body, any
// authenticated user. Response is ProductBarcode with status: 'rejected'. Excluding rejected
// barcodes from lookup means the next scan of the same barcode falls through to disambiguation.

export type Availability = 'in_stock' | 'out_of_stock' | 'unknown' | 'discontinued';

// version drives optimistic concurrency: price updates must send the last-seen
// version; a mismatch means the server's price already moved (see PriceConflictResponse).
export interface StoreProductRead {
  id: number;
  store_branch_id: number;
  product_id: number;
  current_price: number;
  currency: string;
  version: number;
  availability: Availability;
  last_verified_at: ISODateTime | null;
  last_verified_by: number | null;
}

// POST /pricing/store-products/{id}/confirm response ("✓ Coincide") — the returned
// StoreProductRead has its last_verified_at/by refreshed but version/current_price unchanged.
// GET /pricing/store-products/{id}/history response is PriceHistoryRead[], newest first.

export interface PriceHistoryRead {
  id: number;
  store_product_id: number;
  previous_price: number | null;
  new_price: number;
  updated_by: number | null;
  updated_at: ISODateTime;
}

export interface PriceUpdateRequest {
  price: number;
  version: number;
}

// Returned with HTTP 409 when the submitted version is stale — client should
// adopt this price/version and let the user decide whether to retry.
export interface PriceConflictResponse {
  detail: string;
  current_price: number;
  version: number;
}

export interface ShoppingList {
  id: number;
  owner_user_id: number;
  name: string;
}

export interface ShoppingListCreate {
  name: string;
}

export interface ShoppingListItem {
  id: number;
  shopping_list_id: number;
  product_id: number;
  quantity: number;
  checked: boolean;
  added_by: number;
}

export interface ShoppingListItemCreate {
  product_id: number;
  quantity?: number;
}

// WebSocket event pushed to clients subscribed to a store_product_id topic on /pricing/ws.
export interface PriceUpdateEvent {
  type: 'price_update';
  store_product_id: number;
  price: number;
  version: number;
}
