"""Foreign-exchange rates for dashboard currency switching.

Fetches GBP<->USD from the Frankfurter API (free, no key, ECB reference
rates) and caches the result in app_settings so the frontend can read it
without hitting the upstream on every request. Refreshed on startup and by
the 5-minute sync scheduler.

Note: ECB reference rates update roughly once per business day, so the
5-minute refresh mostly keeps a warm cache rather than tracking intraday
moves — swap the source here if intraday precision is ever needed.
"""
from typing import Optional, Dict
from datetime import datetime, timezone
import httpx

from sqlalchemy.ext.asyncio import AsyncSession
from services import provider_settings as ps

_RATE_KEY = "FX_GBP_USD"        # 1 GBP = N USD
_UPDATED_KEY = "FX_UPDATED_AT"  # ISO timestamp of last successful fetch
_FALLBACK_GBP_USD = 1.27        # used only if no rate has ever been fetched
_SOURCE_URL = "https://api.frankfurter.dev/v1/latest?from=GBP&to=USD"


async def refresh_rate(db: AsyncSession) -> Optional[float]:
    """Fetch the latest GBP->USD rate and cache it. Returns the rate or None."""
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(_SOURCE_URL)
            if resp.status_code != 200:
                print(f"FX refresh failed: HTTP {resp.status_code}")
                return None
            rate = float(resp.json().get("rates", {}).get("USD", 0))
            if rate <= 0:
                return None
    except Exception as e:
        print(f"FX refresh exception: {e}")
        return None

    await ps.upsert(db, _RATE_KEY, str(rate))
    await ps.upsert(db, _UPDATED_KEY, datetime.now(timezone.utc).isoformat())
    await db.commit()
    return rate


async def get_rates(db: AsyncSession) -> Dict[str, object]:
    """Return the cached GBP->USD rate (and its inverse) for the frontend."""
    raw = await ps.get_effective(db, _RATE_KEY)
    updated = await ps.get_effective(db, _UPDATED_KEY)
    try:
        gbp_usd = float(raw) if raw else _FALLBACK_GBP_USD
    except (TypeError, ValueError):
        gbp_usd = _FALLBACK_GBP_USD
    return {
        "GBP_USD": gbp_usd,
        "USD_GBP": round(1.0 / gbp_usd, 6) if gbp_usd else 0,
        "updated_at": updated,
        "stale": raw is None,  # true when we've never fetched a live rate
    }
