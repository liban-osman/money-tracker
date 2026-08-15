from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    # merchant_contains | name_contains | plaid_category_equals
    match_type: Mapped[str] = mapped_column(String)
    match_value: Mapped[str] = mapped_column(String)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    priority: Mapped[int] = mapped_column(Integer, default=0)

    category: Mapped["Category"] = relationship()
