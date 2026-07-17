"""TrueLayer bank-linking API endpoints.

Flow:
  1. GET  /api/truelayer/link?account_id=<id>   → returns auth URL to redirect to
  2. (browser redirected to bank, user authorises, TrueLayer calls back to frontend)
  3. POST /api/truelayer/exchange               → exchange code for tokens, list accounts
  4. POST /api/truelayer/set-account            → map TL account to MoF account
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from models.database import get_db
from models.models import Account, IntegrationConfig, IntegrationProvider
from services.truelayer_client import TrueLayerClient

router = APIRouter()


class ExchangeRequest(BaseModel):
    account_id: int       # MoF account ID
    code: str             # auth code from TrueLayer callback
    redirect_uri: str     # must match the one used to build auth URL


class SetAccountRequest(BaseModel):
    mof_account_id: int
    tl_account_id: str    # TrueLayer account_id
    access_token: str
    refresh_token: str
    token_expires_in: Optional[int] = 3600


@router.get("/link")
async def get_link_url(account_id: int, redirect_base_url: str, db: AsyncSession = Depends(get_db)):
    """Return the TrueLayer auth URL to redirect the user to."""
    account = await db.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Account not found")

    redirect_uri = f"{redirect_base_url.rstrip('/')}/truelayer/callback?account_id={account_id}"
    client = TrueLayerClient(db)
    url = await client.build_auth_url(redirect_uri=redirect_uri, account_id=account_id)
    if not url:
        raise HTTPException(502, "Could not build TrueLayer auth URL — check Client ID in Settings")
    return {"auth_url": url, "redirect_uri": redirect_uri}


@router.post("/exchange")
async def exchange_code(req: ExchangeRequest, db: AsyncSession = Depends(get_db)):
    """Exchange an auth code for tokens and return the accessible TrueLayer accounts."""
    client = TrueLayerClient(db)
    tokens = await client.exchange_code(code=req.code, redirect_uri=req.redirect_uri)
    if not tokens:
        raise HTTPException(502, "Token exchange failed — code may have expired")

    access_token = tokens["access_token"]
    refresh_token = tokens.get("refresh_token", "")
    expires_in = tokens.get("expires_in", 3600)

    # Fetch accessible accounts with this token
    accounts = await client.get_accounts(access_token)

    # Enrich with balances
    enriched = []
    for a in accounts:
        bal = await client.get_balance(access_token, a["account_id"])
        enriched.append({
            "account_id": a["account_id"],
            "display_name": a.get("display_name", a.get("account_id")),
            "account_type": a.get("account_type", ""),
            "currency": a.get("currency", "GBP"),
            "account_number": a.get("account_number", {}),
            "balance": bal.get("current") if bal else None,
            "available": bal.get("available") if bal else None,
        })

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": expires_in,
        "accounts": enriched,
    }


@router.post("/set-account")
async def set_account(req: SetAccountRequest, db: AsyncSession = Depends(get_db)):
    """Link a TrueLayer account to a MoF account, storing credentials."""
    account = await db.get(Account, req.mof_account_id)
    if not account:
        raise HTTPException(404, "MoF account not found")

    import json
    from datetime import datetime, timezone, timedelta
    expiry = (datetime.now(timezone.utc) + timedelta(seconds=req.token_expires_in or 3600)).isoformat()

    stmt = select(IntegrationConfig).where(IntegrationConfig.account_id == req.mof_account_id)
    config = (await db.execute(stmt)).scalar_one_or_none()
    if config:
        config.access_token = req.access_token
        config.refresh_token = req.refresh_token
        config.item_id = req.tl_account_id
        config.config_data = json.dumps({"token_expiry": expiry})
        config.is_active = True
    else:
        db.add(IntegrationConfig(
            account_id=req.mof_account_id,
            provider=IntegrationProvider.TRUELAYER,
            access_token=req.access_token,
            refresh_token=req.refresh_token,
            item_id=req.tl_account_id,
            config_data=json.dumps({"token_expiry": expiry}),
            is_active=True,
        ))

    account.external_account_id = req.tl_account_id
    await db.commit()
    return {"message": "TrueLayer account linked successfully"}
