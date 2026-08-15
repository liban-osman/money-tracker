import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.summary import (
    AccountBreakdown,
    CategoryAverage,
    CategoryBreakdown,
    CategoryTrendPoint,
    MonthlySummaryResponse,
    RecurringMerchant,
    TopMerchant,
    TrendPoint,
)

router = APIRouter(prefix="/summary", tags=["summary"])


def _month_bounds(month: str) -> tuple[datetime.date, datetime.date]:
    start = datetime.date.fromisoformat(f"{month}-01")
    end = datetime.date(start.year + (start.month == 12), start.month % 12 + 1, 1)
    return start, end


def _shift_month(month: str, offset: int) -> str:
    year, mon = (int(part) for part in month.split("-"))
    total = year * 12 + (mon - 1) + offset
    return f"{total // 12}-{total % 12 + 1:02d}"


def _all_months(db: Session) -> list[str]:
    """Every "YYYY-MM" from the earliest transaction through today."""
    earliest = db.query(func.min(Transaction.date)).scalar()
    if earliest is None:
        return []
    today = datetime.date.today()
    start_key = earliest.year * 12 + (earliest.month - 1)
    end_key = today.year * 12 + (today.month - 1)
    return [f"{key // 12}-{key % 12 + 1:02d}" for key in range(start_key, end_key + 1)]


def _habitual_income_category_ids(db: Session) -> set[int]:
    """Income categories seen in 2+ distinct months — recurring pay, not a
    one-off windfall (bonus, gift, one-time transfer). Those still count in
    the real monthly totals, just not in the averages."""
    rows = (
        db.query(Transaction.category_id, Transaction.date)
        .join(Category, Transaction.category_id == Category.id)
        .filter(Category.kind == "income", Transaction.pending.is_(False))
        .all()
    )
    months_by_category: dict[int, set[tuple[int, int]]] = {}
    for category_id, date in rows:
        months_by_category.setdefault(category_id, set()).add((date.year, date.month))
    return {cid for cid, months in months_by_category.items() if len(months) >= 2}


def _summarize(
    db: Session, month: str, habitual_income_ids: set[int] | None = None
) -> MonthlySummaryResponse:
    if habitual_income_ids is None:
        habitual_income_ids = _habitual_income_category_ids(db)

    start, end = _month_bounds(month)
    transactions = (
        db.query(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.account))
        .filter(Transaction.date >= start, Transaction.date < end, Transaction.pending.is_(False))
        .all()
    )

    income = 0.0
    habitual_income = 0.0
    expenses = 0.0
    by_category: dict[int, CategoryBreakdown] = {}
    by_account: dict[int, AccountBreakdown] = {}

    for tx in transactions:
        if tx.is_transfer or tx.category is None:
            continue

        # A fronted group expense only really costs you split_share — the
        # rest is someone else's money passing through your account.
        effective_amount = tx.amount
        if tx.category.kind == "expense" and tx.split_share is not None:
            effective_amount = tx.split_share

        if tx.category.kind == "income":
            income += -tx.amount
            if tx.category.id in habitual_income_ids:
                habitual_income += -tx.amount
        elif tx.category.kind == "expense":
            expenses += effective_amount

        entry = by_category.setdefault(
            tx.category.id,
            CategoryBreakdown(
                category_id=tx.category.id,
                category_name=tx.category.name,
                kind=tx.category.kind,
                total=0.0,
            ),
        )
        entry.total += abs(effective_amount)

        acc_entry = by_account.setdefault(
            tx.account.id,
            AccountBreakdown(account_id=tx.account.id, account_name=tx.account.name, total=0.0),
        )
        acc_entry.total += abs(effective_amount)

    return MonthlySummaryResponse(
        month=month,
        income=round(income, 2),
        habitual_income=round(habitual_income, 2),
        expenses=round(expenses, 2),
        net=round(income - expenses, 2),
        by_category=sorted(by_category.values(), key=lambda c: c.total, reverse=True),
        by_account=sorted(by_account.values(), key=lambda a: a.total, reverse=True),
    )


@router.get("/monthly", response_model=MonthlySummaryResponse)
def monthly_summary(month: str | None = None, db: Session = Depends(get_db)) -> MonthlySummaryResponse:
    month = month or datetime.date.today().strftime("%Y-%m")
    return _summarize(db, month)


@router.get("/trend", response_model=list[TrendPoint])
def trend(months: int = 6, month: str | None = None, db: Session = Depends(get_db)) -> list[TrendPoint]:
    end_month = month or datetime.date.today().strftime("%Y-%m")
    habitual_ids = _habitual_income_category_ids(db)
    points = []
    for offset in range(-(months - 1), 1):
        m = _shift_month(end_month, offset)
        summary = _summarize(db, m, habitual_ids)
        points.append(
            TrendPoint(
                month=m,
                income=summary.income,
                habitual_income=summary.habitual_income,
                expenses=summary.expenses,
                net=summary.net,
            )
        )
    return points


