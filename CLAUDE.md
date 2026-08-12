# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Prezio ("tu aliado en cada compra") — collaborative grocery shopping list app for supermarkets in
Panama. Monorepo: FastAPI backend, React Native (Android-first) mobile client, and a shared
TypeScript contract package.

```
backend/               FastAPI + SQLAlchemy 2.0 async + Alembic + Redis pub/sub
mobile/                React Native CLI (TypeScript, Android-first) + Tamagui
packages/shared-types/ TypeScript types mirroring the backend's wire contract
docker-compose.yml     api + db (Postgres) + redis
```

This is an early-stage scaffold (auth, pricing, catalog, stores, shopping_lists implemented; no
collaborative multi-user lists, push notifications, admin panel, barcode decoding, or the
WatermelonDB sync loop yet — see README.md "Fase 2" for the full list of what's intentionally not
built).

## Commands

### Backend (`backend/`)

Dependency management is **uv**, not pip/poetry.

```bash
cd backend
uv sync --dev                                  # install deps

uv run pytest -v                               # all tests (in-memory SQLite, no Docker needed)
uv run pytest tests/test_auth.py -v             # single file
uv run pytest tests/test_auth.py::test_name -v  # single test

docker compose up -d db redis                   # from repo root: Postgres + Redis only
docker compose run --rm api alembic upgrade head
docker compose run --rm api python -m app.scripts.seed   # seeds the 8 PA supermarket chains
docker compose up -d                            # full stack (api + db + redis)
```

API: `http://localhost:8000`, health check at `GET /health`.

### Mobile (`mobile/`)

```bash
cd mobile
cp env.template .env    # fill in API_BASE_URL, WS_BASE_URL, GOOGLE_WEB_CLIENT_ID

npm install
npm start                # Metro bundler
npm run android          # requires a device/emulator attached
npm test                 # jest
npm run lint             # eslint .
```

No test runner is currently configured to run a single test file directly other than jest's own
`npx jest path/to/file.test.tsx` filtering.

## Architecture

### Backend: feature-sliced, repository/service/router layering

Each feature under `backend/app/features/<name>/` is self-contained with the same file shape:
`models.py`, `schemas.py` (Pydantic), `repository.py`, `service.py`, `router.py` (+ optional
`exceptions.py`, `dependencies.py`). Features are: `auth`, `users`, `stores`, `catalog`,
`pricing`, `shopping_lists`.

- Repositories subclass `app.shared.base_repository.BaseRepository[Model]` for common CRUD; feature
  repositories add query-specific methods on top.
- Services hold business logic and are constructed with their repositories + `AsyncSession` +
  `Redis` injected (see `pricing/service.py`); routers wire up dependencies and stay thin.
- `app/shared/all_models.py` imports every feature's models so `Base.metadata` sees the full
  schema — required by both Alembic autogenerate and the test suite's `create_all`.
- Auth: email+password or Google Sign-In (`id_token` verified server-side) issue a short-lived JWT
  access token + a persisted, revocable refresh token (`sessions` table). Wire format is
  **snake_case** (`access_token`, `refresh_token`, `token_type`) with no combined user+tokens
  envelope — user profile is a separate `GET /users/me` call.
- Pricing uses optimistic concurrency: `store_products.version` must match on update or the
  service raises `PriceVersionConflict` (409) with the current price/version. Successful updates
  publish to a Redis channel (`PRICE_UPDATES_CHANNEL_PREFIX` + `store_product_id`) which
  `app/core/websocket_manager.py`'s listener fans out to WebSocket subscribers.
- Config is a single `pydantic-settings` `Settings` class (`app/core/config.py`), cached via
  `get_settings()`. Env vars: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, etc.
- Tests (`backend/tests/`) run against in-memory SQLite (`StaticPool`, single shared connection)
  with `get_db`/`get_redis` overridden via FastAPI `dependency_overrides` — no Docker/Postgres/
  Redis needed locally.

### Mobile: feature-sliced under `src/features/`, shared infra under `src/shared/`

- `src/app/` — navigation (`RootNavigator` gates `AuthStack` vs `MainTabs` on
  `authStore`'s `status`, and opens/closes the WebSocket client on auth transitions), providers
  (`AppProviders` wraps `TamaguiProvider` + `QueryClientProvider` + safe area/gesture handler
  roots), and the Tamagui theme (`theme/tamagui.config.ts`, `theme/tokens.ts` — brand primary
  `#22C55E`, text `#0F172A`, Poppins font).
- `src/features/<name>/` mirrors the backend split loosely: `api/` (ky-based calls),
  `hooks/` (React Query mutations/queries), `screens/`, `components/`, `services/`.
- `src/shared/services/api/httpClient.ts` is the single `ky` instance: attaches the bearer token
  from `authStore` on every request and, on a 401, coalesces concurrent refreshes into one
  `POST /auth/refresh` call before retrying the original request once.
- `src/shared/store/authStore.ts` (zustand) is the source of truth for auth `status`
  (`bootstrapping` / `authenticated` / unauthenticated) and tokens; `tokenStorage.ts` persists
  tokens in the OS keychain (`react-native-keychain`).
- `src/shared/services/db/` holds WatermelonDB models (`ShoppingList`, `ShoppingListItem`,
  `PendingAction` — an offline mutation queue). The models and offline queue exist but the sync
  loop that replays `pending_actions` against the backend is **not yet implemented**.
- `src/shared/services/ws/wsClient.ts` is a reconnecting WebSocket client used for live price
  updates.
- `@prezio/shared-types` (`packages/shared-types/src/index.ts`, linked via `file:../packages/shared-types`)
  is the single source of truth for request/response shapes shared between mobile and backend —
  keep it in sync with backend Pydantic schemas when either changes. All wire payloads are
  snake_case to match the backend exactly (no camelCase transformation layer).
- Babel plugin order matters and is commented in `mobile/babel.config.js`: legacy decorators (for
  WatermelonDB's `@field`/`@date`/`@children`) must run before the RN preset's class-properties
  transform, and `react-native-worklets/plugin` must be last. `@tamagui/babel-plugin` is skipped
  under Jest (requires `react-dom`, which breaks in Jest's Node environment).
- Tamagui/Metro: node_modules must not contain multiple non-deduped copies of `@tamagui/web` /
  `@tamagui/core` — that causes an Android "no parent theme context" render error. If you touch
  Tamagui-related dependencies, verify with `npm ls @tamagui/web @tamagui/core` that there's a
  single resolved copy.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **prezio_app** (980 symbols, 1624 relationships, 46 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/prezio_app/context` | Codebase overview, check index freshness |
| `gitnexus://repo/prezio_app/clusters` | All functional areas |
| `gitnexus://repo/prezio_app/processes` | All execution flows |
| `gitnexus://repo/prezio_app/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
