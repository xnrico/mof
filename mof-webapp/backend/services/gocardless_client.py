"""GoCardless (Nordigen Bank Account Data) API client with automatic token refresh.

Credentials needed from the GoCardless developer portal:
  - Secret ID  (like a client_id)
  - Secret Key (like a client_secret)

Access tokens are short-lived (~24h). This service obtains and refreshes them
automatically, persisting them in the app_settings table.
"""
from datetime import datetime, timezone
from typing import Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from services import provider_settings

BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"

# AppSetting keys used to cache tokens
_KEY_ACCESS = "GC_ACCESS_TOKEN"
_KEY_ACCESS_EXP = "GC_ACCESS_EXPIRY"
_KEY_REFRESH = "GC_REFRESH_TOKEN"
_KEY_REFRESH_EXP = "GC_REFRESH_EXPIRY"

# Module-level in-process cache (avoids DB round-trip on every request)
_cache: dict = {}


def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


class GoCardlessClient:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _secret_id(self) -> Optional[str]:
        return await provider_settings.get_effective(self.db, "GOCARDLESS_SECRET_ID")

    async def _secret_key(self) -> Optional[str]:
        return await provider_settings.get_effective(self.db, "GOCARDLESS_SECRET_KEY")

    async def _load_tokens(self) -> dict:
        keys = [_KEY_ACCESS, _KEY_ACCESS_EXP, _KEY_REFRESH, _KEY_REFRESH_EXP]
        result = {}
        for k in keys:
            result[k] = await provider_settings.get_effective(self.db, k)
        return result

    async def _save_tokens(self, access: str, access_exp: float,
                           refresh: str, refresh_exp: float) -> None:
        await provider_settings.upsert(self.db, _KEY_ACCESS, access)
        await provider_settings.upsert(self.db, _KEY_ACCESS_EXP, str(access_exp))
        await provider_settings.upsert(self.db, _KEY_REFRESH, refresh)
        await provider_settings.upsert(self.db, _KEY_REFRESH_EXP, str(refresh_exp))
        await self.db.commit()
        _cache.update({
            _KEY_ACCESS: access,
            _KEY_ACCESS_EXP: access_exp,
            _KEY_REFRESH: refresh,
            _KEY_REFRESH_EXP: refresh_exp,
        })

    async def get_access_token(self) -> Optional[str]:
        """Return a valid access token, refreshing or obtaining a new one as needed."""
        buf = 60  # seconds buffer before expiry

        # Check in-process cache first
        cached_access = _cache.get(_KEY_ACCESS)
        cached_exp = _cache.get(_KEY_ACCESS_EXP)
        if cached_access and cached_exp and _now_ts() < float(cached_exp) - buf:
            return cached_access

        # Load from DB
        tokens = await self._load_tokens()
        access = tokens.get(_KEY_ACCESS)
        access_exp = float(tokens.get(_KEY_ACCESS_EXP) or 0)
        refresh = tokens.get(_KEY_REFRESH)
        refresh_exp = float(tokens.get(_KEY_REFRESH_EXP) or 0)

        # Access token still valid
        if access and _now_ts() < access_exp - buf:
            _cache[_KEY_ACCESS] = access
            _cache[_KEY_ACCESS_EXP] = access_exp
            return access

        # Try refreshing
        if refresh and _now_ts() < refresh_exp - buf:
            new_access = await self._refresh_access(refresh)
            if new_access:
                return new_access

        # Full re-auth
        return await self._new_token()

    async def _new_token(self) -> Optional[str]:
        secret_id = await self._secret_id()
        secret_key = await self._secret_key()
        if not secret_id or not secret_key:
            print("GoCardless: GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY not configured")
            return None
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{BASE_URL}/token/new/",
                    json={"secret_id": secret_id, "secret_key": secret_key},
                )
                if r.status_code != 200:
                    print(f"GoCardless token/new failed: {r.status_code} {r.text[:200]}")
                    return None
                data = r.json()
                now = _now_ts()
                await self._save_tokens(
                    data["access"],
                    now + int(data.get("access_expires", 86400)),
                    data["refresh"],
                    now + int(data.get("refresh_expires", 2592000)),
                )
                return data["access"]
        except Exception as e:
            print(f"GoCardless token/new exception: {e}")
            return None

    async def _refresh_access(self, refresh_token: str) -> Optional[str]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{BASE_URL}/token/refresh/",
                    json={"refresh": refresh_token},
                )
                if r.status_code != 200:
                    print(f"GoCardless token/refresh failed: {r.status_code} {r.text[:200]}")
                    return None
                data = r.json()
                now = _now_ts()
                # Refresh doesn't return a new refresh token, keep existing
                tokens = await self._load_tokens()
                await self._save_tokens(
                    data["access"],
                    now + int(data.get("access_expires", 86400)),
                    tokens.get(_KEY_REFRESH, ""),
                    float(tokens.get(_KEY_REFRESH_EXP) or 0),
                )
                return data["access"]
        except Exception as e:
            print(f"GoCardless token/refresh exception: {e}")
            return None

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    async def list_institutions(self, country: str = "GB") -> list:
        token = await self.get_access_token()
        if not token:
            return []
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BASE_URL}/institutions/",
                headers=self._auth(token),
                params={"country": country.upper()},
            )
            return r.json() if r.status_code == 200 else []

    async def create_requisition(
        self, institution_id: str, redirect_url: str, reference: str
    ) -> Optional[dict]:
        token = await self.get_access_token()
        if not token:
            return None
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                f"{BASE_URL}/requisitions/",
                headers=self._auth(token),
                json={
                    "redirect": redirect_url,
                    "institution_id": institution_id,
                    "reference": reference,
                    "user_language": "EN",
                },
            )
            if r.status_code not in (200, 201):
                print(f"GoCardless create_requisition failed: {r.status_code} {r.text[:300]}")
                return None
            return r.json()

    async def get_requisition(self, requisition_id: str) -> Optional[dict]:
        token = await self.get_access_token()
        if not token:
            return None
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BASE_URL}/requisitions/{requisition_id}/",
                headers=self._auth(token),
            )
            return r.json() if r.status_code == 200 else None

    async def get_account_details(self, account_id: str) -> Optional[dict]:
        token = await self.get_access_token()
        if not token:
            return None
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BASE_URL}/accounts/{account_id}/details/",
                headers=self._auth(token),
            )
            return r.json().get("account") if r.status_code == 200 else None

    async def get_account_balances(self, account_id: str) -> list:
        token = await self.get_access_token()
        if not token:
            return []
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BASE_URL}/accounts/{account_id}/balances/",
                headers=self._auth(token),
            )
            return r.json().get("balances", []) if r.status_code == 200 else []

    async def get_transactions(
        self, account_id: str, date_from: str, date_to: str
    ) -> dict:
        """Returns {"booked": [...], "pending": [...]}"""
        token = await self.get_access_token()
        if not token:
            return {}
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                f"{BASE_URL}/accounts/{account_id}/transactions/",
                headers=self._auth(token),
                params={"date_from": date_from, "date_to": date_to},
            )
            return r.json().get("transactions", {}) if r.status_code == 200 else {}
