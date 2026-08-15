from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.category_rule import CategoryRule

# Plaid's personal_finance_category taxonomy: https://plaid.com/docs/api/products/transactions/#personal-finance-category
# (our category name, kind) per Plaid "primary" category.
#
# Deliberately few expense buckets — anything without a specific merchant rule
# (see CategoryRule) or a dedicated bucket here (Dining, Shopping, Entertainment,
# Travel/Transportation, Donations) lands in "Other" rather than getting its own
# category. "Monthly Bills" is populated entirely by merchant rules (Apple,
# Public Mobile, etc.) since Plaid's taxonomy has no "fixed recurring bill"
# concept of its own.
_PRIMARY_MAP: dict[str, tuple[str, str]] = {
    "INCOME": ("Income", "income"),
    "TRANSFER_IN": ("Transfers", "transfer"),
    "TRANSFER_OUT": ("Transfers", "transfer"),
    "LOAN_PAYMENTS": ("Other", "expense"),
    "BANK_FEES": ("Other", "expense"),
    "ENTERTAINMENT": ("Entertainment", "expense"),
    "FOOD_AND_DRINK": ("Dining", "expense"),
    "GENERAL_MERCHANDISE": ("Shopping", "expense"),
    "HOME_IMPROVEMENT": ("Other", "expense"),
    "MEDICAL": ("Medical", "expense"),
    "PERSONAL_CARE": ("Other", "expense"),
    "GENERAL_SERVICES": ("Other", "expense"),
    "GOVERNMENT_AND_NON_PROFIT": ("Donations", "expense"),
    "TRANSPORTATION": ("Travel/Transportation", "expense"),
    "TRAVEL": ("Travel/Transportation", "expense"),
    "RENT_AND_UTILITIES": ("Other", "expense"),
}

# Overrides at the more specific "detailed" level. A credit card payment is a
# transfer between the user's own accounts (checking -> credit card), not a
# real expense, even though its primary category is LOAN_PAYMENTS (which
# otherwise represents real expenses like mortgage/student loan payments).
_DETAILED_OVERRIDES: dict[str, tuple[str, str]] = {
    "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT": ("Transfers", "transfer"),
    # Split out income by source instead of lumping it all as "Income".
    "INCOME_SALARY": ("Salary", "income"),
    "INCOME_WAGES": ("Wages", "income"),
    "INCOME_DIVIDENDS": ("Dividends", "income"),
    "INCOME_INTEREST_EARNED": ("Interest", "income"),
    "INCOME_RETIREMENT_PENSION": ("Retirement & Pension", "income"),
    "INCOME_TAX_REFUND": ("Tax Refund", "income"),
    "INCOME_UNEMPLOYMENT": ("Unemployment", "income"),
    "INCOME_OTHER_INCOME": ("Other Income", "income"),
}

_FALLBACK = ("Uncategorized", "expense")


def _get_or_create_category(db: Session, name: str, kind: str) -> Category:
    category = db.query(Category).filter(Category.name == name, Category.kind == kind).first()
    if category is None:
        category = Category(name=name, kind=kind)
        db.add(category)
        db.flush()
    return category


def _match_rules(db: Session, tx_data: dict) -> Category | None:
    rules = db.query(CategoryRule).order_by(CategoryRule.priority.desc()).all()
    merchant = (tx_data.get("merchant_name") or "").lower()
    name = (tx_data.get("name") or "").lower()
    pfc = tx_data.get("personal_finance_category") or {}
    detailed = pfc.get("detailed") or ""

    for rule in rules:
        value = rule.match_value.lower()
        if rule.match_type == "merchant_contains" and value in merchant:
            return rule.category
        if rule.match_type == "name_contains" and value in name:
            return rule.category
        if rule.match_type == "plaid_category_equals" and rule.match_value == detailed:
            return rule.category
    return None


def resolve_category(db: Session, tx_data: dict) -> tuple[Category, bool]:
    """Returns (category, is_transfer) for a raw Plaid transaction dict."""
    rule_match = _match_rules(db, tx_data)
    if rule_match is not None:
        return rule_match, rule_match.kind == "transfer"

    pfc = tx_data.get("personal_finance_category") or {}
    primary = pfc.get("primary")
    detailed = pfc.get("detailed")

    name, kind = _DETAILED_OVERRIDES.get(detailed) or _PRIMARY_MAP.get(primary, _FALLBACK)
    category = _get_or_create_category(db, name, kind)
    return category, kind == "transfer"
