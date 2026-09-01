import datetime

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.plaid_item import PlaidItem
from app.models.transaction import Transaction
from app.services import categorization_service, plaid_service


def create_item_with_accounts(db: Session, access_token: str, plaid_item_id: str) -> PlaidItem:
    institution_name = plaid_service.get_institution_name(access_token)

    item = PlaidItem(
        plaid_item_id=plaid_item_id,
        institution_name=institution_name,
        access_token=access_token,
    )
    db.add(item)
    db.flush()  # assign item.id before creating dependent accounts

    for account_data in plaid_service.get_accounts(access_token):
        db.add(
            Account(
                plaid_item_id=item.id,
                plaid_account_id=account_data["account_id"],
                name=account_data["name"],
                official_name=account_data.get("official_name"),
                type=str(account_data["type"]),
                subtype=str(account_data.get("subtype")) if account_data.get("subtype") else None,
                mask=account_data.get("mask"),
                current_balance=account_data.get("balances", {}).get("current"),
                available_balance=account_data.get("balances", {}).get("available"),
                credit_limit=account_data.get("balances", {}).get("limit"),
            )
        )

    db.commit()
    db.refresh(item)
    return item


def _upsert_transaction(db: Session, tx_data: dict, account_by_plaid_id: dict[str, Account]) -> None:
    account = account_by_plaid_id.get(tx_data["account_id"])
    if account is None:
        return  # transaction on an account we don't track (shouldn't normally happen)

    pfc = tx_data.get("personal_finance_category") or {}

    existing = (
        db.query(Transaction)
        .filter(Transaction.plaid_transaction_id == tx_data["transaction_id"])
        .first()
    )
    is_new = existing is None
    if existing is None:
        existing = Transaction(plaid_transaction_id=tx_data["transaction_id"])
        db.add(existing)

    existing.account_id = account.id
    # authorized_date is when the purchase actually happened (matches your
    # bank statement/phone); date is when it posted/settled, which can lag by
    # a day or two — prefer authorized_date, falling back to date when Plaid
    # doesn't return one (e.g. some older or already-settled transactions).
    existing.date = tx_data.get("authorized_date") or tx_data["date"]
    existing.name = tx_data["name"]
    existing.merchant_name = tx_data.get("merchant_name")
    existing.amount = tx_data["amount"]
    existing.pending = tx_data["pending"]
    existing.plaid_category_primary = pfc.get("primary")
    existing.plaid_category_detailed = pfc.get("detailed")

    # A pending transaction's amount can change once it posts (e.g. a gas
    # station hold finalizing) — keep a stale split_share from exceeding the
    # corrected amount, which would otherwise show a negative "owed" amount.
    if existing.split_share is not None:
        if existing.amount <= 0:
            existing.split_share = None
            existing.split_settled = False
        elif existing.split_share > existing.amount:
            existing.split_share = existing.amount

    # Plaid resends a transaction as "modified" surprisingly often (enrichment
    # updates, pending->posted transitions) — once you've picked a category
    # by hand, later syncs must not silently overwrite it.
    if is_new or not existing.category_overridden:
        category, is_transfer = categorization_service.resolve_category(db, tx_data)
        existing.category_id = category.id
        existing.is_transfer = is_transfer


def _remove_transaction(db: Session, plaid_transaction_id: str) -> None:
    db.query(Transaction).filter(
        Transaction.plaid_transaction_id == plaid_transaction_id
    ).delete()


def _refresh_account_balances(db: Session, item: PlaidItem, account_by_plaid_id: dict[str, Account]) -> None:
    for account_data in plaid_service.get_accounts(item.access_token):
        account = account_by_plaid_id.get(account_data["account_id"])
        if account is None:
            continue
        balances = account_data.get("balances", {})
        account.current_balance = balances.get("current")
        account.available_balance = balances.get("available")
        account.credit_limit = balances.get("limit")


def sync_item_transactions(db: Session, item: PlaidItem) -> dict:
    accounts = db.query(Account).filter(Account.plaid_item_id == item.id).all()
    account_by_plaid_id = {a.plaid_account_id: a for a in accounts}

    _refresh_account_balances(db, item, account_by_plaid_id)

    cursor = item.cursor
    added = modified = removed = 0
    has_more = True

    while has_more:
        result = plaid_service.sync_transactions(item.access_token, cursor)

        for tx_data in result["added"]:
            _upsert_transaction(db, tx_data, account_by_plaid_id)
            added += 1
        for tx_data in result["modified"]:
            _upsert_transaction(db, tx_data, account_by_plaid_id)
            modified += 1
        for removed_tx in result["removed"]:
            _remove_transaction(db, removed_tx["transaction_id"])
            removed += 1

        cursor = result["next_cursor"]
        has_more = result["has_more"]

    item.cursor = cursor
    item.last_synced_at = datetime.datetime.utcnow()
    db.commit()
    return {"added": added, "modified": modified, "removed": removed}


def sync_all_items(db: Session) -> list[dict]:
    results = []
    for item in db.query(PlaidItem).all():
        stats = sync_item_transactions(db, item)
        results.append({"institution_name": item.institution_name, **stats})
    return results


def recategorize_all(db: Session) -> int:
    """Re-runs categorization against already-synced transactions using their
    stored Plaid category fields — useful after changing the mapping/rules
    without needing to re-pull from Plaid. Skips transactions you've manually
    recategorized — those are permanent until you change them yourself."""
    count = 0
    for tx in db.query(Transaction).filter(Transaction.category_overridden.is_(False)).all():
        tx_data = {
            "merchant_name": tx.merchant_name,
            "name": tx.name,
            "personal_finance_category": {
                "primary": tx.plaid_category_primary,
                "detailed": tx.plaid_category_detailed,
            },
        }
        category, is_transfer = categorization_service.resolve_category(db, tx_data)
        tx.category_id = category.id
        tx.is_transfer = is_transfer
        count += 1
    db.commit()
    return count
