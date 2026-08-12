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
- Notificaciones push
- Panel admin (store/catalog/price management UI)
- Barcode-driven product lookup (camera permission + preview scaffolded in mobile; no decoding wired to the catalog yet)
- Full WatermelonDB ↔ backend sync engine (local models + offline queue exist; the sync loop that replays `pending_actions` does not)
