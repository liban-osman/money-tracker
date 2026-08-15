from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.account import Account
from app.models.holding import Holding
from app.schemas.holding import HoldingCreate, HoldingResponse, HoldingUpdate, NetWorthResponse
from app.services import market_data_service

router = APIRouter(prefix="/holdings", tags=["holdings"])


def _with_live_price(holding: Holding) -> HoldingResponse:
    data = HoldingResponse.model_validate(holding)

    if holding.asset_type in ("cash", "workplace_rrsp"):
        # Plain cash, or a fund with no public ticker (e.g. a group RRSP) —
        # the quantity IS the CAD value, no market price or gain/loss involved.
        data.price_cad = 1.0
        data.market_value_cad = round(holding.quantity, 2)
        return data

    price = market_data_service.price_in_cad(holding.symbol, holding.asset_type)

    if price is None:
        data.price_unavailable = True
        return data

    data.price_cad = round(price, 2)
    data.market_value_cad = round(price * holding.quantity, 2)
    if holding.average_cost is not None:
        cost_basis = holding.average_cost * holding.quantity
        data.cost_basis_cad = round(cost_basis, 2)
        gain_loss = data.market_value_cad - cost_basis
        data.gain_loss_cad = round(gain_loss, 2)
        data.gain_loss_pct = round(gain_loss / cost_basis * 100, 2) if cost_basis else None
    return data


@router.get("", response_model=list[HoldingResponse])
def list_holdings(db: Session = Depends(get_db)) -> list[HoldingResponse]:
    holdings = db.query(Holding).all()
    return [_with_live_price(h) for h in holdings]


@router.post("", response_model=HoldingResponse)
def create_holding(payload: HoldingCreate, db: Session = Depends(get_db)) -> HoldingResponse:
    holding = Holding(**payload.model_dump())
    db.add(holding)
    db.commit()
    db.refresh(holding)
    return _with_live_price(holding)


@router.patch("/{holding_id}", response_model=HoldingResponse)
def update_holding(
    holding_id: int, payload: HoldingUpdate, db: Session = Depends(get_db)
) -> HoldingResponse:
    holding = db.get(Holding, holding_id)
    if holding is None:
        raise HTTPException(status_code=404, detail="Holding not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(holding, field, value)

    db.commit()
    db.refresh(holding)
    return _with_live_price(holding)


@router.delete("/{holding_id}")
def delete_holding(holding_id: int, db: Session = Depends(get_db)) -> dict:
    holding = db.get(Holding, holding_id)
    if holding is None:
        raise HTTPException(status_code=404, detail="Holding not found")

    db.delete(holding)
    db.commit()
    return {"deleted": True}


@router.get("/net-worth", response_model=NetWorthResponse)
def net_worth(db: Session = Depends(get_db)) -> NetWorthResponse:
    accounts = db.query(Account).all()
    all_holdings = [_with_live_price(h) for h in db.query(Holding).all()]
    holdings = [h for h in all_holdings if h.include_in_net_worth]
    excluded_holdings = [h for h in all_holdings if not h.include_in_net_worth]

    bank_cash = sum(a.current_balance or 0.0 for a in accounts if a.type == "depository")
    manual_cash = sum(h.market_value_cad or 0.0 for h in holdings if h.asset_type == "cash")
    liabilities = sum(a.current_balance or 0.0 for a in accounts if a.type == "credit")
    linked_investments = sum(a.current_balance or 0.0 for a in accounts if a.type == "investment")
    holdings_value = sum(h.market_value_cad or 0.0 for h in holdings if h.asset_type != "cash")

    cash = bank_cash + manual_cash
    investments = linked_investments + holdings_value

    by_account = [
        {
            "account_id": a.id,
            "account_name": a.name,
            "type": a.type,
            "balance": a.current_balance or 0.0,
        }
        for a in accounts
    ]

    return NetWorthResponse(
        cash=round(cash, 2),
        liabilities=round(liabilities, 2),
        investments=round(investments, 2),
        net_worth=round(cash - liabilities + investments, 2),
        by_account=by_account,
        holdings=holdings,
        excluded_holdings=excluded_holdings,
    )
