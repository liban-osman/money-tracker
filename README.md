# Money Tracker

Personal finance tracker: connects TD checking, TD credit card, and Ames
credit card via Plaid, syncs transactions, classifies spending, and shows
month-over-month income/expense views.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## Setup

### Backend

```
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then fill in Plaid credentials
uvicorn app.main:app --reload --port 8000
```

### Frontend

```
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api/*` to the
backend at `http://localhost:8000`.

## Status

Phase 1 (scaffolding) complete: FastAPI backend with SQLite models
(PlaidItem, Account, Transaction, Category, CategoryRule), React + Vite +
Tailwind frontend shell wired to the backend's `/api/health`. Next up:
Plaid Link integration (see ARCHITECTURE.md §9).
