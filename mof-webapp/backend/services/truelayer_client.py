"""TrueLayer Data API v3 client.

Authentication model (from TrueLayer docs):
  1. App-level token: POST /connect/token with grant_type=client_credentials,
     scope=data. Valid ~60 min. Cached in app_settings and reused.
  2. User connection: user authorises their bank via TrueLayer's hosted auth
     page. Returns a connection_id stored in IntegrationConfig.item_id.
  3. All Data v3 API calls use: Bearer <app_token> + TL-Connection-Id: <id>
"""
from datetime import datetime, timezone, timedelta
from typing import Optional
import urllib.parse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from services import provider_settings as ps

_AUTH_BASE_LIVE = "https://auth.truelayer.com"
_AUTH_BASE_SANDBOX = "https://auth.truelayer-sandbox.com"
_API_BASE_LIVE = "https://api.truelayer.com"
_API_BASE_SANDBOX = "https://api.truelayer-sandbox.com"

# AppSetting keys for cached app token
_KEY_TOKEN = "TL_APP_ACCESS_TOKEN"
_KEY_TOKEN_EXP = "TL_APP_ACCESS_TOKEN_EXPIRY"

# Scopes for Data API
_DATA_SCOPES = "info accounts balance transactions cards offline_access"

# In-process cache
_cache: dict = {}


def _now_ts() -> float:
    return datetime.now(timezone.utc).timestamp()


