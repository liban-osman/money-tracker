from pydantic import BaseModel


class CategoryBreakdown(BaseModel):
    category_id: int
    category_name: str
    kind: str
    total: float


class AccountBreakdown(BaseModel):
    account_id: int
    account_name: str
    total: float


class MonthlySummaryResponse(BaseModel):
    month: str
    income: float
    habitual_income: float
    expenses: float
    net: float
    by_category: list[CategoryBreakdown]
    by_account: list[AccountBreakdown]


class TrendPoint(BaseModel):
    month: str
    income: float
    habitual_income: float
    expenses: float
    net: float


class CategoryTrendPoint(BaseModel):
    month: str
    total: float


class CategoryAverage(BaseModel):
    category_id: int
    category_name: str
    kind: str
    average: float
    current_month: float
    delta: float
    delta_pct: float | None


class TopMerchant(BaseModel):
    merchant_name: str
    total: float
    count: int


class RecurringMerchant(BaseModel):
    merchant_name: str
    category_name: str | None
    occurrences: int
    months_active: int
    average_amount: float
    last_amount: float
    last_date: str


class BillItem(BaseModel):
    label: str
    frequency: str  # "monthly" | "annual"
    monthly_amount: float
    charge_count: int
    last_amount: float | None
    last_date: str | None
    active: bool


class MonthlyBillsResponse(BaseModel):
    items: list[BillItem]
    total_monthly: float
