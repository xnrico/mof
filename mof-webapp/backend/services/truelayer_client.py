"""TrueLayer Data API client — stateless helpers for OAuth and data endpoints.

Credentials come from provider_settings (stored in DB) or config.py (.env).
Per-account tokens (access + refresh) are stored in IntegrationConfig.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from services import provider_settings as ps

# ---- URL helpers ----

def _auth_base(sandbox: bool) -> str:
    return "https://auth.truelayer-sandbox.com" if sandbox else "https://auth.truelayer.com"

def _api_base(sandbox: bool) -> str:
    return (
        "https://api.truelayer-sandbox.com/data/v1"
        if sandbox
        else "https://api.truelayer.com/data/v1"
    )

# UK provider string for the auth URL
_UK_PROVIDERS = "uk-ob-all uk-oauth-all"
_SANDBOX_PROVIDER = "sandbox"

_SCOPES = "info accounts balance transactions offline_access"


class TrueLayerClient:
    """Thin async wrapper around the TrueLayer Data API."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._sandbox: Optional[bool] = None

    async def _is_sandbox(self) -> bool:
        if self._sandbox is None:
            env = await ps.get_effective(self.db, "TRUELAYER_ENV", "sandbox")
            self._sandbox = (env or "sandbox").lower() != "live"
        return self._sandbox

    async def _client_id(self) -> Optional[str]:
        return await ps.get_effective(self.db, "TRUELAYER_CLIENT_ID")

    async def _client_secret(self) -> Optional[str]:
        return await ps.get_effective(self.db, "TRUELAYER_CLIENT_SECRET")

    # ---- OAuth ----

    async def build_auth_url(self, redirect_uri: str, account_id: int) -> Optional[str]:
        """Return the URL to redirect the user to for bank authorisation."""
        client_id = await self._client_id()
        if not client_id:
            print("TrueLayer: TRUELAYER_CLIENT_ID not configured")
            return None
        sandbox = await self._is_sandbox()
        providers = _SANDBOX_PROVIDER if sandbox else _UK_PROVIDERS
        import urllib.parse
        params = urllib.parse.urlencode({
            "response_type": "code",
            "client_id": client_id,
            "scope": _SCOPES,
            "redirect_uri": redirect_uri,
            "providers": providers,
        })
        return f"{_auth_base(sandbox)}/?{params}"

    async def exchange_code(
        self, code: str, redirect_uri: str
    ) -> Optional[dict]:
        """Exchange an auth code for access + refresh tokens."""
        client_id = await self._client_id()
        client_secret = await self._client_secret()
        if not client_id or not client_secret:
            return None
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{_auth_base(sandbox)}/connect/token",
                    data={
                        "grant_type": "authorization_code",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "redirect_uri": redirect_uri,
                        "code": code,
                    },
                )
                if r.status_code != 200:
                    print(f"TrueLayer token exchange failed: {r.status_code} {r.text[:300]}")
                    return None
                return r.json()
        except Exception as e:
            print(f"TrueLayer token exchange exception: {e}")
            return None

    async def refresh_access_token(
        self, refresh_token: str
    ) -> Optional[dict]:
        """Refresh an expired access token."""
        client_id = await self._client_id()
        client_secret = await self._client_secret()
        if not client_id or not client_secret:
            return None
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(
                    f"{_auth_base(sandbox)}/connect/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "refresh_token": refresh_token,
                    },
                )
                if r.status_code != 200:
                    print(f"TrueLayer token refresh failed: {r.status_code} {r.text[:300]}")
                    return None
                return r.json()
        except Exception as e:
            print(f"TrueLayer token refresh exception: {e}")
            return None

    # ---- Data API ----

    def _auth_header(self, access_token: str) -> dict:
        return {"Authorization": f"Bearer {access_token}"}

    async def get_accounts(self, access_token: str) -> list:
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{_api_base(sandbox)}/accounts",
                    headers=self._auth_header(access_token),
                )
                if r.status_code != 200:
                    print(f"TrueLayer get_accounts failed: {r.status_code} {r.text[:200]}")
                    return []
                return r.json().get("results", [])
        except Exception as e:
            print(f"TrueLayer get_accounts exception: {e}")
            return []

    async def get_balance(self, access_token: str, account_id: str) -> Optional[dict]:
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{_api_base(sandbox)}/accounts/{account_id}/balance",
                    headers=self._auth_header(access_token),
                )
                results = r.json().get("results", []) if r.status_code == 200 else []
                return results[0] if results else None
        except Exception as e:
            print(f"TrueLayer get_balance exception: {e}")
            return None

    async def get_transactions(
        self, access_token: str, account_id: str, date_from: str, date_to: str
    ) -> list:
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(
                    f"{_api_base(sandbox)}/accounts/{account_id}/transactions",
                    headers=self._auth_header(access_token),
                    params={"from": date_from, "to": date_to},
                )
                if r.status_code != 200:
                    print(f"TrueLayer get_transactions failed: {r.status_code} {r.text[:200]}")
                    return []
                return r.json().get("results", [])
        except Exception as e:
            print(f"TrueLayer get_transactions exception: {e}")
            return []
