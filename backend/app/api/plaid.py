import json

import plaid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.account import Account
from app.schemas.plaid import (
    ExchangeTokenRequest,
    ExchangeTokenResponse,
    LinkTokenResponse,
    SyncResponse,
)
from app.services import plaid_service, sync_service

router = APIRouter(prefix="/plaid", tags=["plaid"])


def _plaid_error_detail(exc: plaid.ApiException) -> str:
    try:
        body = json.loads(exc.body)
        return body.get("error_message", str(exc))
    except (TypeError, ValueError):
        return str(exc)


@router.post("/link-token", response_model=LinkTokenResponse)
def create_link_token() -> LinkTokenResponse:
    try:
        return LinkTokenResponse(link_token=plaid_service.create_link_token())
    except plaid.ApiException as exc:
        raise HTTPException(status_code=502, detail=_plaid_error_detail(exc)) from exc


@router.post("/exchange", response_model=ExchangeTokenResponse)
def exchange_public_token(
    body: ExchangeTokenRequest, db: Session = Depends(get_db)
) -> ExchangeTokenResponse:
    try:
        access_token, item_id = plaid_service.exchange_public_token(body.public_token)
        item = sync_service.create_item_with_accounts(db, access_token, item_id)
    except plaid.ApiException as exc:
        raise HTTPException(status_code=502, detail=_plaid_error_detail(exc)) from exc

    accounts_linked = db.query(Account).filter(Account.plaid_item_id == item.id).count()
    return ExchangeTokenResponse(
        item_id=item.id, institution_name=item.institution_name, accounts_linked=accounts_linked
    )


@router.post("/sync", response_model=SyncResponse)
def sync_transactions(db: Session = Depends(get_db)) -> SyncResponse:
    try:
        results = sync_service.sync_all_items(db)
    except plaid.ApiException as exc:
        raise HTTPException(status_code=502, detail=_plaid_error_detail(exc)) from exc
    return SyncResponse(items=results)
