from pydantic import BaseModel, ConfigDict


class CategoryRuleCreate(BaseModel):
    match_type: str  # merchant_contains | name_contains | plaid_category_equals
    match_value: str
    category_id: int
    priority: int = 0


class CategoryRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    match_type: str
    match_value: str
    category_id: int
    priority: int
