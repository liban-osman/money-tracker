from pydantic import BaseModel, ConfigDict


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    official_name: str | None
    type: str
    subtype: str | None
    mask: str | None
    current_balance: float | None
    available_balance: float | None
    credit_limit: float | None
