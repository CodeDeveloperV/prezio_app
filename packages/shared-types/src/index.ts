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
  created_at: ISODateTime;
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

// GET /stores/branches/{id} -- same shape as StoreBranch plus the parent store's name, so
// callers that only hold a branch id (e.g. ShoppingList.active_store_branch_id) can render a
// "Store - Branch" label without a second round trip to look up the store.
export interface StoreBranchWithStore extends StoreBranch {
  store_name: string;
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
  store_branch_id?: number | null;
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

export interface ScanPriceOffer {
  store_product_id: number;
  store_branch_id: number;
  store_name: string;
  store_branch_name: string;
  current_price: string;
  currency: string;
  availability: Availability;
  last_verified_at: ISODateTime | null;
}

export interface ScanFoundResult {
  status: 'found';
  // Lets the client call POST /catalog/barcodes/{barcode_id}/report ("Producto incorrecto").
  barcode_id: number;
  product: ScanProductDetails;
  store_product: StoreProductRead | null;
  price_offers: ScanPriceOffer[];
}

export interface CatalogSearchResult {
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

export interface ScanConflictResult {
  status: 'conflict';
  candidates: Product[];
  warnings: string[];
}

export type ScanResult = ScanFoundResult | ScanNeedsDisambiguationResult | ScanNotFoundResult | ScanConflictResult;

// Attaches an already-scanned barcode to an existing Product the user picked from the
// disambiguation list -- never creates or mutates a Product.
export interface AttachBarcodeRequest {
  barcode: string;
  barcode_type?: BarcodeType;
  store_id?: number | null;
  country?: string | null;
}

export type ImageUploadContentType = 'image/jpeg' | 'image/png' | 'image/webp';

// POST /catalog/products/image-upload-url -- returns a short-lived presigned S3 PUT URL. Upload
// the image bytes to `upload_url` directly (no Authorization header, not through httpClient),
// then submit the resulting `image_url` in CreateProductRequest.
export interface ImageUploadUrlRequest {
  content_type: ImageUploadContentType;
}

export interface ImageUploadUrlResponse {
  upload_url: string;
  image_url: string;
}

// Fields collected when no candidate matched the scanned barcode. The resulting Product is
// created with status PENDING; the scanned barcode is attached automatically.
export interface CreateProductRequest {
  image_url?: string | null;
  canonical_name: string;
  brand_id?: number | null;
  brand_name?: string | null;
  presentation?: string | null;
  category_id: number;
  barcode: string;
  barcode_type?: BarcodeType;
  store_id?: number | null;
  country?: string | null;
  // When present, the new product is also listed in this branch at the observed shelf price.
  store_branch_id?: number | null;
  initial_price?: number;
  // null means exempt/not taxed. Rates are country-scoped and come from GET /pricing/tax-rates.
  tax_rate_id?: number | null;
}

// POST /catalog/barcodes/{id}/report ("Producto incorrecto") -- no request body, any
// authenticated user. Response is ProductBarcode with status: 'rejected'. Excluding rejected
// barcodes from lookup means the next scan of the same barcode falls through to disambiguation.

export type Availability = 'in_stock' | 'out_of_stock' | 'unknown' | 'discontinued';

// Who originated a PriceHistory entry -- lets the UI distinguish "reportado por la comunidad"
// (mobile/crowdsourced) from "confirmado por el supermercado" (B2B portal, see Fase 10.6 below).
export type PriceUpdateSource = 'community' | 'merchant' | 'system';

// version drives optimistic concurrency: price updates must send the last-seen
// version; a mismatch means the server's price already moved (see PriceConflictResponse).
export interface StoreProductRead {
  id: number;
  store_branch_id: number;
  product_id: number;
  current_price: number;
  tax_rate_id?: number | null;
  currency: string;
  version: number;
  availability: Availability;
  last_verified_at: ISODateTime | null;
  last_verified_by: number | null;
}

export interface TaxRate {
  id: number;
  country: string;
  code: string;
  name: string;
  rate: number;
}

// POST /pricing/store-products/{id}/confirm response ("✓ Coincide") — the returned
// StoreProductRead has its last_verified_at/by refreshed but version/current_price unchanged.
// GET /pricing/store-products/{id}/history response is PriceHistoryRead[], newest first.

// user_id is kept for traceability only — the UI should show display_name ?? email.
export interface PriceHistoryUpdatedByRead {
  user_id: number;
  display_name: string | null;
  email: string;
}

export interface PriceHistoryRead {
  id: number;
  store_product_id: number;
  previous_price: number | null;
  new_price: number;
  updated_by: PriceHistoryUpdatedByRead | null;
  source: PriceUpdateSource;
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

export type ShoppingListStatus = 'active' | 'archived';

export type ShoppingListMemberRole = 'owner' | 'editor';

export type ShoppingListInvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface ShoppingList {
  id: number;
  owner_user_id: number;
  name: string;
  status: ShoppingListStatus;
  created_at: string;
  // The branch this shopping session is currently happening at (Epic 13: personal analytics).
  // Read once per item check-off to snapshot ShoppingListItem.store_branch_id/price_at_check --
  // changing it afterwards never rewrites already-checked items. Null for lists with no active
  // trip selected (e.g. purely collaborative planning lists).
  active_store_branch_id: number | null;
}

export interface ShoppingListCreate {
  name: string;
  client_request_id?: string;
}

// Sets (or, with null, clears) ShoppingList.active_store_branch_id.
export interface ShoppingListActiveBranchUpdate {
  store_branch_id: number | null;
}

export interface ShoppingListItem {
  id: number;
  shopping_list_id: number;
  product_id: number;
  quantity: number;
  checked: boolean;
  added_by: number;
  version: number;
  // Snapshotted server-side the moment `checked` transitions to true (this item's "purchase"
  // signal for the dashboard/analytics, see DashboardSummary/AnalyticsSummary) -- both null
  // again if unchecked.
  checked_at: ISODateTime | null;
  // Decimal on the wire is a string, same convention as PriceAlertRead.target_price.
  price_at_check: string | null;
  // Snapshot of the list's active_store_branch_id at the moment this item was checked -- the
  // real price at that branch, never the cheapest price across any store. Null for items checked
  // before this field existed, or with no active branch selected (see AnalyticsSummary's
  // unattributed_store_count/"Sin tienda registrada" handling).
  store_branch_id: number | null;
  captured_store_product_id?: number | null;
  captured_store_branch_id?: number | null;
  captured_unit_price?: string | null;
  price_captured_at?: ISODateTime | null;
}

export interface ShoppingListItemCreate {
  product_id: number;
  quantity?: number;
  client_request_id?: string;
  captured_store_product_id?: number | null;
  captured_store_branch_id?: number | null;
  captured_unit_price?: string | null;
  price_captured_at?: ISODateTime | null;
}

// Same optimistic-concurrency pattern as pricing's PriceUpdateRequest: submit the version you
// last saw, get a 409 + ShoppingListItemConflictResponse back if it's stale.
export interface ShoppingListItemUpdate {
  version: number;
  quantity?: number;
  checked?: boolean;
}

// Returned with HTTP 409 when the submitted item version is stale.
export interface ShoppingListItemConflictResponse {
  detail: string;
  item: ShoppingListItem;
}

// GET /shopping-lists/{id}/summary is a branch-scoped read model for the active-purchase UI.
// It deliberately stays separate from ShoppingListItem, which is the operational mutation DTO.
export type ShoppingListSummaryItemPricingStatus =
  | 'available'
  | 'missing_product'
  | 'price_unavailable'
  | 'unavailable';

export type ShoppingListSummaryPricingStatus = 'complete' | 'partial' | 'unavailable';

export interface ShoppingListSummaryItem {
  shopping_list_item_id: number;
  product_id: number;
  quantity: number;
  version: number;
  name: string;
  brand: string | null;
  presentation: string | null;
  image_url: string | null;
  store_product_id: number | null;
  current_price: string | null;
  currency: string | null;
  availability: Availability | null;
  pricing_status: ShoppingListSummaryItemPricingStatus;
  unit_price: string | null;
  subtotal: string | null;
}

export interface ShoppingListSummary {
  shopping_list_id: number;
  active_store_branch_id: number | null;
  store_name: string | null;
  branch_name: string | null;
  distinct_products_count: number;
  total_units_count: number;
  priced_subtotal: string | null;
  currency: string | null;
  unpriced_items_count: number;
  pricing_status: ShoppingListSummaryPricingStatus;
  items: ShoppingListSummaryItem[];
}

export interface ShoppingListMember {
  id: number;
  shopping_list_id: number;
  user_id: number;
  role: ShoppingListMemberRole;
  joined_at: string;
}

export interface ShoppingListInvitationCreate {
  invited_email: string;
}

export interface ShoppingListInvitation {
  id: number;
  shopping_list_id: number;
  invited_email: string;
  invited_user_id: number | null;
  invited_by_user_id: number;
  status: ShoppingListInvitationStatus;
  created_at: string;
  responded_at: string | null;
}

// --- Shopping list real-time sync (WS /shopping-lists/ws, channel shopping_list_updates:{id}) --

export type ShoppingListEventType =
  | 'item_added'
  | 'item_updated'
  | 'item_removed'
  | 'member_joined'
  | 'member_left'
  | 'invitation_accepted'
  | 'invitation_declined'
  | 'list_archived';

// Every shopping-list event carries this envelope; `payload` shape depends on `event_type`.
// The backend is the source of truth -- treat this as a cache-invalidation signal and re-fetch
// via TanStack Query on any doubt, not as a second copy of state.
export interface ShoppingListEvent<TPayload = Record<string, unknown>> {
  event_type: ShoppingListEventType;
  shopping_list_id: number;
  entity_id: number | null;
  version: number | null;
  timestamp: string;
  payload: TPayload;
}

export type ShoppingListItemEvent = ShoppingListEvent<ShoppingListItem>;

// Delivered on a personal channel (user_invitations:{user_id}) so an invitee who isn't yet a
// list member can still be notified, without broadcasting the invitation to the whole list.
export interface ShoppingListInvitationCreatedEvent {
  event_type: 'invitation_created';
  shopping_list_id: number;
  entity_id: number;
  version: null;
  timestamp: string;
  payload: {
    invitation_id: number;
    shopping_list_id: number;
    shopping_list_name: string;
    invited_by_user_id: number;
  };
}

// WebSocket event pushed to clients subscribed to a store_product_id topic on /pricing/ws.
export interface PriceUpdateEvent {
  type: 'price_update';
  store_product_id: number;
  price: number;
  version: number;
}

// --- Store comparator (POST /comparison/shopping-lists/{id}/compare) ----------------------

export type ProductComparisonStatus =
  | 'available'
  | 'missing_product'
  | 'price_unavailable'
  | 'stale_price'
  | 'unavailable';

// At least one of `city`/`store_branch_ids` is required; `store_branch_ids` wins when both
// are sent. Reserved for a future `latitude`/`longitude` + `radius_km` pair once the app has
// geolocation -- see backend `CompareShoppingListRequest`.
export interface CompareShoppingListRequest {
  city?: string | null;
  store_branch_ids?: number[] | null;
}

export interface ProductComparisonLine {
  product_id: number;
  product_name: string;
  quantity: number;
  status: ProductComparisonStatus;
  unit_price: number | null;
  subtotal: number | null;
}

export interface BranchComparisonResult {
  store_branch_id: number;
  store_id: number;
  store_name: string;
  branch_name: string;
  city: string;
  currency: string;
  total: number;
  total_known: number;
  found_products_count: number;
  missing_products_count: number;
  price_unavailable_count: number;
  stale_prices_count: number;
  unavailable_products_count: number;
  // Usable-price coverage: AVAILABLE + STALE_PRICE / total_known.
  coverage_percentage: number;
  // Fresh-price coverage: AVAILABLE only / total_known -- stricter than coverage_percentage.
  fresh_coverage_percentage: number;
  has_stale_prices: boolean;
  comparable: boolean;
  savings_vs_most_expensive: number | null;
  lines: ProductComparisonLine[];
}

export interface ShoppingListComparisonResult {
  shopping_list_id: number;
  min_coverage_threshold: number;
  min_fresh_coverage_threshold: number;
  results: BranchComparisonResult[];
  cheapest_comparable_branch_id: number | null;
  most_expensive_comparable_branch_id: number | null;
  estimated_savings: number | null;
}

// --- Price alerts (POST/GET/PATCH/DELETE /alerts) --------------------------------------------

// Scope is layered by how many of store_id/store_branch_id are set: neither means "any branch
// of any chain", store_id alone means "any branch of that chain", store_branch_id means that
// specific branch only. The two are mutually exclusive -- sending both is a 400.
export interface PriceAlertCreateRequest {
  product_id: number;
  target_price: number;
  store_id?: number | null;
  store_branch_id?: number | null;
}

export interface PriceAlertUpdateRequest {
  target_price?: number;
  active?: boolean;
}

// Deliberately no ACTIVE/TRIGGERED enum: `is_below_threshold` is the re-armable
// threshold-crossing state (flips back to false once the price rises back above
// target_price, so the next crossing below notifies again); `active` is an independent on/off
// switch. `target_price` comes back as a string -- the backend schema types it as a Python
// Decimal, which Pydantic serializes as a string on the wire (not a JSON number).
export interface PriceAlertRead {
  id: number;
  user_id: number;
  product_id: number;
  product_name: string;
  store_id: number | null;
  store_branch_id: number | null;
  target_price: string;
  active: boolean;
  is_below_threshold: boolean;
  last_triggered_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// --- Notifications (GET /notifications, PATCH /notifications/...) ----------------------------

// Kept generic on purpose -- the same inbox serves future notification types beyond price
// alerts (collaborative lists, coupons, promotions, system messages).
export type NotificationType = 'price_alert' | 'collaborative_list' | 'coupon' | 'promotion' | 'system';

export interface NotificationRead {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  message: string;
  related_entity_type: string | null;
  related_entity_id: number | null;
  // Only ever set when type === 'price_alert'.
  alert_id: number | null;
  metadata: Record<string, unknown> | null;
  read_at: ISODateTime | null;
  created_at: ISODateTime;
}

export interface MarkAllReadResponse {
  marked_read: number;
}

// --- User budget (PATCH /users/me/budget) -----------------------------------------------------

// null clears the budget (it's optional -- unset means the dashboard doesn't show a
// remaining-budget figure).
export interface UserBudgetUpdate {
  monthly_budget: string | null;
}

export interface UserBudgetRead {
  monthly_budget: string | null;
}

// --- Dashboard (GET /dashboard/summary) -------------------------------------------------------

// "Purchase" here means a shopping_list_item that's been checked -- Prezio has no separate
// purchase/order domain, so checking an item off a shared list is the closest real signal.
export interface MonthlySummary {
  year: number;
  month: number;
  total_spent: string;
  total_savings: string;
}

export interface MostPurchasedProduct {
  product_id: number;
  product_name: string;
  total_quantity: number;
}

export interface LastPurchase {
  item_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price_at_check: string;
  checked_at: ISODateTime;
}

export interface DashboardSummary {
  current_month: MonthlySummary;
  previous_month: MonthlySummary;
  // Oldest first, current month last -- ready to plot on a chart as-is.
  monthly_history: MonthlySummary[];
  most_purchased_products: MostPurchasedProduct[];
  last_purchase: LastPurchase | null;
  monthly_budget: string | null;
  remaining_budget: string | null;
}

// --- Analytics / Estadísticas personales (GET /analytics/summary) ------------------------------
//
// Epic 13. Strictly private -- user_id is always derived from the authenticated request, never a
// client-supplied parameter. Every metric carries a PeriodMeta with data-quality info: Prezio only
// started recording ShoppingListItem.store_branch_id with this epic, so historical purchases may
// have no store attribution (`unattributed_store_count`) and/or no price_at_check
// (`missing_price_count`) -- never inferred or backfilled.

export type AnalyticsPeriod = '30d' | '3m' | '6m' | '12m' | 'all';

export interface PeriodMeta {
  period_start: ISODateTime;
  period_end: ISODateTime;
  sample_size: number;
  coverage_percentage: number;
  missing_price_count: number;
  unattributed_store_count: number;
}

export interface TotalSpend {
  total_spent: string;
  meta: PeriodMeta;
}

export interface StoreSpend {
  store_id: number;
  store_name: string;
  total_spent: string;
  session_count: number;
}

export interface BranchSpend {
  store_branch_id: number;
  store_id: number;
  store_name: string;
  branch_name: string;
  total_spent: string;
  session_count: number;
}

// by_chain is the primary metric ("dónde gasto más" means supermarket, not category);
// by_branch is optional detail. unattributed_spent covers items with no store_branch_id.
export interface SpendByStore {
  by_chain: StoreSpend[];
  by_branch: BranchSpend[];
  unattributed_spent: string;
  unattributed_label: string;
  meta: PeriodMeta;
}

// Defined by purchase-session frequency (distinct shopping-list + calendar-day visits to a
// store), not by item count. store_id/store_name are null if no checked item in the period has
// store attribution.
export interface MostUsedStore {
  store_id: number | null;
  store_name: string | null;
  session_count: number;
  meta: PeriodMeta;
}

export interface CategorySpend {
  category_id: number | null;
  category_name: string;
  total_spent: string;
}

export interface SpendByCategory {
  categories: CategorySpend[];
  meta: PeriodMeta;
}

export interface MonthlySpend {
  year: number;
  month: number;
  total_spent: string;
  // True for the current calendar month if `now` falls before month end -- lets the UI avoid
  // plotting a partial month next to complete ones without saying so.
  is_partial: boolean;
}

export interface MonthlyEvolution {
  // Oldest first, current (possibly partial) month last.
  months: MonthlySpend[];
  meta: PeriodMeta;
}

export interface FavoriteProduct {
  product_id: number;
  product_name: string;
  purchase_count: number;
  total_quantity: number;
}

export interface FavoriteProducts {
  products: FavoriteProduct[];
  meta: PeriodMeta;
}

// A personal, estimated basket-inflation metric -- explicitly NOT the official/national CPI.
// personal_inflation_percentage is null whenever has_sufficient_data is false, rather than
// forcing a misleading number from too little purchase history.
export interface PersonalInflation {
  personal_inflation_percentage: number | null;
  has_sufficient_data: boolean;
  sample_size: number;
  coverage_percentage: number;
  window_months: number;
  older_period_start: ISODateTime;
  older_period_end: ISODateTime;
  recent_period_start: ISODateTime;
  recent_period_end: ISODateTime;
}

export interface AnalyticsSummary {
  total_spend: TotalSpend;
  spend_by_store: SpendByStore;
  most_used_store: MostUsedStore;
  spend_by_category: SpendByCategory;
  monthly_evolution: MonthlyEvolution;
  personal_inflation: PersonalInflation;
  favorite_products: FavoriteProducts;
}

// --- B2B organizations (web-admin portal) ------------------------------------------------------
// "Organization" on the wire is the existing Store row -- there is no separate organizations
// table. Branch access is a scope, not a role: ORGANIZATION_ADMIN implicitly has every branch,
// MANAGER/EMPLOYEE only the branches explicitly granted via branch_ids.

export type OrganizationRole = 'organization_admin' | 'manager' | 'employee';

export type OrganizationMemberStatus = 'active' | 'inactive';

export interface OrganizationRead {
  id: number;
  name: string;
  country: string;
}

export interface OrganizationMemberRead {
  id: number;
  store_id: number;
  user_id: number;
  user_email: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  branch_ids: number[];
  joined_at: ISODateTime;
}

// GET /b2b/memberships/me -- one row per organization the current user belongs to, lets the
// portal show an organization switcher and resolve role/branch scope right after login.
export interface MyMembershipRead {
  organization: OrganizationRead;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  branch_ids: number[];
}

export interface OrganizationMemberInvite {
  email: string;
  role: OrganizationRole;
  branch_ids?: number[];
}

export interface OrganizationMemberUpdate {
  role?: OrganizationRole;
  status?: OrganizationMemberStatus;
  branch_ids?: number[];
}

export interface BranchCreate {
  name: string;
  city: string;
}

export interface BranchUpdate {
  name?: string;
  city?: string;
}

// --- B2B catalog (web-admin portal) --------------------------------------------------------
// Fase 10.5. Read-only global-catalog browsing plus per-branch listing (StoreProduct)
// management for the current organization -- never creates/edits/moderates a Product itself.
// org_status/status here are a tri-state VIEW of the relationship, not a new backend enum:
// NOT_LISTED means no StoreProduct row exists at all for that branch.

export type OrgListingStatus = 'not_listed' | 'active' | 'inactive';

export type StoreProductStatus = 'active' | 'inactive';

export interface CatalogProductSummary {
  id: number;
  canonical_name: string;
  brand_name: string | null;
  presentation: string | null;
  category_name: string | null;
  barcode: string | null;
  image_url: string | null;
  status: ModerationStatus;
  recognition_type: RecognitionType;
  // Count of this organization's branches (within the caller's branch scope) where the
  // listing is currently ACTIVE.
  branches_listed_count: number;
  org_status: OrgListingStatus;
}

export interface BranchListingRead {
  branch_id: number;
  branch_name: string;
  city: string;
  status: OrgListingStatus;
  store_product_id: number | null;
  current_price: string | null;
  currency: string | null;
}

export interface CatalogProductDetail {
  id: number;
  canonical_name: string;
  brand_name: string | null;
  presentation: string | null;
  category_name: string | null;
  barcode: string | null;
  description: string | null;
  image_url: string | null;
  status: ModerationStatus;
  recognition_type: RecognitionType;
  branches: BranchListingRead[];
}

// Idempotent: if a branch already has an ACTIVE listing it's left untouched; an INACTIVE one
// is reactivated (never overwriting its stored price); only a genuinely new listing uses
// initial_price/currency. Never touches price on an already-ACTIVE listing -- see Fase 10.6.
export interface CreateListingRequest {
  branch_ids: number[];
  initial_price: string;
  currency?: string;
}

export interface UpdateListingStatusRequest {
  status: StoreProductStatus;
}

// --- B2B pricing (web-admin portal) ---------------------------------------------------------
// Fase 10.6. Price/availability management for StoreProducts already listed at the
// organization's branches -- never creates/edits a listing itself (see B2B catalog above).
// The portal never exposes 'discontinued' as an availability choice on write (that would blur
// it with listing_status=INACTIVE); Availability itself (already defined above) stays the full
// read-side type since a listing's history can still show it if set some other way.
export type PricingAvailabilityChoice = 'in_stock' | 'out_of_stock' | 'unknown';

export interface PricingListItemRead {
  store_product_id: number;
  branch_id: number;
  branch_name: string;
  product_id: number;
  canonical_name: string;
  brand_name: string | null;
  presentation: string | null;
  category_name: string | null;
  barcode: string | null;
  image_url: string | null;
  current_price: number;
  previous_price: number | null;
  currency: string;
  availability: Availability;
  listing_status: StoreProductStatus;
  version: number;
  last_verified_at: ISODateTime | null;
  updated_at: ISODateTime;
  last_updated_by: PriceHistoryUpdatedByRead | null;
  last_update_source: PriceUpdateSource | null;
}

// PATCH-style: at least one of price/availability must be provided (enforced server-side).
// price is a string on the wire (same convention as CreateListingRequest.initial_price) to
// avoid JS floating-point round-tripping through a Decimal-backed API.
export interface B2BPriceUpdateRequest {
  price?: string;
  availability?: PricingAvailabilityChoice;
  version: number;
}

// Returned with HTTP 409 when submitted_version is stale -- let the user choose to adopt
// current_price/current_availability/current_version (and resubmit) or go back to editing.
export interface B2BPriceConflictRead {
  detail: string;
  store_product_id: number;
  submitted_price: number | null;
  submitted_availability: Availability | null;
  submitted_version: number;
  current_price: number;
  current_availability: Availability | null;
  current_version: number;
}

export interface B2BBatchUpdateItem {
  store_product_id: number;
  price?: string;
  availability?: PricingAvailabilityChoice;
  version: number;
}

export interface B2BBatchUpdateRequest {
  items: B2BBatchUpdateItem[];
}

export interface B2BBatchFailedItem {
  store_product_id: number;
  error: string;
}

// Independent per-item processing -- one item's conflict/failure never blocks the rest of the
// batch (see B2BPricingService.batch_update).
export interface B2BBatchUpdateResponse {
  updated: PricingListItemRead[];
  conflicts: B2BPriceConflictRead[];
  failed: B2BBatchFailedItem[];
}

// Promotions is a domain separate from Pricing -- never mutates StoreProduct.current_price or
// PriceHistory (see backend/app/features/promotions). Only DRAFT/PUBLISHED/CANCELLED are
// persisted; SCHEDULED/ACTIVE/EXPIRED are derived from start_at/end_at at read time.
export type PromotionType = 'percentage_discount' | 'fixed_discount' | 'special_price' | 'buy_x_get_y';

export type PromotionStatus = 'draft' | 'published' | 'cancelled';

export type PromotionDisplayStatus = 'draft' | 'scheduled' | 'active' | 'expired' | 'cancelled';

export interface PromotionCreate {
  name: string;
  description?: string | null;
  type: PromotionType;
  priority?: number | null;
  percentage_value?: string | null;
  fixed_discount_value?: string | null;
  special_price?: string | null;
  buy_quantity?: number | null;
  pay_quantity?: number | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
  branch_ids: number[];
  product_ids: number[];
}

export type PromotionUpdate = PromotionCreate;

export interface PromotionRead {
  id: number;
  store_id: number;
  name: string;
  description: string | null;
  type: PromotionType;
  status: PromotionStatus;
  display_status: PromotionDisplayStatus;
  priority: number;
  percentage_value: string | null;
  fixed_discount_value: string | null;
  special_price: string | null;
  buy_quantity: number | null;
  pay_quantity: number | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
  branch_ids: number[];
  product_ids: number[];
  created_by: number | null;
  updated_by: number | null;
  published_by: number | null;
  published_at: ISODateTime | null;
  cancelled_by: number | null;
  cancelled_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface PromotionListItemRead {
  id: number;
  name: string;
  type: PromotionType;
  status: PromotionStatus;
  display_status: PromotionDisplayStatus;
  priority: number;
  start_at: ISODateTime;
  end_at: ISODateTime;
  branch_ids: number[];
  product_ids: number[];
}

export interface PromotionListRead {
  items: PromotionListItemRead[];
  total: number;
  page: number;
  page_size: number;
}

// Coupon is a domain separate from Promotion (Fase 10.10) -- a new `coupons` table, no FK to
// promotions. A coupon's benefit is conditioned on presenting/using a `code`; eligibility,
// claim, redemption counting, and per-user limits enforcement are NOT built in 10.10 (reserved
// for EPIC 11) -- `max_redemptions_total`/`max_redemptions_per_user` are persisted but not
// enforced or counted here. Only DRAFT/PUBLISHED/CANCELLED are persisted; SCHEDULED/ACTIVE/
// EXPIRED are derived from start_at/end_at at read time, same as Promotion.
export type CouponType = 'percentage_discount' | 'fixed_amount';

export type CouponStatus = 'draft' | 'published' | 'cancelled';

export type CouponDisplayStatus = 'draft' | 'scheduled' | 'active' | 'expired' | 'cancelled';

export interface CouponCreate {
  name: string;
  description?: string | null;
  code: string;
  type: CouponType;
  percentage_value?: string | null;
  fixed_amount_value?: string | null;
  applies_to_entire_purchase: boolean;
  applies_to_all_branches: boolean;
  minimum_purchase_amount?: string | null;
  maximum_discount_amount?: string | null;
  max_redemptions_total?: number | null;
  max_redemptions_per_user?: number | null;
  is_stackable: boolean;
  start_at: ISODateTime;
  end_at: ISODateTime;
  branch_ids: number[];
  product_ids: number[];
}

export type CouponUpdate = CouponCreate;

export interface CouponRead {
  id: number;
  store_id: number;
  name: string;
  description: string | null;
  code: string;
  type: CouponType;
  status: CouponStatus;
  display_status: CouponDisplayStatus;
  percentage_value: string | null;
  fixed_amount_value: string | null;
  applies_to_entire_purchase: boolean;
  applies_to_all_branches: boolean;
  minimum_purchase_amount: string | null;
  maximum_discount_amount: string | null;
  max_redemptions_total: number | null;
  max_redemptions_per_user: number | null;
  is_stackable: boolean;
  start_at: ISODateTime;
  end_at: ISODateTime;
  branch_ids: number[];
  product_ids: number[];
  created_by: number | null;
  updated_by: number | null;
  published_by: number | null;
  published_at: ISODateTime | null;
  cancelled_by: number | null;
  cancelled_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface CouponListItemRead {
  id: number;
  name: string;
  code: string;
  type: CouponType;
  status: CouponStatus;
  display_status: CouponDisplayStatus;
  percentage_value: string | null;
  fixed_amount_value: string | null;
  applies_to_entire_purchase: boolean;
  applies_to_all_branches: boolean;
  max_redemptions_total: number | null;
  max_redemptions_per_user: number | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
  branch_ids: number[];
  product_ids: number[];
  created_by: number | null;
}

export interface CouponListRead {
  items: CouponListItemRead[];
  total: number;
  page: number;
  page_size: number;
}

// Report is a domain fully separate from Promotion/Coupon and from moderation's ProductMerge --
// it models a community-reported data-quality issue (wrong info, barcode, price, availability,
// duplicate, not-sold-here) that an organization's operators triage and resolve (Fase 10.11).
// Individual reports about the same entity+type are never physically merged; the API groups
// them in the read model instead (`group_report_count`/`latest_reported_at`).
export type ReportType =
  | 'incorrect_product_info'
  | 'incorrect_barcode'
  | 'duplicate_product'
  | 'incorrect_price'
  | 'incorrect_availability'
  | 'product_not_sold_here'
  | 'other';

export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';
export type ProductCorrectionKind = 'wrong_product' | 'wrong_name' | 'wrong_brand' | 'wrong_presentation' | 'wrong_image';

export type ReportPriority = 'low' | 'medium' | 'high' | 'critical';

export type ReportResolutionType =
  | 'data_corrected'
  | 'price_updated'
  | 'availability_updated'
  | 'listing_disabled'
  | 'escalated_to_catalog_moderation'
  | 'no_issue_found'
  | 'duplicate_confirmed'
  | 'other';

export interface ReportActivityRead {
  id: number;
  actor_user_id: number | null;
  action: string;
  note: string | null;
  created_at: ISODateTime;
}

export interface ReportRead {
  id: number;
  type: ReportType;
  status: ReportStatus;
  priority: ReportPriority;
  reporter_user_id: number;
  product_id: number | null;
  product_name: string | null;
  store_product_id: number | null;
  store_branch_id: number | null;
  branch_name: string | null;
  barcode: string | null;
  description: string | null;
  reported_value: Record<string, unknown> | null;
  current_value_snapshot: Record<string, unknown> | null;
  assigned_to_user_id: number | null;
  resolution_type: ReportResolutionType | null;
  resolution_note: string | null;
  resolved_by: number | null;
  resolved_at: ISODateTime | null;
  dismissed_by: number | null;
  dismissed_at: ISODateTime | null;
  group_report_count: number;
  first_reported_at: ISODateTime;
  latest_reported_at: ISODateTime;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  activities: ReportActivityRead[];
}

export interface ReportListItemRead {
  id: number;
  type: ReportType;
  status: ReportStatus;
  priority: ReportPriority;
  product_id: number | null;
  product_name: string | null;
  store_product_id: number | null;
  store_branch_id: number | null;
  branch_name: string | null;
  current_price: number | null;
  reported_price: number | null;
  assigned_to_user_id: number | null;
  group_report_count: number;
  latest_reported_at: ISODateTime;
  created_at: ISODateTime;
}

export interface ReportListRead {
  items: ReportListItemRead[];
  total: number;
  page: number;
  page_size: number;
}

export interface ReportSummaryRead {
  open_count: number;
  in_review_count: number;
  high_priority_open_count: number;
  resolved_this_week_count: number;
}

export interface ReportAssignRequest {
  assigned_to_user_id?: number | null;
}

export interface ReportPriorityUpdate {
  priority: ReportPriority;
}

export interface ReportResolveRequest {
  resolution_type: ReportResolutionType;
  resolution_note?: string | null;
}

export interface ReportDismissRequest {
  resolution_note?: string | null;
}

// --- B2B analytics (web-admin portal, GET /b2b/organizations/{id}/analytics/*) ---------------
// Read-only, derived aggregates -- no new persisted tables. Fase 10.12.

export interface BranchCountRead {
  branch_id: number;
  branch_name: string;
  count: number;
}

export interface TypeCountRead {
  type: string;
  count: number;
}

export interface CategoryCountRead {
  category_id: number;
  category_name: string;
  count: number;
}

export interface OverviewRead {
  active_branches: number;
  active_listings: number;
  prices_updated: number;
  prices_updated_previous_period: number | null;
  stale_prices: number;
  out_of_stock: number;
  open_reports: number;
  high_priority_open_reports: number;
  active_promotions: number;
  active_coupons: number;
}

export interface PriceTimeSeriesPointRead {
  bucket_start: ISODateTime;
  changes_count: number;
  increases_count: number;
  decreases_count: number;
}

export interface TopPriceChangeProductRead {
  product_id: number;
  product_name: string;
  store_branch_id: number;
  branch_name: string;
  changes_count: number;
  current_price: number;
  last_updated: ISODateTime;
}

export interface PricingAnalyticsRead {
  granularity: string;
  time_series: PriceTimeSeriesPointRead[];
  increases_count: number;
  decreases_count: number;
  avg_change_percent: number | null;
  median_change_percent: number | null;
  top_products: TopPriceChangeProductRead[];
  stale_prices_by_branch: BranchCountRead[];
}

export interface AvailabilityByBranchRead {
  branch_id: number;
  branch_name: string;
  in_stock: number;
  out_of_stock: number;
  unknown: number;
}

export interface AvailabilityAnalyticsRead {
  in_stock: number;
  out_of_stock: number;
  unknown: number;
  by_branch: AvailabilityByBranchRead[];
  active_listings_by_category: CategoryCountRead[];
}

export interface LifecycleCountsRead {
  active: number;
  scheduled: number;
  expired: number;
  cancelled: number;
}

export interface PromotionsAnalyticsRead {
  counts: LifecycleCountsRead;
  by_branch: BranchCountRead[];
  by_type: TypeCountRead[];
  products_currently_promoted: number;
}

export interface CouponsAnalyticsRead {
  counts: LifecycleCountsRead;
  by_type: TypeCountRead[];
  by_branch: BranchCountRead[];
  applies_to_all_branches_count: number;
}

export interface ReportsAnalyticsRead {
  open_count: number;
  in_review_count: number;
  high_priority_open_count: number;
  resolved_count: number;
  dismissed_count: number;
  resolved_previous_period_count: number | null;
  by_type: TypeCountRead[];
  by_branch: BranchCountRead[];
  avg_resolution_hours: number | null;
}

export interface ActivityEntryRead {
  type: string;
  description: string;
  occurred_at: ISODateTime;
  branch_id: number | null;
  branch_name: string | null;
}

export interface ActivityFeedRead {
  items: ActivityEntryRead[];
}

export interface AnalyticsQueryParams {
  date_from?: string;
  date_to?: string;
  branch_ids?: number[];
}
