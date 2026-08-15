import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.transaction import BulkCategorizeRequest, TransactionResponse, TransactionUpdateRequest

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _apply_category(transaction: Transaction, category: Category) -> None:
    transaction.category_id = category.id
    # A transaction's transfer status follows its category now — moving a
    # mislabeled "transfer" (e.g. a repayment that's actually real income)
    # onto a real category makes it count; moving one onto "Transfers"
    # excludes it again.
    transaction.is_transfer = category.kind == "transfer"
    # Once you pick a category by hand, it's permanent — future syncs won't
    # silently revert it back to the rule/taxonomy default.
    transaction.category_overridden = True


@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    month: str | None = None,  # "YYYY-MM"
    year: int | None = None,  # "YYYY" — ignored if month is also given
    db: Session = Depends(get_db),
) -> list[Transaction]:
    query = db.query(Transaction).options(
        joinedload(Transaction.category), joinedload(Transaction.account)
    )
    if month:
        start = datetime.date.fromisoformat(f"{month}-01")
        end = datetime.date(start.year + (start.month == 12), start.month % 12 + 1, 1)
        query = query.filter(Transaction.date >= start, Transaction.date < end)
    elif year:
        query = query.filter(
            Transaction.date >= datetime.date(year, 1, 1), Transaction.date < datetime.date(year + 1, 1, 1)
        )
    return query.order_by(Transaction.date.desc(), Transaction.id.desc()).all()


@router.patch("/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int, body: TransactionUpdateRequest, db: Session = Depends(get_db)
) -> Transaction:
    transaction = db.get(Transaction, transaction_id)
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")

    updates = body.model_dump(exclude_unset=True)

    if "category_id" in updates and updates["category_id"] is not None:
        category = db.get(Category, updates["category_id"])
        if category is None:
            raise HTTPException(status_code=400, detail="Category not found")
        _apply_category(transaction, category)
    if "notes" in updates:
        transaction.notes = updates["notes"]
    if "split_share" in updates:
        share = updates["split_share"]
        if share is not None:
            if transaction.amount <= 0:
                raise HTTPException(
                    status_code=400, detail="Only positive-amount expenses can be split"
                )
            if share < 0 or share > transaction.amount:
                raise HTTPException(
                    status_code=400, detail="split_share must be between 0 and the transaction amount"
                )
        transaction.split_share = share
        if share is None:
            transaction.split_settled = False
    if "split_settled" in updates and updates["split_settled"] is not None:
        transaction.split_settled = updates["split_settled"]

    db.commit()
    db.refresh(transaction)
    return transaction


@router.post("/bulk-categorize")
def bulk_categorize(body: BulkCategorizeRequest, db: Session = Depends(get_db)) -> dict:
    category = db.get(Category, body.category_id)
    if category is None:
        raise HTTPException(status_code=400, detail="Category not found")
    if not body.transaction_ids:
        return {"updated": 0}

    transactions = db.query(Transaction).filter(Transaction.id.in_(body.transaction_ids)).all()
    for transaction in transactions:
        _apply_category(transaction, category)

    db.commit()
    return {"updated": len(transactions)}


@router.get("/owed", response_model=list[TransactionResponse])
def list_owed_transactions(db: Session = Depends(get_db)) -> list[Transaction]:
    """Group expenses you fronted that are still waiting on repayment."""
    return (
        db.query(Transaction)
        .options(joinedload(Transaction.category), joinedload(Transaction.account))
        .filter(Transaction.split_share.is_not(None), Transaction.split_settled.is_(False))
        .order_by(Transaction.date.desc())
        .all()
    )