@router.get("/category-averages", response_model=list[CategoryAverage])
def category_averages(
    months: int = 6, month: str | None = None, db: Session = Depends(get_db)
) -> list[CategoryAverage]:
    end_month = month or datetime.date.today().strftime("%Y-%m")

    monthly_breakdowns = [
        _summarize(db, _shift_month(end_month, offset)).by_category
        for offset in range(-(months - 1), 1)
    ]
    current_month_totals = {c.category_id: c.total for c in monthly_breakdowns[-1]}

    totals: dict[int, dict] = {}
    for breakdown in monthly_breakdowns:
        for c in breakdown:
            entry = totals.setdefault(c.category_id, {"name": c.category_name, "kind": c.kind, "sum": 0.0})
            entry["sum"] += c.total

    results = []
    for category_id, entry in totals.items():
        average = entry["sum"] / months
        current = current_month_totals.get(category_id, 0.0)
        delta = current - average
        delta_pct = round(delta / average * 100, 1) if average > 0 else None
        results.append(
            CategoryAverage(
                category_id=category_id,
                category_name=entry["name"],
                kind=entry["kind"],
                average=round(average, 2),
                current_month=round(current, 2),
                delta=round(delta, 2),
                delta_pct=delta_pct,
            )
        )
    return sorted(results, key=lambda c: c.average, reverse=True)


@router.get("/monthly-history", response_model=list[TrendPoint])
def monthly_history(db: Session = Depends(get_db)) -> list[TrendPoint]:
    """Every month from the earliest transaction through today — powers
    year-over-year comparisons and long-window averages."""
    habitual_ids = _habitual_income_category_ids(db)
    points = []
    for month in _all_months(db):
        summary = _summarize(db, month, habitual_ids)
        points.append(
            TrendPoint(
                month=month,
                income=summary.income,
                habitual_income=summary.habitual_income,
                expenses=summary.expenses,
                net=summary.net,
            )
        )
    return points


@router.get("/category-trend", response_model=list[CategoryTrendPoint])
def category_trend(category_id: int, db: Session = Depends(get_db)) -> list[CategoryTrendPoint]:
    """One category's total for every month in history — how much did Dining
    cost each month, going all the way back."""
    habitual_ids = _habitual_income_category_ids(db)
    points = []
    for month in _all_months(db):
        breakdown = _summarize(db, month, habitual_ids).by_category
        total = next((c.total for c in breakdown if c.category_id == category_id), 0.0)
        points.append(CategoryTrendPoint(month=month, total=round(total, 2)))
    return points


@router.get("/recurring", response_model=list[RecurringMerchant])
def recurring_expenses(min_months: int = 3, db: Session = Depends(get_db)) -> list[RecurringMerchant]:
    """Merchants that charge on a regular monthly-ish cadence — subscriptions
    and other constant expenses, detected from history rather than declared."""
    transactions = (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(Transaction.is_transfer.is_(False), Transaction.pending.is_(False))
        .all()
    )

    groups: dict[str, list[Transaction]] = {}
    for tx in transactions:
        if tx.category is None or tx.category.kind != "expense":
            continue
        key = (tx.merchant_name or tx.name).strip().upper()
        groups.setdefault(key, []).append(tx)

    results = []
    for txs in groups.values():
        months = {(t.date.year, t.date.month) for t in txs}
        if len(months) < min_months:
            continue

        first_month, last_month = min(months), max(months)
        span = (last_month[0] - first_month[0]) * 12 + (last_month[1] - first_month[1]) + 1
        # Present in most months of its active span, not just clustered together.
        if len(months) / span < 0.6:
            continue

        # A fronted group expense only really costs you split_share — same
        # adjustment as everywhere else amounts get totaled.
        amounts = [t.split_share if t.split_share is not None else t.amount for t in txs]
        avg_amount = sum(amounts) / len(amounts)
        # A fixed bill charges close to the same amount every time — a grocery
        # store or gas station visited often is frequent but not "recurring"
        # in this sense, since the amount swings with every trip.
        variance = sum((a - avg_amount) ** 2 for a in amounts) / len(amounts)
        coefficient_of_variation = (variance**0.5) / abs(avg_amount) if avg_amount else 1.0
        if coefficient_of_variation > 0.15:
            continue

        latest_tx = max(txs, key=lambda t: t.date)
        latest_amount = latest_tx.split_share if latest_tx.split_share is not None else latest_tx.amount
        results.append(
            RecurringMerchant(
                merchant_name=latest_tx.merchant_name or latest_tx.name,
                category_name=latest_tx.category.name if latest_tx.category else None,
                occurrences=len(txs),
                months_active=len(months),
                average_amount=round(avg_amount, 2),
                last_amount=latest_amount,
                last_date=latest_tx.date.isoformat(),
            )
        )
    return sorted(results, key=lambda r: r.average_amount, reverse=True)


@router.get("/top-merchants", response_model=list[TopMerchant])
def top_merchants(
    months: int = 6, month: str | None = None, limit: int = 10, db: Session = Depends(get_db)
) -> list[TopMerchant]:
    """Top merchants by total spend across a trailing window (not just one
    month) — so it moves consistently with the rest of the page's time range."""
    end_month = month or datetime.date.today().strftime("%Y-%m")
    start, _ = _month_bounds(_shift_month(end_month, -(months - 1)))
    _, end = _month_bounds(end_month)

    transactions = (
        db.query(Transaction)
        .options(joinedload(Transaction.category))
        .filter(
            Transaction.date >= start,
            Transaction.date < end,
            Transaction.pending.is_(False),
            Transaction.is_transfer.is_(False),
        )
        .all()
    )

    totals: dict[str, dict] = {}
    for tx in transactions:
        if tx.category is None or tx.category.kind != "expense":
            continue
        effective_amount = tx.split_share if tx.split_share is not None else tx.amount
        key = tx.merchant_name or tx.name
        entry = totals.setdefault(key, {"total": 0.0, "count": 0})
        entry["total"] += effective_amount
        entry["count"] += 1

    merchants = [
        TopMerchant(merchant_name=name, total=round(v["total"], 2), count=v["count"])
        for name, v in totals.items()
    ]
    return sorted(merchants, key=lambda m: m.total, reverse=True)[:limit]
