from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.category import Category
from app.schemas.category import CategoryResponse
from app.services import sync_service

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryResponse])
def list_categories(db: Session = Depends(get_db)) -> list[Category]:
    return db.query(Category).order_by(Category.kind, Category.name).all()


@router.post("/recategorize")
def recategorize(db: Session = Depends(get_db)) -> dict[str, int]:
    return {"updated": sync_service.recategorize_all(db)}
