# Money Tracker — Architecture

## 1. Goal

A personal finance tracker that connects to real bank/credit accounts via
Plaid, pulls transactions automatically, classifies spending into
categories, and surfaces **month-over-month views** of income vs. expenses.
Most spending happens on credit cards, so correctly separating "real"
expenses from credit card *payments* (which are transfers, not spending) is
a first-class concern, not an afterthought.

Accounts to connect (all via Plaid):
- TD Bank checking/savings (depository)
- TD Credit Card
- Ames Credit Card

Single user, runs locally. No multi-tenant auth needed for v1.

## 2. Tech Stack

| Layer      | Choice                                                        |
|------------|----------------------------------------------------------------|
| Backend    | Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2   |
| DB         | SQLite (single local file, `money_tracker.db`)                |
| Bank data  | Plaid (`plaid-python` SDK)                                     |
| Frontend   | React + TypeScript + Vite, TanStack Query, Recharts, Tailwind |
| Scheduling | Manual "Sync Now" for v1; APScheduler for daily auto-sync later |
| Hosting    | Local only (`localhost:8000` backend, `localhost:5173` frontend) |

SQLite + local-only is deliberate: it's real financial data, so the
simplest thing that keeps it entirely on your machine wins for v1. The
backend is still structured so swapping SQLite → Postgres later (e.g. for
a cloud deploy) is just a connection-string change, not a rewrite.

## 3. Secrets Handling

