# Prezio

Prezio: tu aliado en cada compra.

Collaborative grocery shopping list app for supermarkets in Panama. Monorepo with a FastAPI backend, a React Native (Android-first) mobile client, and a shared TypeScript contract package.

## Monorepo layout

```
backend/               FastAPI + SQLAlchemy 2.0 async + Alembic + Redis pub/sub
mobile/                React Native CLI (TypeScript, Android-first) + Tamagui
packages/shared-types/ TypeScript types mirroring the backend's wire contract
docker-compose.yml     api + db (Postgres) + redis
```

## What's implemented in this scaffold

- **Auth**: register/login with email+password, Google Sign-In (id_token verified server-side), short-lived JWT access token + persisted refresh token (`sessions` table, revocable), refresh + logout endpoints. Mobile stores tokens in the OS keychain and restores the session on app reopen.
- **Pricing (optimistic concurrency)**: price updates validate a `version` column; on conflict the server returns 409 with its current price/version, published to Redis and fanned out over WebSocket to clients subscribed to that `store_product_id`.
- **Data model**: users, user_profiles, sessions, stores, store_branches, categories, products, store_products, price_history, shopping_lists, shopping_list_items, shopping_list_members, shopping_list_invitations.
- **Seed data**: the 8 Panama supermarket chains (Supermercados Rey, Supermercados Romero, Mr. Precio, Super 99, Riba Smith, PriceSmart, Xtra, Machetazo), `country="PA"`.
- **Mobile**: bottom-tab navigation (Dashboard, Nueva compra, Historial, Perfil), Dashboard with hero CTA + mock quick-access stores/recent lists, WatermelonDB local models (`shopping_lists`, `shopping_list_items`, `pending_actions` offline queue), two reconnecting WebSocket clients (pricing + shopping lists), Prezio brand theme (Tamagui tokens: `#22C55E` primary, `#0F172A` text, Poppins).
- **Price alerts**: "Avísame cuando X esté por debajo de $Y" — scoped to a product, a store chain, or a single branch. A background `asyncio` loop (`app.core.alert_scheduler`) re-evaluates active alerts on a fixed interval and writes in-app notifications; see "Price alert scheduler" below.
- **Collaborative shopping lists**: multi-user lists with OWNER/EDITOR roles, email-only invitations, and real-time sync over the same WebSocket/Redis pub-sub infrastructure as pricing; see "Collaborative shopping lists" below.

## Price alert scheduler

`PriceAlert` rows are evaluated by `PriceAlertEvaluator` (`backend/app/features/alerts/evaluator.py`), pure domain logic with no knowledge of *how often* or *by what* it's invoked. Today it's driven by `AlertScheduler` (`backend/app/core/alert_scheduler.py`): a plain `asyncio` loop started from the FastAPI `lifespan`, running every `Settings.alert_check_interval_seconds` (default 60s).

