import datetime

from sqlalchemy import Boolean, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Holding(Base):
    __tablename__ = "holdings"

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String)  # ticker (VOO, AAPL) or crypto symbol (BTC, ETH)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    asset_type: Mapped[str] = mapped_column(String)  # stock | etf | crypto | cash | workplace_rrsp
    quantity: Mapped[float] = mapped_column(Float)
    average_cost: Mapped[float | None] = mapped_column(Float, nullable=True)  # per-unit, in quote currency
    include_in_net_worth: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow
    )
