import datetime

from sqlalchemy import Boolean, Date, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    plaid_transaction_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    date: Mapped[datetime.date] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String)
    merchant_name: Mapped[str | None] = mapped_column(String, nullable=True)
    # Plaid convention: positive = money out (expense), negative = money in (income)
    amount: Mapped[float] = mapped_column(Float)
    pending: Mapped[bool] = mapped_column(Boolean, default=False)

    plaid_category_primary: Mapped[str | None] = mapped_column(String, nullable=True)
    plaid_category_detailed: Mapped[str | None] = mapped_column(String, nullable=True)

    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    is_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)

    # Once you pick a category from the dropdown, it's permanent — future
    # Plaid syncs (which re-send a transaction as "modified" surprisingly
    # often, e.g. on enrichment updates) must not silently overwrite it.
    category_overridden: Mapped[bool] = mapped_column(Boolean, default=False)

    # Group expenses: you fronted the full amount, but only split_share is
    # really yours — the rest (amount - split_share) is owed to you until
    # split_settled is set.
    split_share: Mapped[float | None] = mapped_column(Float, nullable=True)
    split_settled: Mapped[bool] = mapped_column(Boolean, default=False)

    account: Mapped["Account"] = relationship(back_populates="transactions")
    category: Mapped["Category | None"] = relationship()
