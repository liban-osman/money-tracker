import datetime

from pydantic import BaseModel, ConfigDict, computed_field

from app.schemas.category import CategoryResponse


class TransactionAccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    mask: str | None


class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: datetime.date
    name: str
    merchant_name: str | None
    amount: float
    pending: bool
    category: CategoryResponse | None
    is_transfer: bool
    notes: str | None
    account: TransactionAccountResponse
    split_share: float | None
    split_settled: bool
    category_overridden: bool

    @computed_field
    @property
    def owed_amount(self) -> float | None:
        if self.split_share is None:
            return None
        return round(self.amount - self.split_share, 2)


class TransactionUpdateRequest(BaseModel):
    category_id: int | None = None
    notes: str | None = None
    split_share: float | None = None
    split_settled: bool | None = None


class BulkCategorizeRequest(BaseModel):
    transaction_ids: list[int]
    category_id: int
