"""Plaid linking helper.

Reads PLAID_* credentials from app_settings (falling back to env), builds a
Plaid API client, and wraps the three calls the link flow needs:
  - create_link_token   → token the frontend Plaid Link widget opens with
  - exchange_public_token→ swap the widget's public_token for an access_token
  - get_accounts        → list the linkable accounts for that access_token

The plaid-python SDK is synchronous, so calls run in a thread to avoid
blocking the event loop.
"""
from typing import Optional, List, Dict, Any
import asyncio

import plaid
from plaid.api import plaid_api
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.accounts_get_request import AccountsGetRequest

from sqlalchemy.ext.asyncio import AsyncSession
from services import provider_settings

_ENV_HOSTS = {
    "sandbox": plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}


class PlaidClient:
    """DB-aware Plaid client for the account-linking flow."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._client: Optional[plaid_api.PlaidApi] = None

    async def _get_client(self) -> Optional[plaid_api.PlaidApi]:
        if self._client is not None:
            return self._client
        client_id = await provider_settings.get_effective(self.db, "PLAID_CLIENT_ID")
        secret = await provider_settings.get_effective(self.db, "PLAID_SECRET")
        env = (await provider_settings.get_effective(self.db, "PLAID_ENV")) or "sandbox"
        if not client_id or not secret:
            return None
        config = plaid.Configuration(
            host=_ENV_HOSTS.get(env, plaid.Environment.Sandbox),
            api_key={"clientId": client_id, "secret": secret},
        )
        self._client = plaid_api.PlaidApi(plaid.ApiClient(config))
        return self._client

    async def create_link_token(self, mof_account_id: int) -> Optional[str]:
        """Create a Link token the frontend widget opens with."""
        client = await self._get_client()
        if not client:
            return None
        req = LinkTokenCreateRequest(
            products=[Products("transactions")],
            client_name="Ministry of Finance",
            country_codes=[CountryCode("US")],
            language="en",
            user=LinkTokenCreateRequestUser(client_user_id=f"mof-{mof_account_id}"),
        )
        resp = await asyncio.to_thread(client.link_token_create, req)
        return resp["link_token"]

    async def exchange_public_token(self, public_token: str) -> Optional[Dict[str, str]]:
        """Swap the widget's public_token for a durable access_token + item_id."""
        client = await self._get_client()
        if not client:
            return None
        req = ItemPublicTokenExchangeRequest(public_token=public_token)
        resp = await asyncio.to_thread(client.item_public_token_exchange, req)
        return {"access_token": resp["access_token"], "item_id": resp["item_id"]}

    async def get_accounts(self, access_token: str) -> List[Dict[str, Any]]:
        """List linkable accounts for an access_token, with balances."""
        client = await self._get_client()
        if not client:
            return []
        resp = await asyncio.to_thread(
            client.accounts_get, AccountsGetRequest(access_token=access_token)
        )
        accounts = []
        for a in resp["accounts"]:
            bal = a.get("balances", {})
            accounts.append({
                "account_id": a["account_id"],
                "display_name": a.get("official_name") or a.get("name") or a["account_id"],
                "account_type": str(a.get("subtype") or a.get("type") or ""),
                "mask": a.get("mask"),
                "currency": bal.get("iso_currency_code") or "USD",
                "balance": bal.get("current"),
                "available": bal.get("available"),
            })
        return accounts
