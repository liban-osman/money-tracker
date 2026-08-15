import csv
import datetime
import hashlib
import io

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.transaction import Transaction
from app.services import categorization_service

_DATE_FORMATS = ["%d %b %Y", "%Y-%m-%d", "%m/%d/%Y"]

# Bank statement "transaction date" and Plaid's posting date for the same
# charge commonly differ by a few days — widen the match so CSV imports don't
# create duplicates of transactions Plaid already synced.
_DEDUP_DATE_TOLERANCE = datetime.timedelta(days=5)


def _parse_date(value: str) -> datetime.date:
    value = value.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Unrecognized date format: {value!r}")


def _synthetic_id(account_id: int, date: datetime.date, amount: float, description: str) -> str:
    digest = hashlib.sha1(f"{account_id}|{date}|{amount}|{description}".encode()).hexdigest()[:20]
    return f"csv:{digest}"


def import_csv(db: Session, account: Account, file_content: str) -> dict:
    reader = csv.DictReader(io.StringIO(file_content))
    added = 0
    skipped_duplicate = 0
    skipped_existing = 0
    skipped_invalid = 0
    # Two real transactions can share the same date/amount/description (e.g. two
    # identical coffee purchases same day) — count occurrences so each gets a
    # distinct id instead of colliding, while re-importing the same file stays
    # idempotent (same row order -> same suffixes every time).
    occurrence_counts: dict[str, int] = {}

    for row in reader:
        try:
            date = _parse_date(row["Date"])
            amount = float(row["Amount"])
        except (KeyError, ValueError):
            skipped_invalid += 1
            continue

        description = (row.get("Merchant") or row.get("Description") or "").strip()
        if not description:
            skipped_invalid += 1
            continue

        base_id = _synthetic_id(account.id, date, amount, description)
        occurrence_counts[base_id] = occurrence_counts.get(base_id, 0) + 1
        occurrence = occurrence_counts[base_id]
        synthetic_id = base_id if occurrence == 1 else f"{base_id}-{occurrence}"

        if db.query(Transaction).filter(Transaction.plaid_transaction_id == synthetic_id).first():
            skipped_duplicate += 1
            continue

        # If Plaid already synced a matching transaction (same account/amount,
        # date within a few days — transaction date vs. posting date drift),
        # don't create a second copy of it from the CSV.
        existing = (
            db.query(Transaction)
            .filter(
                Transaction.account_id == account.id,
                Transaction.amount == amount,
                Transaction.date >= date - _DEDUP_DATE_TOLERANCE,
                Transaction.date <= date + _DEDUP_DATE_TOLERANCE,
                ~Transaction.plaid_transaction_id.like("csv:%"),
            )
            .first()
        )
        if existing is not None:
            skipped_existing += 1
            continue

        tx_data = {
            "merchant_name": description,
            "name": description,
            "personal_finance_category": {},
        }
        category, is_transfer = categorization_service.resolve_category(db, tx_data)

        db.add(
            Transaction(
                plaid_transaction_id=synthetic_id,
                account_id=account.id,
                date=date,
                name=description,
                merchant_name=description,
                amount=amount,
                pending=False,
                category_id=category.id,
                is_transfer=is_transfer,
            )
        )
        db.flush()
        added += 1

    db.commit()
    return {
        "added": added,
        "skipped_duplicate": skipped_duplicate,
        "skipped_existing": skipped_existing,
        "skipped_invalid": skipped_invalid,
    }
