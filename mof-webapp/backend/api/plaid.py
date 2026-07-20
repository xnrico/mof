"""Plaid account-linking API endpoints.

Flow (Plaid Link is an inline popup, not a redirect):
  1. POST /api/plaid/link-token   → create a Link token for the widget
  2. (frontend opens Plaid Link, user authenticates, gets a public_token)
  3. POST /api/plaid/exchange     → swap public_token for access_token + accounts
  4. POST /api/plaid/set-account  → map a Plaid account to a MoF account
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from models.database import get_db
from models.models import Account, IntegrationConfig, IntegrationProvider
from services.plaid_client import PlaidClient

router = APIRouter()


class LinkTokenRequest(BaseModel):
    account_id: int


class ExchangeRequest(BaseModel):
    public_token: str


class SetAccountRequest(BaseModel):
    mof_account_id: int
    plaid_account_id: str
    access_token: str
    item_id: str


@router.post("/link-token")
async def create_link_token(req: LinkTokenRequest, db: AsyncSession = Depends(get_db)):
    """Create a Plaid Link token for the frontend widget."""
    account = await db.get(Account, req.account_id)
    if not account:
        raise HTTPException(404, "Account not found")
    client = PlaidClient(db)
    token = await client.create_link_token(req.account_id)
    if not token:
        raise HTTPException(502, "Could not create Plaid link token — check Client ID/Secret in Settings")
    return {"link_token": token}


@router.post("/exchange")
async def exchange_public_token(req: ExchangeRequest, db: AsyncSession = Depends(get_db)):
    """Exchange the widget's public_token and return the linkable accounts."""
    client = PlaidClient(db)
    tokens = await client.exchange_public_token(req.public_token)
    if not tokens:
        raise HTTPException(502, "Public token exchange failed")
    accounts = await client.get_accounts(tokens["access_token"])
    return {
        "access_token": tokens["access_token"],
        "item_id": tokens["item_id"],
        "accounts": accounts,
    }


@router.post("/set-account")
async def set_account(req: SetAccountRequest, db: AsyncSession = Depends(get_db)):
    """Link a Plaid account to a MoF account, storing credentials."""
    account = await db.get(Account, req.mof_account_id)
    if not account:
        raise HTTPException(404, "MoF account not found")

    stmt = select(IntegrationConfig).where(IntegrationConfig.account_id == req.mof_account_id)
    config = (await db.execute(stmt)).scalar_one_or_none()
    if config:
        config.access_token = req.access_token
        config.item_id = req.item_id
        config.provider = IntegrationProvider.PLAID
        config.is_active = True
    else:
        db.add(IntegrationConfig(
            account_id=req.mof_account_id,
            provider=IntegrationProvider.PLAID,
            access_token=req.access_token,
            item_id=req.item_id,
            is_active=True,
        ))

    account.external_account_id = req.plaid_account_id
    await db.commit()
    return {"message": "Plaid account linked successfully"}