Plaid credentials and any Plaid `access_token` (one per linked account,
each capable of pulling that account's transaction history) are treated as
high-sensitivity secrets:

- Live only in `backend/.env`, which is **git-ignored**. `backend/.env.example`
  documents the required keys with placeholder values and *is* committed.
- Never logged, never returned by any API response, never placed in the
  frontend bundle.
- `PLAID_ENV` is a hard switch between `sandbox` and `production` — see
  §7. Development against `sandbox` is the default; `production` is used
  deliberately once real-account flows are verified.
- Item `access_token`s pulled from Plaid Link are stored in the local
  SQLite DB (see `PlaidItem` model, §5). Because the DB file itself is
  git-ignored and local-only, this is acceptable for v1; encrypting that
  column at rest with a local key (`cryptography`'s Fernet) is a documented
  follow-up, not a blocker.

## 4. Project Structure

```
money-tracker/
├── docs/
│   └── ARCHITECTURE.md
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI app, CORS, router mounting
│   │   ├── core/
│   │   │   ├── config.py           # Settings (reads .env via pydantic-settings)
│   │   │   └── db.py               # SQLAlchemy engine/session
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── plaid_item.py
│   │   │   ├── account.py
│   │   │   ├── transaction.py
│   │   │   ├── category.py
│   │   │   └── category_rule.py
│   │   ├── schemas/                # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── plaid_service.py    # Link token, token exchange, sync calls
│   │   │   ├── sync_service.py     # Upsert Plaid data into DB
│   │   │   └── categorization_service.py  # Rules engine + default mapping
│   │   └── api/
│   │       ├── plaid.py            # /plaid/link-token, /plaid/exchange
│   │       ├── accounts.py
│   │       ├── transactions.py
│   │       ├── categories.py
│   │       └── summary.py          # Monthly summary endpoints
│   ├── alembic/                    # DB migrations
│   ├── tests/
│   ├── requirements.txt
│   ├── .env.example
│   └── .env                        # git-ignored, real secrets
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Monthly view (main screen)
│   │   │   ├── Transactions.tsx    # Searchable/filterable list
│   │   │   ├── Accounts.tsx        # Linked accounts + Plaid Link button
│   │   │   └── Categories.tsx      # Manage categories + rules
│   │   ├── components/
│   │   │   ├── charts/             # MonthlyTrendChart, CategoryBreakdown
│   │   │   └── PlaidLinkButton.tsx
│   │   ├── api/                    # fetch client for backend
│   │   └── types/
│   ├── package.json
│   └── vite.config.ts
└── .gitignore
```

## 5. Data Model

**PlaidItem** — one row per Plaid "Item" (one bank login connection; TD
checking + TD credit card are likely the *same* Item since they're the
same institution login, Ames is a separate Item).
- `id`, `plaid_item_id`, `institution_name`, `access_token`, `created_at`, `last_synced_at`

**Account** — one row per actual account (checking, TD credit, Ames credit).
- `id`, `plaid_item_id` (FK), `plaid_account_id`, `name`, `official_name`,
  `type` (`depository` / `credit`), `subtype`, `mask`,
  `current_balance`, `available_balance`, `credit_limit`

**Transaction**
- `id`, `account_id` (FK), `plaid_transaction_id`, `date`, `name`,
  `merchant_name`, `amount` (Plaid convention: positive = money out,
  negative = money in), `pending`,
  `plaid_category_primary`, `plaid_category_detailed` (Plaid's own
  classification, kept as-is for reference),
  `category_id` (FK, nullable — our resolved category),
  `is_transfer` (bool, computed — see §6),
  `notes` (user-editable)

**Category**
- `id`, `name`, `kind` (`income` / `expense` / `transfer`), `parent_id`
  (nullable, for subcategories like Dining → Coffee), `color`

**CategoryRule** — user-defined overrides, evaluated in priority order.
- `id`, `match_type` (`merchant_contains` / `name_contains` /
  `plaid_category_equals`), `match_value`, `category_id`, `priority`

## 6. Categorization Strategy

Three layers, applied in order, first match wins:

1. **User rules** (`CategoryRule`) — e.g. "merchant contains 'Amazon' →
   Shopping". Created either explicitly in the Categories page, or via a
   "always classify this merchant as X" action when reclassifying a single
   transaction in the Transactions list.
2. **Plaid's own category** — Plaid returns a `personal_finance_category`
   (primary + detailed) per transaction out of the box. A static mapping
   table (`PLAID_CATEGORY_MAP` in `categorization_service.py`) translates
   Plaid's taxonomy into our own `Category` rows so the category list stays
   small and meaningful instead of inheriting Plaid's ~100+ categories.
3. **Uncategorized fallback** — shown clearly in the UI as "Needs review"
   so nothing silently miscounts toward income/expense totals.

**Transfer detection** (important because most spend is on credit cards):
a payment *from* TD checking *to* a TD/Ames credit card shows up as two
transactions — an outflow on checking and a payment/credit on the card.
Both must be tagged `kind = transfer` and excluded from income/expense
totals, or spending gets double-counted. Detection uses Plaid's own
`TRANSFER_OUT` / `TRANSFER_IN` / loan-payment categories first, with a
fallback heuristic (matching amount ± date proximity between a checking
outflow and a credit card payment) for anything Plaid doesn't tag cleanly.

## 7. Plaid Integration

- **Environment**: `PLAID_ENV=sandbox` for initial development (fake
  institutions, no real data risk) with the credentials you provided
  reserved for `PLAID_ENV=production` once the Link → sync → categorize
  flow is verified end-to-end against sandbox data.
- **Link flow**: backend exposes `POST /plaid/link-token` (creates a Link
  token), frontend's `PlaidLinkButton` opens Plaid Link with it, user logs
  into TD (once, covering both checking and TD credit card if they share a
  login) and separately into Ames. On success, frontend sends the
  `public_token` to `POST /plaid/exchange`, backend exchanges it for a
  permanent `access_token` and stores a `PlaidItem` + its `Account` rows.
- **Sync**: `POST /accounts/{item_id}/sync` calls Plaid's
  `/transactions/sync` endpoint (cursor-based, incremental — not a full
  re-pull each time), upserts new/modified transactions, marks removed
  ones. Triggered manually via a "Sync Now" button in v1.

## 8. Monthly Views (core feature)

`GET /summary/monthly?month=2026-07` returns, per month:
- Total income, total expenses, net (income − expenses) — transfers excluded
- Breakdown by category (for the expense pie/bar chart)
- Breakdown by account (how much came off each credit card vs. checking)

Dashboard page (`Dashboard.tsx`):
- Month picker (defaults to current month)
- Income vs. expense summary tiles + net
- Category breakdown chart for the selected month
- Trend chart: net/income/expenses across the last 6–12 months, so
  month-to-month direction is visible at a glance, not just one month in
  isolation
- Per-credit-card spend for the month (since that's where most activity is)

## 9. Build Phases

1. **Scaffolding** — repo structure, `.env` handling, FastAPI skeleton,
   Vite skeleton, DB models + Alembic init. *(this step)*
2. **Plaid Link** — link-token/exchange endpoints, `PlaidLinkButton`,
   connect TD (checking + credit) and Ames against `sandbox` first.
3. **Sync** — `/transactions/sync` integration, upsert logic, manual
   "Sync Now".
4. **Categorization** — Plaid category mapping, rules engine, "Needs
   review" UI, transfer detection.
5. **Monthly dashboard** — summary endpoint, charts, trend view.
6. **Switch to production** — flip `PLAID_ENV`, re-link real TD/Ames
   accounts, verify a full real month of data end-to-end.
7. **Later/optional** — budgets & goals per category, encrypted
   `access_token` storage, auto-sync scheduler, cloud deploy (Postgres +
   hosted frontend).

## 10. Open Questions

- Does TD checking and TD credit card share one login (one Plaid Item) or
  two? Affects whether Link is run once or twice for TD.
- Any existing categories/budget structure you want mirrored, or start
  from a clean default category list (Housing, Groceries, Dining,
  Transport, Subscriptions, Shopping, Income, etc.)?
