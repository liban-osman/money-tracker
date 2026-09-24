import time

import httpx

_CACHE_TTL_SECONDS = 60
_cache: dict[str, tuple[float, dict]] = {}

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; money-tracker/1.0)"}

# Common ticker -> CoinGecko id. Anything not listed falls back to the
# lowercased symbol, which happens to match CoinGecko's id for many coins.
_COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "SOL": "solana",
    "ADA": "cardano",
    "DOGE": "dogecoin",
    "XRP": "ripple",
    "DOT": "polkadot",
    "MATIC": "matic-network",
    "POL": "matic-network",
    "LTC": "litecoin",
    "LINK": "chainlink",
    "AVAX": "avalanche-2",
    "USDT": "tether",
    "USDC": "usd-coin",
    "BNB": "binancecoin",
    "TRX": "tron",
    "SHIB": "shiba-inu",
    "UNI": "uniswap",
    "ATOM": "cosmos",
    "XLM": "stellar",
    "ETC": "ethereum-classic",
    "FIL": "filecoin",
    "APT": "aptos",
    "ARB": "arbitrum",
    "OP": "optimism",
    "NEAR": "near",
    "ICP": "internet-computer",
    "HBAR": "hedera-hashgraph",
    "VET": "vechain",
    "ALGO": "algorand",
}


def _cached(key: str) -> dict | None:
    hit = _cache.get(key)
    if hit is None:
        return None
    fetched_at, value = hit
    if time.time() - fetched_at > _CACHE_TTL_SECONDS:
        return None
    return value


def _store(key: str, value: dict) -> None:
    _cache[key] = (time.time(), value)


def get_equity_quote(symbol: str) -> dict | None:
    """Returns {"price": float, "currency": str} for a stock/ETF ticker, or
    None if the quote can't be fetched (bad symbol, network issue, etc.)."""
    cache_key = f"equity:{symbol.upper()}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached

    try:
        resp = httpx.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
            headers=_HEADERS,
            timeout=5.0,
        )
        resp.raise_for_status()
        meta = resp.json()["chart"]["result"][0]["meta"]
        result = {
            "price": float(meta["regularMarketPrice"]),
            "currency": meta.get("currency", "USD"),
        }
    except Exception:
        return None

    _store(cache_key, result)
    return result


def get_crypto_price_cad(symbol: str) -> float | None:
    """Returns the current CAD price for a crypto symbol (BTC, ETH, ...)."""
    coingecko_id = _COINGECKO_IDS.get(symbol.upper(), symbol.lower())
    cache_key = f"crypto:{coingecko_id}"
    cached = _cached(cache_key)
    if cached is not None:
        return cached["price"]

    try:
        resp = httpx.get(
            "https://api.coingecko.com/api/v3/simple/price",
            params={"ids": coingecko_id, "vs_currencies": "cad"},
            headers=_HEADERS,
            timeout=5.0,
        )
        resp.raise_for_status()
        price = float(resp.json()[coingecko_id]["cad"])
    except Exception:
        return None

    _store(cache_key, {"price": price})
    return price


def get_usd_cad_rate() -> float | None:
    cache_key = "fx:USDCAD"
    cached = _cached(cache_key)
    if cached is not None:
        return cached["rate"]

    quote = get_equity_quote("CAD=X")
    if quote is None:
        return None
    _store(cache_key, {"rate": quote["price"]})
    return quote["price"]