- **Idempotency**: a notification is only created when an atomic `UPDATE ... WHERE is_below_threshold = false` claims the trigger (`PriceAlertRepository.try_claim_trigger`), so a duplicate evaluation pass — including two racing evaluators — creates at most one notification per crossing.
- **Multi-instance safety**: each cycle is guarded by a Redis-backed `DistributedLock` (`SET NX EX` + a Lua compare-and-delete release), so running multiple API instances doesn't run the evaluation cycle multiple times concurrently.
- **Re-arming**: `is_below_threshold` flips back to `false` once the price rises back above `target_price`, so the next crossing below notifies again — there's deliberately no ACTIVE/TRIGGERED enum.
- **Staleness**: prices older than `Settings.price_freshness_days` are ignored; if only stale prices exist for a product, the alert neither triggers nor re-arms that cycle (there's no fresh signal to act on).

**Known limitations**: the loop's lifetime is tied to a single API process — if that process restarts, the next alert check simply happens up to `alert_check_interval_seconds` later (nothing is lost or double-fired, since evaluator state lives in the DB, not in the loop). There's no missed-cycle backlog or catch-up logic beyond "evaluate whatever is active on the next tick." No push notifications are sent — alerts only populate the in-app `notifications` inbox (`GET /notifications`).

Swapping the scheduler mechanism (Celery beat, cron, a dedicated worker process) later only means changing who calls `PriceAlertEvaluator.run_once()` — the evaluator, repository idempotency guard, and distributed lock are all scheduler-agnostic already.

## Collaborative shopping lists

Multiple users can share and edit the same list (`backend/app/features/shopping_lists/`). No new sync mechanism was introduced — this reuses the same `ConnectionManager`/Redis pub-sub/optimistic-concurrency patterns as pricing.

**Membership & roles**: `shopping_list_members` (unique on `shopping_list_id` + `user_id`) has two roles today, OWNER and EDITOR. The role column is a plain `VARCHAR` (`native_enum=False`), so adding VIEWER later is a data-only change, no migration. OWNER is the creator, can't be removed while the list exists, and is the only role that can delete the list, remove members, or change roles. EDITOR can add/edit/check/delete items and invite others.

**Permissions**: centralized in `ShoppingListPermissionService` (`policy.py`), resolving `can_view`/`can_edit_items`/`can_invite`/`can_remove_member`/`can_archive`/`can_delete` from list + membership state. Both the REST router and the WebSocket subscribe handler call into this same service — there's no duplicated authorization logic per endpoint.

**Invitations**: email-only, to registered users only (no links, no push, no deep-links). `shopping_list_invitations` tracks PENDING/ACCEPTED/DECLINED/REVOKED; a user can't have two PENDING invites to the same list, can't be invited if already a member, and accepting is idempotent (creates membership exactly once). Invitees see their invites via `GET /invitations` regardless of whether they're already members of anything.

**Optimistic concurrency**: identical mechanism to pricing. `shopping_list_items.version` must match on update or the atomic `UPDATE ... WHERE id = ? AND version = ?` affects zero rows, which the service turns into an `ItemVersionConflict` → HTTP 409 with the current item state (`{"detail": ..., "item": {...}}`). Callers are expected to re-fetch and retry. Item creation is idempotent via an optional `client_request_id`.

**States**: `shopping_lists.status` is ACTIVE or ARCHIVED only — no COMPLETED status; "all items checked" is computed on read, not stored. ARCHIVED lists are read-only and excluded from the default list endpoint.

**Real-time sync**: the same `ConnectionManager` + single Redis listener used by pricing now also `psubscribe`s to `shopping_list_updates:*` (per-list events: `item_added`, `item_updated`, `item_removed`, `member_joined`, `member_left`, `invitation_accepted`, `invitation_declined`, `list_archived`) and `user_invitations:*` (a personal, per-user channel so an invitee who isn't a member yet still receives `invitation_created` without any global broadcast). Every event carries `event_type`, `shopping_list_id`, `entity_id`, `version` (when applicable), `timestamp`, and `payload`; `item_updated` always includes the item's new `version`. WebSocket subscribe requests are authorized the same way as REST — membership is checked before a subscription is accepted.

**Auditing**: member/invitation/item lifecycle events reuse the existing in-app `Notification` inbox (`NotificationType.COLLABORATIVE_LIST`) — no separate audit-log system was added.

**Known technical debt**:
- Mobile "add item" takes a raw numeric product ID (no product search/picker UI exists anywhere in the app yet — products are otherwise only discovered via barcode scanning in the purchase flow).
- Pre-existing, unrelated to this epic: `mobile/src/shared/services/ws/wsClient.ts` (pricing) sends `{type, storeProductId}` but the backend pricing WS handler expects `{action, store_product_id}` — a wire-format mismatch that predates this work and was deliberately not copied into the new `shoppingListWsClient.ts`, which uses the backend's actual `{action, shopping_list_id}` protocol.
- Pre-existing, unrelated to this epic: `WS_BASE_URL` in mobile config points at `/ws`, but the backend serves pricing at `/pricing/ws` — the new shopping-list client derives its own URL (`/shopping-lists/ws`) independently of this existing mismatch rather than fixing it.
- Offline sync (WatermelonDB `pending_actions` replay) remains out of scope; nothing in this epic's schema or event design blocks adding it later.

## Dashboard inteligente

The Dashboard (`mobile/src/features/dashboard/`) is fully backend-driven — no mock data. It's built
on a new cross-feature `dashboard` backend slice (`backend/app/features/dashboard/`) that has no
model of its own; it only reads from `shopping_lists`, `catalog`, and `pricing`.

**Purchase signal**: Prezio has no separate purchase/order domain, so a checked-off shopping list
item (`checked` False→True) is treated as "the purchase." That transition now snapshots
`checked_at` and `price_at_check` (the cheapest current price across all stores listing the
product) directly in the same optimistic-concurrency update that flips `checked`. Unchecking an
item clears both back to null.

**Savings**: `total_savings` for a month is `sum(max(reference_price - price_at_check, 0) * quantity)`,
where `reference_price` is the highest `PriceHistory` price recorded for that product (across any
store) in the 90 days trailing the item's `checked_at`. No history in that window → 0 savings for
that item, never a negative number.

**Month bucketing**: done in Python, not SQL. SQLite (used in tests) silently drops tzinfo from
`DateTime(timezone=True)` columns on round-trip while Postgres (production) doesn't, so the
repository returns raw rows and the service does the year/month grouping — mirroring the existing
tz-normalization pattern in `PriceAlertEvaluator`.

**Presupuesto restante (judgment call, not explicitly specified)**: the product brief didn't define
what a "budget" is, so this adds `monthly_budget` to the previously-unwired `UserProfile`/`UserService`
(confirmed dead code before this — zero call sites). It's a single flat monthly number, editable
inline from the dashboard's budget card (`PATCH /users/me/budget`); `remaining_budget` is
`monthly_budget - current_month.total_spent`, or `null` if no budget is set.

**Known technical debt**:
- Budget is a single global monthly number — no per-category budgets, no rollover, no history of past budget values.
- `remaining_budget` only accounts for spend snapshotted via checked list items; it doesn't reserve budget for items still unchecked on an active list.
- The trend chart (`SpendTrendChart`) always shows a fixed trailing 6-month window; it's not user-configurable.

## Portal Web B2B (multi-tenancy & authorization)

`web-admin/` is a separate React SPA for supermarket chain staff — pricing, catalog, promotions,
coupons, member management, reports, and analytics for the chain's own branches. It talks to the
same backend under `backend/app/features/organizations/` (plus `promotions`, `coupons`, `reports`,
`b2b_analytics`), all keyed off a `store_id` path param representing the organization (a `Store`
row of type "chain").

**Roles** (`OrganizationRole`, `backend/app/features/organizations/enums.py`) scope *what* a member
can manage; branch access (`OrganizationMemberBranch`) scopes *where* — these are independent axes,
not a hierarchy:
- `ORGANIZATION_ADMIN` — full read/write across the organization, including member management,
  publishing promotions/coupons, and every analytics view. Implicitly has access to every branch.
- `MANAGER` — same write surface as admin for catalog/pricing/promotions/coupons/reports, plus
  analytics; cannot manage members. Branch access is still explicit — a manager only reaches
  branches they've been granted.
- `EMPLOYEE` — day-to-day operational actions (price/availability updates, viewing reports) scoped
  to their granted branches only; no analytics, no member management, no promotion/coupon
  authoring.

**The core rule — worth stating explicitly because it's the one thing every endpoint here must get
right: frontend filters are UX, backend authorization is security.** `web-admin`'s `navConfig.ts`
hides the Analytics nav item from employees, and `AnalyticsPage.tsx` shows an info alert instead of
charts for non-managers — but neither of those is what stops an employee from *seeing* analytics
data. That's enforced by `require_organization_role(ORGANIZATION_ADMIN, MANAGER)` on the actual
`b2b_analytics` router endpoints. This distinction is not theoretical: during Fase 10.13 hardening
we found that exact gap — all 7 `b2b_analytics` endpoints originally only required
`require_organization_member` (any role), so an `EMPLOYEE` who noticed the hidden nav item, or
simply called the API directly, could pull pricing/availability/promotion/coupon/report analytics
they had no business seeing. The frontend had always been "correct" — the backend hadn't been
enforcing what the UI implied. Fixed by adding the role check server-side (5 of 7 endpoints;
`overview`/`activity` stay open to all roles, matching the operational dashboard employees are
meant to use) and locking it in with a regression test that asserts a 403, not just that the nav
item is hidden.

**Every B2B route validates tenant scope from the database, never from the URL alone.** A request
for `GET /organizations/{store_id}/promotions/{promotion_id}` first resolves the caller's own
active membership for `store_id` (via `require_organization_member` — 404, not 403, on no/inactive
membership, so an outsider can't distinguish "wrong org" from "org doesn't exist"), then loads the
promotion and checks `promotion.store_id == store_id` before returning anything. The same
load-then-check-then-return shape is repeated for branches, coupons, reports, catalog listings, and
pricing. An Org-A admin sending Org-B's `promotion_id`/`branch_id`/`coupon_id`/`member_id` alongside
their own, valid `store_id` gets 404, never a 200 with someone else's data — this is exercised
directly by cross-tenant regression tests in `backend/tests/test_promotions.py`,
`test_coupons.py`, `test_reports.py`, `test_organizations.py`, etc. (Org A's own `store_id` +
Org B's resource ID → 404).

A related, now-fixed example: `require_organization_role`'s dependency factory had a sibling,
`require_branch_access`, that was never wired into any router but still shipped a real IDOR — for
`ORGANIZATION_ADMIN` it granted access to *any* `branch_id` without ever checking that the branch
belonged to the `store_id` in the URL (only `has_branch_access`'s admin short-circuit ran, not the
`branch.store_id == store_id` check). It had zero call sites, so nothing was exploitable in
practice, but it's exactly the shape section 6 of the hardening pass exists to catch — dead code is
still a liability if something wires it up later. Fixed by delegating to
`OrganizationMemberService.authorize_branch(store_id, member, branch_id)`, the one method every
live branch-scoped endpoint (catalog, pricing, promotions, coupons) already funnels through
correctly.

**Array-param batch endpoints authorize per item, not once for the whole request.**
`POST /pricing/batch` and `POST /catalog/products/{id}/branches` both take a list of IDs
(`store_product_id`s / `branch_id`s); each one is checked against the caller's own branch access
independently, so a single out-of-scope ID in an otherwise-valid batch fails only that item
(`failed`/`forbidden` in the response) and never blocks, silently drops, or grants access to the
rest of the batch. Regression-tested for both the same-org branch-scope case (an employee's batch
mixing an in-scope and an out-of-scope branch) and the cross-org case (a `branch_id` from a
different organization entirely).

**Mass assignment**: every B2B `PATCH`/`Update` Pydantic schema (organizations members/branches,
promotions, coupons, catalog, pricing, reports) is an explicit allow-list — none of them expose
`organization_id`, `store_id`, `created_by`, `published_by`, `version`, or an unauthorized `role`/
`status` field for the client to set. Optimistic-concurrency fields like `version` are always
read from the loaded row server-side, never trusted from the request body.

**CORS & config (spec section 28)**: `backend/app/core/config.py`'s `cors_origins` defaults to
`["http://localhost:5173"]` (web-admin's local Vite dev origin) — deliberately *not* `["*"]`,
because `CORSMiddleware` is configured with `allow_credentials=True`, and wildcard-origin plus
credentials is treated by browsers (and Starlette) as "reflect any Origin back," which defeats CORS
entirely. Any real deployment must set `CORS_ORIGINS` (a JSON array, e.g.
`["https://admin.prezio.example"]`) via env — see `backend/.env.template`.

**Token storage (reviewed, not changed)**: `web-admin` stores both its access and refresh tokens in
plain `localStorage` (`web-admin/src/shared/services/storage/tokenStorage.ts`). This is a known
XSS-exposure risk — any injected script can read both tokens — but moving to httpOnly cookies is an
auth-architecture change, out of scope for a hardening pass that must not add new features or
rearchitect existing ones. Flagged here as a real, open risk rather than silently left undocumented.

**Why the exit gate (section 43) matters in practice**: this same hardening pass hit a real,
pre-existing `tsc -b`/`vite build` failure in `web-admin` (7 `TS2769` errors from MUI's `Stack`
rejecting `alignItems`/`justifyContent` as direct props under this project's TypeScript version) that
had nothing to do with authorization — but a broken build is still a shipped-broken build, and no
amount of correct backend authorization matters if the frontend a manager needs to view analytics on
simply won't compile. Treating "backend tests pass" as sufficient to call a phase done, without also
requiring a clean typecheck/lint/build, would have let this regression through; the exit gate exists
precisely so that a security-hardening pass doesn't ship a portal nobody can build.

**Known test-coverage gap for the final report**: `web-admin` has no test framework configured at
all (no `vitest`/`jest` in `package.json`, no test script) — every guarantee above for the frontend
(role-gated UI, error boundary, build/lint/typecheck) is currently verified by static tooling only,
not by any frontend test suite. Logged as tech debt, not fixed in this phase (adding a test
framework is itself a scope decision, not a hardening fix).

## Running the backend

Dependencies are managed with **uv**.

```bash
cd backend
uv sync --dev

# bring up Postgres + Redis
cd ..
docker compose up -d db redis

# apply migrations
docker compose run --rm api alembic upgrade head

# seed the Panama supermarket chains
docker compose run --rm api python -m app.scripts.seed

# start the full stack (api + db + redis)
docker compose up -d
```

API is available at `http://localhost:8000` (health check: `GET /health`).

Run backend tests locally (uses in-memory SQLite, no Docker needed):

```bash
cd backend
uv run pytest -v
```

## Running the mobile app

```bash
cd mobile
cp env.template .env
# edit .env: API_BASE_URL, WS_BASE_URL, GOOGLE_WEB_CLIENT_ID

npm install
npm start          # Metro bundler

# in another terminal, with an Android device/emulator attached:
npm run android
# — or manually: cd android && ./gradlew installDebug
```

### Pending manual steps (not fabricated, genuinely require your own credentials/hardware)

- `.env` must be filled in with a real backend URL and a real Google OAuth **Web** Client ID (Android client registered in Google Cloud Console against package `com.prezio.app` + your debug/release SHA-1 fingerprints).
- Native Android build (`./gradlew`) has not been run end-to-end in this environment (no Android SDK available while scaffolding) — first real build may need attention for `react-native-vision-camera` v5 (Nitro-based) or WatermelonDB's native module.
- Poppins fonts are linked for Android only; iOS font linking (Xcode Fonts group + `Info.plist` `UIAppFonts`) is not done since Android is the first target.

## Fase 2 (not built yet)

- Notificaciones push (in-app notifications + price alerts exist; push delivery does not)
- Panel admin (store/catalog/price management UI)
- Barcode-driven product lookup (camera permission + preview scaffolded in mobile; no decoding wired to the catalog yet)
- Full WatermelonDB ↔ backend sync engine (local models + offline queue exist; the sync loop that replays `pending_actions` does not) — collaborative lists (Epic 8) are explicitly online-only for now
- VIEWER role for shopping lists (schema/permission service already accommodate it; not exposed in the UI yet)
- Product search/picker UI for adding shopping list items (currently a raw numeric product ID field)
