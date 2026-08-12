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
- **Data model**: users, user_profiles, sessions, stores, store_branches, categories, products, store_products, price_history, shopping_lists, shopping_list_items — one initial Alembic migration.
- **Seed data**: the 8 Panama supermarket chains (Supermercados Rey, Supermercados Romero, Mr. Precio, Super 99, Riba Smith, PriceSmart, Xtra, Machetazo), `country="PA"`.
- **Mobile**: bottom-tab navigation (Dashboard, Nueva compra, Historial, Perfil placeholders), Dashboard with hero CTA + mock quick-access stores/recent lists, WatermelonDB local models (`shopping_lists`, `shopping_list_items`, `pending_actions` offline queue), a reconnecting WebSocket client, Prezio brand theme (Tamagui tokens: `#22C55E` primary, `#0F172A` text, Poppins).
- **Price alerts**: "Avísame cuando X esté por debajo de $Y" — scoped to a product, a store chain, or a single branch. A background `asyncio` loop (`app.core.alert_scheduler`) re-evaluates active alerts on a fixed interval and writes in-app notifications; see "Price alert scheduler" below.

## Price alert scheduler

`PriceAlert` rows are evaluated by `PriceAlertEvaluator` (`backend/app/features/alerts/evaluator.py`), pure domain logic with no knowledge of *how often* or *by what* it's invoked. Today it's driven by `AlertScheduler` (`backend/app/core/alert_scheduler.py`): a plain `asyncio` loop started from the FastAPI `lifespan`, running every `Settings.alert_check_interval_seconds` (default 60s).

- **Idempotency**: a notification is only created when an atomic `UPDATE ... WHERE is_below_threshold = false` claims the trigger (`PriceAlertRepository.try_claim_trigger`), so a duplicate evaluation pass — including two racing evaluators — creates at most one notification per crossing.
- **Multi-instance safety**: each cycle is guarded by a Redis-backed `DistributedLock` (`SET NX EX` + a Lua compare-and-delete release), so running multiple API instances doesn't run the evaluation cycle multiple times concurrently.
- **Re-arming**: `is_below_threshold` flips back to `false` once the price rises back above `target_price`, so the next crossing below notifies again — there's deliberately no ACTIVE/TRIGGERED enum.
- **Staleness**: prices older than `Settings.price_freshness_days` are ignored; if only stale prices exist for a product, the alert neither triggers nor re-arms that cycle (there's no fresh signal to act on).

**Known limitations**: the loop's lifetime is tied to a single API process — if that process restarts, the next alert check simply happens up to `alert_check_interval_seconds` later (nothing is lost or double-fired, since evaluator state lives in the DB, not in the loop). There's no missed-cycle backlog or catch-up logic beyond "evaluate whatever is active on the next tick." No push notifications are sent — alerts only populate the in-app `notifications` inbox (`GET /notifications`).

Swapping the scheduler mechanism (Celery beat, cron, a dedicated worker process) later only means changing who calls `PriceAlertEvaluator.run_once()` — the evaluator, repository idempotency guard, and distributed lock are all scheduler-agnostic already.

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

- Listas colaborativas multiusuario (real-time shared shopping lists, presence, permissions)
- Notificaciones push (in-app notifications + price alerts exist; push delivery does not)
- Panel admin (store/catalog/price management UI)
- Barcode-driven product lookup (camera permission + preview scaffolded in mobile; no decoding wired to the catalog yet)
- Full WatermelonDB ↔ backend sync engine (local models + offline queue exist; the sync loop that replays `pending_actions` does not)
