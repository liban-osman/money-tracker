from pydantic import BaseModel, ConfigDict


class HoldingCreate(BaseModel):
    symbol: str
    name: str | None = None
    asset_type: str  # stock | etf | crypto | cash | workplace_rrsp
    quantity: float
    average_cost: float | None = None
    include_in_net_worth: bool = True
    note: str | None = None


class HoldingUpdate(BaseModel):
    symbol: str | None = None
    name: str | None = None
    asset_type: str | None = None
    quantity: float | None = None
    average_cost: float | None = None
    include_in_net_worth: bool | None = None
    note: str | None = None


class HoldingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    symbol: str
    name: str | None
    asset_type: str
    quantity: float
    average_cost: float | None
    include_in_net_worth: bool
    note: str | None
    price_cad: float | None = None
    market_value_cad: float | None = None
    cost_basis_cad: float | None = None
    gain_loss_cad: float | None = None
    gain_loss_pct: float | None = None
    price_unavailable: bool = False


class NetWorthResponse(BaseModel):
    cash: float
    liabilities: float
    investments: float
    net_worth: float
    by_account: list[dict]
    holdings: list[HoldingResponse]
    excluded_holdings: list[HoldingResponse]
