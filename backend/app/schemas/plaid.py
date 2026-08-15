from pydantic import BaseModel


class LinkTokenResponse(BaseModel):
    link_token: str


class ExchangeTokenRequest(BaseModel):
    public_token: str


class ExchangeTokenResponse(BaseModel):
    item_id: int
    institution_name: str
    accounts_linked: int


class SyncItemResult(BaseModel):
    institution_name: str
    added: int
    modified: int
    removed: int


class SyncResponse(BaseModel):
    items: list[SyncItemResult]
