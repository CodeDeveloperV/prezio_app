# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Household/family grocery shoppers in Panama who share shopping lists with other household or
family members and want to reduce what they spend on groceries. Lists are collaborative by
design (OWNER/EDITOR roles, email invitations), and the app's savings/budget tracking is built
around that shared, ongoing use rather than a one-off single-user list.

## Product Purpose

Prezio ("tu aliado en cada compra") helps price-conscious grocery shoppers in Panama plan, share,
and complete supermarket shopping trips while tracking and reducing what they spend, using real
price data instead of guesswork.

## Positioning

The only app in this space that combines real-time price comparison across all 8 major Panama
supermarket chains with collaborative multi-user shopping lists, price-drop alerts scoped to a
product/chain/branch, and savings/budget tracking computed automatically from items actually
checked off during a purchase — not a single-store list app and not a manual price-tracking
spreadsheet.

## Operating Context

- Creating and sharing a list with household/family members (OWNER can't be removed, EDITOR can
  add/edit/check items and invite others); invitations are email-only, to already-registered users.
- Adding items today requires a raw numeric product ID — there is no product search/picker UI yet;
  products are otherwise discovered via barcode scanning during the purchase flow (camera
  permission and preview exist; decoding is not wired to the catalog yet).
- Checking off an item during an in-store purchase is the app's only signal of "a purchase
  happened" — it snapshots the price paid and drives the savings/budget numbers on the dashboard.
- Comparing prices for a product across branches/chains, and setting price-drop alerts scoped to
  a product, a chain, or a single branch (alerts populate an in-app notification inbox only; no
  push delivery yet).
- Reviewing purchase history and a dashboard showing monthly savings and remaining budget.
- Everything above is online-only today. Local WatermelonDB models and an offline pending-action
  queue exist in the mobile app, but the sync loop that replays them against the backend is not
  built yet.
- Android is the only OS shipped and verified today (native build, fonts). iOS support is a
  planned future target, not yet built — the product's design language is expected to adapt per
  OS once iOS work starts, rather than carrying Android-only assumptions forward by default.

## Capabilities and Constraints

- Auth: email+password or Google Sign-In (server-verified id_token); short-lived JWT access token
  + persisted, revocable refresh token.
- Collaborative shopping lists: OWNER/EDITOR roles only today (schema/permissions already
  accommodate a future VIEWER role, not exposed in the UI yet).
- Price alerts: scoped to a product, a chain, or a single branch; in-app notifications only, no
  push notifications yet.
- Dashboard savings/budget: computed only from checked-off list items (no separate purchase/order
  domain exists); budget is a single flat monthly number — no per-category budgets, no rollover,
  no history of past budget values.
- No admin panel for store/catalog/price management yet.
- Current locale: Spanish only (Panama market). Bilingual/multi-language (i18n) support is
  planned but not yet implemented — this is a known future constraint, not a permanent decision.
  (Separately, and unconditionally regardless of UI locale: all code, identifiers, comments, and
  commit messages are English-only — a repository convention, not a product fact.)
- Undecided: exact scope/timeline of iOS support and of bilingual/i18n rollout.

## Brand Commitments

- Product name: Prezio.
- Tagline: "tu aliado en cada compra" (kept in Spanish as product voice, not translated).

## Evidence on Hand

- 8 seeded Panama supermarket chains: Supermercados Rey, Supermercados Romero, Mr. Precio,
  Super 99, Riba Smith, PriceSmart, Xtra, Machetazo.
- No user testimonials, case studies, press, or benchmark data exist — do not fabricate any.
- No logo or brand asset files exist in the repository yet.

## Product Principles

1. Price truth over convenience — comparisons, alerts, and savings must reflect real, fresh price
   data; stale prices are excluded rather than shown as a false saving.
2. Collaboration is core, not bolted on — shared lists, roles, and real-time sync are first-class
   to the product, not an add-on to a single-user list.
3. No fabricated numbers — every savings or budget figure shown must trace to an actual recorded
   price or a user-set budget; missing data means showing nothing/null, never a guess.
4. Android-first execution, multi-OS intent — ship real, working Android experiences now while
   keeping the product designed so it can adapt to iOS rather than hard-coding Android-only
   assumptions.