class TrueLayerClient:
    def __init__(self, db: AsyncSession):
        self.db = db
        self._sandbox_cache: Optional[bool] = None

    async def _is_sandbox(self) -> bool:
        if self._sandbox_cache is None:
            env = await ps.get_effective(self.db, "TRUELAYER_ENV", "sandbox")
            self._sandbox_cache = (env or "sandbox").lower() != "live"
        return self._sandbox_cache

    async def _client_id(self) -> Optional[str]:
        return await ps.get_effective(self.db, "TRUELAYER_CLIENT_ID")

    async def _client_secret(self) -> Optional[str]:
        return await ps.get_effective(self.db, "TRUELAYER_CLIENT_SECRET")

    def _auth_base(self, sandbox: bool) -> str:
        return _AUTH_BASE_SANDBOX if sandbox else _AUTH_BASE_LIVE

    def _api_base(self, sandbox: bool) -> str:
        return _API_BASE_SANDBOX if sandbox else _API_BASE_LIVE

    # ---- App-level token (client_credentials + scope=data) ----

    async def get_app_token(self) -> Optional[str]:
        """Return a valid app-level access token, refreshing as needed."""
        buf = 60  # seconds buffer

        # Check in-process cache
        cached = _cache.get(_KEY_TOKEN)
        cached_exp = _cache.get(_KEY_TOKEN_EXP)
        if cached and cached_exp and _now_ts() < float(cached_exp) - buf:
            return cached

        # Load from DB
        token = await ps.get_effective(self.db, _KEY_TOKEN)
        exp = float(await ps.get_effective(self.db, _KEY_TOKEN_EXP) or 0)

        if token and _now_ts() < exp - buf:
            _cache[_KEY_TOKEN] = token
            _cache[_KEY_TOKEN_EXP] = exp
            return token

        return await self._fetch_app_token()

    async def _fetch_app_token(self) -> Optional[str]:
        client_id = await self._client_id()
        client_secret = await self._client_secret()
        if not client_id or not client_secret:
            print("TrueLayer: TRUELAYER_CLIENT_ID / TRUELAYER_CLIENT_SECRET not configured")
            return None
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.post(
                    f"{self._auth_base(sandbox)}/connect/token",
                    data={
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "scope": "data",
                    },
                )
                if r.status_code != 200:
                    print(f"TrueLayer app token failed: {r.status_code} {r.text[:300]}")
                    return None
                data = r.json()
                token = data["access_token"]
                expires_in = int(data.get("expires_in", 3600))
                expiry = _now_ts() + expires_in

                # Persist and cache
                await ps.upsert(self.db, _KEY_TOKEN, token)
                await ps.upsert(self.db, _KEY_TOKEN_EXP, str(expiry))
                await self.db.commit()
                _cache[_KEY_TOKEN] = token
                _cache[_KEY_TOKEN_EXP] = expiry
                return token
        except Exception as e:
            print(f"TrueLayer app token exception: {e}")
            return None

    # ---- User connection OAuth (authorization_code) ----

    async def build_connection_auth_url(
        self, redirect_uri: str, account_id: int
    ) -> Optional[str]:
        """Build the URL to redirect the user to for bank authorisation.

        account_id is passed via the OAuth 'state' parameter so the redirect_uri
        stays clean and matches the registered URI in TrueLayer Console.
        """
        client_id = await self._client_id()
        if not client_id:
            return None
        sandbox = await self._is_sandbox()
        providers = "mock" if sandbox else "uk-ob-all uk-oauth-all"
        params = urllib.parse.urlencode({
            "response_type": "code",
            "client_id": client_id,
            "scope": _DATA_SCOPES,
            "redirect_uri": redirect_uri,
            "providers": providers,
            "state": str(account_id),   # passed back unchanged in the callback
        })
        return f"{self._auth_base(sandbox)}/?{params}"

    async def exchange_code(self, code: str, redirect_uri: str) -> Optional[dict]:
        """Exchange an auth code for a user-scoped access + refresh token."""
        client_id = await self._client_id()
        client_secret = await self._client_secret()
        if not client_id or not client_secret:
            print(f"TrueLayer exchange: missing credentials (id={bool(client_id)} secret={bool(client_secret)})")
            return None
        sandbox = await self._is_sandbox()
        endpoint = f"{self._auth_base(sandbox)}/connect/token"
        payload = {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "code": code,
        }
        print(f"TrueLayer exchange → {endpoint}")
        print(f"  client_id={client_id!r}")
        print(f"  client_secret={client_secret[:12]}... (len={len(client_secret)})")
        print(f"  redirect_uri={redirect_uri!r}")
        print(f"  code={code[:16]}...")
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.post(endpoint, data=payload)
                print(f"  response: {r.status_code} {r.text[:300]}")
                if r.status_code != 200:
                    return None
                return r.json()
        except Exception as e:
            print(f"TrueLayer code exchange exception: {e}")
            return None

    async def refresh_user_token(self, refresh_token: str) -> Optional[dict]:
        client_id = await self._client_id()
        client_secret = await self._client_secret()
        if not client_id or not client_secret:
            return None
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.post(
                    f"{self._auth_base(sandbox)}/connect/token",
                    data={
                        "grant_type": "refresh_token",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "refresh_token": refresh_token,
                    },
                )
                return r.json() if r.status_code == 200 else None
        except Exception as e:
            print(f"TrueLayer token refresh exception: {e}")
            return None

    # ---- Data API calls ----

    def _headers(self, access_token: str, user_access_token: Optional[str] = None) -> dict:
        """Build auth headers. For Data v1 endpoints, user_access_token is used.
        For Data v3 (connection-based), app token + TL-Connection-Id is used."""
        token = user_access_token if user_access_token else access_token
        return {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }

    async def get_accounts(
        self, user_access_token: str
    ) -> list:
        """Fetch accounts using a user access token (Data v1/v2 flow)."""
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.get(
                    f"{self._api_base(sandbox)}/data/v1/accounts",
                    headers=self._headers(user_access_token),
                )
                if r.status_code != 200:
                    print(f"TrueLayer get_accounts failed: {r.status_code} {r.text[:200]}")
                    return []
                return r.json().get("results", [])
        except Exception as e:
            print(f"TrueLayer get_accounts exception: {e}")
            return []

    async def get_balance(
        self, user_access_token: str, account_id: str
    ) -> Optional[dict]:
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.get(
                    f"{self._api_base(sandbox)}/data/v1/accounts/{account_id}/balance",
                    headers=self._headers(user_access_token),
                )
                results = r.json().get("results", []) if r.status_code == 200 else []
                return results[0] if results else None
        except Exception as e:
            print(f"TrueLayer get_balance exception: {e}")
            return None

    async def get_transactions(
        self,
        user_access_token: str,
        account_id: str,
        date_from: str,
        date_to: str,
    ) -> list:
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                r = await http.get(
                    f"{self._api_base(sandbox)}/data/v1/accounts/{account_id}/transactions",
                    headers=self._headers(user_access_token),
                    params={"from": date_from, "to": date_to},
                )
                if r.status_code != 200:
                    print(f"TrueLayer get_transactions failed: {r.status_code} {r.text[:200]}")
                    raise RuntimeError(f"transactions HTTP {r.status_code}: {r.text[:150]}")
                return r.json().get("results", [])
        except RuntimeError:
            raise
        except Exception as e:
            print(f"TrueLayer get_transactions exception: {e}")
            raise RuntimeError(f"transactions error: {e}")

    # ---- Card endpoints (credit cards are a separate TrueLayer resource) ----

    async def get_cards(self, user_access_token: str) -> list:
        """Fetch credit cards accessible with this user access token."""
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.get(
                    f"{self._api_base(sandbox)}/data/v1/cards",
                    headers=self._headers(user_access_token),
                )
                if r.status_code != 200:
                    print(f"TrueLayer get_cards failed: {r.status_code} {r.text[:200]}")
                    return []
                return r.json().get("results", [])
        except Exception as e:
            print(f"TrueLayer get_cards exception: {e}")
            return []

    async def get_card_balance(
        self, user_access_token: str, account_id: str
    ) -> Optional[dict]:
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=15) as http:
                r = await http.get(
                    f"{self._api_base(sandbox)}/data/v1/cards/{account_id}/balance",
                    headers=self._headers(user_access_token),
                )
                results = r.json().get("results", []) if r.status_code == 200 else []
                return results[0] if results else None
        except Exception as e:
            print(f"TrueLayer get_card_balance exception: {e}")
            return None

    async def get_card_transactions(
        self,
        user_access_token: str,
        account_id: str,
        date_from: str,
        date_to: str,
    ) -> list:
        sandbox = await self._is_sandbox()
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                r = await http.get(
                    f"{self._api_base(sandbox)}/data/v1/cards/{account_id}/transactions",
                    headers=self._headers(user_access_token),
                    params={"from": date_from, "to": date_to},
                )
                if r.status_code != 200:
                    print(f"TrueLayer get_card_transactions failed: {r.status_code} {r.text[:200]}")
                    raise RuntimeError(f"card transactions HTTP {r.status_code}: {r.text[:150]}")
                return r.json().get("results", [])
        except RuntimeError:
            raise
        except Exception as e:
            print(f"TrueLayer get_card_transactions exception: {e}")
            raise RuntimeError(f"card transactions error: {e}")
