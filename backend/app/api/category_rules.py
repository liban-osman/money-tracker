from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.category_rule import CategoryRule
from app.schemas.category_rule import CategoryRuleCreate, CategoryRuleResponse

router = APIRouter(prefix="/category-rules", tags=["category-rules"])


@router.get("", response_model=list[CategoryRuleResponse])
def list_rules(db: Session = Depends(get_db)) -> list[CategoryRule]:
    return db.query(CategoryRule).order_by(CategoryRule.priority.desc()).all()


@router.post("", response_model=CategoryRuleResponse)
def create_rule(body: CategoryRuleCreate, db: Session = Depends(get_db)) -> CategoryRule:
    rule = CategoryRule(**body.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)) -> None:
    rule = db.get(CategoryRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    db.delete(rule)
    db.commit()
