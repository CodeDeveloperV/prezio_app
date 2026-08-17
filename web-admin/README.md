# Prezio — Portal Web B2B

React + TypeScript + Vite + MUI single-page app for supermarket chain staff: catalog, pricing,
promotions, coupons, member management, reports, and analytics for their own organization's
branches. See the root [`README.md`](../README.md#portal-web-b2b-multi-tenancy--authorization) for
the full multi-tenancy and authorization model this app relies on.

## Running locally

```bash
cd web-admin
cp .env.template .env
# edit .env: VITE_API_BASE_URL, VITE_WS_BASE_URL

npm install
npm run dev       # Vite dev server at http://localhost:5173
```

The backend must be running (see the root README's "Running the backend" section) with
`CORS_ORIGINS` including `http://localhost:5173` (the default in `backend/.env.template`).

```bash
npm run build     # tsc -b && vite build
npm run lint       # oxlint .
```

There is currently no test framework configured (no `vitest`/`jest`) — `build`/`lint`/`tsc -b
--noEmit` are the only automated checks for this app today.

## Roles & permissions

Membership in an organization (`OrganizationRole`, mirrored from
`backend/app/features/organizations/enums.py`) is `organization_admin`, `manager`, or `employee`.
Branch access is a separate grant (`OrganizationMemberBranch`), not implied by role, except for
`organization_admin` which always has every branch.

| Area | organization_admin | manager | employee |
|---|---|---|---|
| Catalog / pricing (own branches) | read/write | read/write | read/write |
| Promotions / coupons | read/write | read/write | read-only |
| Reports | read/write | read/write | read/write |
| Analytics (`/analytics`) | yes | yes | **no** |
| Members | read/write | read-only | no |

**Every one of these permissions is enforced server-side**, not just hidden in the UI —
`navConfig.ts` and per-page guards (e.g. `AnalyticsPage.tsx`'s `canViewAnalytics` check) exist so
staff who shouldn't see a feature don't get a confusing, doomed-to-403 UI, but they are not the
security boundary. **Frontend filters are UX, backend authorization is security**: the actual
enforcement is `require_organization_role(...)` on the backend router, and a role check that only
exists in `web-admin` and not on the corresponding backend endpoint is a bug, not a stronger
guarantee. (Fase 10.13 hardening found and fixed exactly one instance of this drift — see the root
README for the analytics example.)

## Architecture

- `src/app/` — routing (`AppRouter.tsx`), providers (`AppProviders.tsx` — MUI theme, React Query,
  auth bootstrap), and `src/shared/components/ErrorBoundary.tsx` (wraps the router so an uncaught
  render error shows a recoverable alert instead of a blank screen).
- `src/features/<name>/` — one slice per B2B domain (catalog, pricing, promotions, coupons,
  members, reports, analytics), each with `api/` (typed HTTP calls), `hooks/` (React Query),
  `screens/`, `components/`.
- `src/shared/services/api/` — the base HTTP client and per-feature error unwrapping.
- `src/shared/services/storage/tokenStorage.ts` + `src/shared/store/authStore.ts` — auth tokens are
  stored in plain `localStorage` (both access and refresh). This is a known, reviewed
  XSS-exposure risk (see root README) — not changed during hardening since moving to httpOnly
  cookies is an auth-architecture change, not a hardening fix.
