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
- Dashboard's "Listas recientes" section still renders mock data and hasn't been rewired to the real shopping-lists API/screens.
- Pre-existing, unrelated to this epic: `mobile/src/shared/services/ws/wsClient.ts` (pricing) sends `{type, storeProductId}` but the backend pricing WS handler expects `{action, store_product_id}` — a wire-format mismatch that predates this work and was deliberately not copied into the new `shoppingListWsClient.ts`, which uses the backend's actual `{action, shopping_list_id}` protocol.
- Pre-existing, unrelated to this epic: `WS_BASE_URL` in mobile config points at `/ws`, but the backend serves pricing at `/pricing/ws` — the new shopping-list client derives its own URL (`/shopping-lists/ws`) independently of this existing mismatch rather than fixing it.
- Offline sync (WatermelonDB `pending_actions` replay) remains out of scope; nothing in this epic's schema or event design blocks adding it later.

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
