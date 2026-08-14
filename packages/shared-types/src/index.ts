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
}

export interface ShoppingListItemCreate {
  product_id: number;
  quantity?: number;
  client_request_id?: string;
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
