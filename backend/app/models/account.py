from sqlalchemy import Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    plaid_item_id: Mapped[int] = mapped_column(ForeignKey("plaid_items.id"))
    plaid_account_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    name: Mapped[str] = mapped_column(String)
    official_name: Mapped[str | None] = mapped_column(String, nullable=True)
    type: Mapped[str] = mapped_column(String)  # depository | credit
    subtype: Mapped[str | None] = mapped_column(String, nullable=True)
    mask: Mapped[str | None] = mapped_column(String, nullable=True)
    current_balance: Mapped[float | None] = mapped_column(Float, nullable=True)
    available_balance: Mapped[float | None] = mapped_column(Float, nullable=True)
    credit_limit: Mapped[float | None] = mapped_column(Float, nullable=True)

    plaid_item: Mapped["PlaidItem"] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")
