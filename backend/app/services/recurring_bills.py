import datetime

from sqlalchemy.orm import Session

from app.models.transaction import Transaction

# Manually curated, in contrast to the heuristic-based /summary/recurring
# detector — that one false-positives on frequent-but-irregular spending
# (gas station fill-ups, a favorite restaurant). This list is short and
# exact: real subscriptions/bills, confirmed against transaction history.
BILLS: list[dict] = [
    {"label": "Apple", "patterns": ["apple"], "frequency": "monthly"},
    {"label": "ABC Fitness", "patterns": ["abc fitness"], "frequency": "monthly"},
    {"label": "Public Mobile", "patterns": ["public mobile"], "frequency": "monthly"},
    {"label": "Membership Fee Installment", "patterns": ["membership fee installment"], "frequency": "monthly"},
    {"label": "Anthropic", "patterns": ["anthropic", "anthro pic"], "frequency": "monthly"},
    {"label": "Crunchyroll", "patterns": ["crunchyroll"], "frequency": "annual"},
]

# A monthly bill's charges can land on slightly different days each cycle
# (the 4th one month, the 6th the next) — 35 days comfortably covers one
# cycle either way. An annual bill gets a much wider window since it only
# fires once a year.
_MONTHLY_WINDOW_DAYS = 35
_ANNUAL_WINDOW_DAYS = 400


def _matches(tx: Transaction, patterns: list[str]) -> bool:
    haystack = f"{tx.merchant_name or ''} {tx.name or ''}".lower()
    return any(p in haystack for p in patterns)


def compute_bills(db: Session) -> tuple[list[dict], float]:
    today = datetime.date.today()

    transactions = (
        db.query(Transaction)
        .filter(Transaction.is_transfer.is_(False), Transaction.pending.is_(False), Transaction.amount > 0)
        .order_by(Transaction.date.desc())
        .all()
    )

    items = []
    total_monthly = 0.0

    for bill in BILLS:
        matches = [t for t in transactions if _matches(t, bill["patterns"])]
        window_days = _ANNUAL_WINDOW_DAYS if bill["frequency"] == "annual" else _MONTHLY_WINDOW_DAYS
        cutoff = today - datetime.timedelta(days=window_days)
        in_window = [t for t in matches if t.date >= cutoff]

        last_tx = matches[0] if matches else None  # matches is already date-desc

        if bill["frequency"] == "annual":
            monthly_amount = round(last_tx.amount / 12, 2) if last_tx and last_tx in in_window else 0.0
        else:
            monthly_amount = round(sum(t.amount for t in in_window), 2)

        active = bool(in_window)
        if active:
            total_monthly += monthly_amount

        items.append(
            {
                "label": bill["label"],
                "frequency": bill["frequency"],
                "monthly_amount": monthly_amount,
                "charge_count": len(in_window),
                "last_amount": round(last_tx.amount, 2) if last_tx else None,
                "last_date": last_tx.date.isoformat() if last_tx else None,
                "active": active,
            }
        )

    return items, round(total_monthly, 2)
