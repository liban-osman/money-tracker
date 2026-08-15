from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    accounts,
    categories,
    category_rules,
    health,
    holdings,
    plaid,
    summary,
    transactions,
)
from app.core.config import settings
from app.core.db import Base, engine

app = FastAPI(title="Money Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(plaid.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(category_rules.router, prefix="/api")
app.include_router(summary.router, prefix="/api")
app.include_router(holdings.router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    import app.models  # noqa: F401  (register models on Base before create_all)

    Base.metadata.create_all(bind=engine)
