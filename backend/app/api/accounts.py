from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.account import Account
from app.schemas.account import AccountResponse
from app.services import csv_import_service

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[AccountResponse])
def list_accounts(db: Session = Depends(get_db)) -> list[Account]:
    return db.query(Account).all()


@router.post("/{account_id}/import-csv")
async def import_csv(
    account_id: int, file: UploadFile, db: Session = Depends(get_db)
) -> dict:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")

    raw = await file.read()
    content = raw.decode("utf-8-sig")  # utf-8-sig strips a BOM if the export has one
    return csv_import_service.import_csv(db, account, content)
