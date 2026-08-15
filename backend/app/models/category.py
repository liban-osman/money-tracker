from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)  # income | expense | transfer
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    color: Mapped[str | None] = mapped_column(String, nullable=True)

    parent: Mapped["Category | None"] = relationship(remote_side="Category.id")
