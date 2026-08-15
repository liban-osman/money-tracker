import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class PlaidItem(Base):
    __tablename__ = "plaid_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    plaid_item_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    institution_name: Mapped[str] = mapped_column(String)
    access_token: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )
    last_synced_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)
    cursor: Mapped[str | None] = mapped_column(String, nullable=True)

    accounts: Mapped[list["Account"]] = relationship(back_populates="plaid_item")
