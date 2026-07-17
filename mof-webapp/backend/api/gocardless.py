"""GoCardless bank-linking API endpoints.

Flow:
  1. GET  /api/gocardless/institutions?country=GB  → list banks
  2. POST /api/gocardless/link                     → create requisition, return auth URL
  3. GET  /api/gocardless/finalize?req_id=<id>&account_id=<mof_id>
                                                   → check status, link accounts
  4. POST /api/gocardless/set-account              → map GC account_id to a MoF account
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from models.database import get_db
from models.models import Account, IntegrationConfig, IntegrationProvider
from services.gocardless_client import GoCardlessClient

router = APIRouter()


class LinkRequest(BaseModel):
    account_id: int          # MoF account ID to link
    institution_id: str      # GoCardless institution ID
    redirect_base_url: str   # frontend base URL (e.g. http://192.168.1.1:3000)


class SetAccountRequest(BaseModel):
    mof_account_id: int      # which MoF account to update
    gc_account_id: str       # GoCardless account UUID
    requisition_id: str


@router.get("/institutions")
async def list_institutions(
    country: str = Query("GB", description="ISO 3166-1 alpha-2 country code"),
    db: AsyncSession = Depends(get_db),
):
    """List available banks for a given country."""
    client = GoCardlessClient(db)
    institutions = await client.list_institutions(country)
    if not institutions:
        raise HTTPException(502, "Could not fetch institutions — check GoCardless credentials")
    # Return only the fields the frontend needs
    return [
        {
            "id": i.get("id"),
            "name": i.get("name"),
            "bic": i.get("bic"),
            "logo": i.get("logo"),
            "countries": i.get("countries", []),
        }
        for i in institutions
    ]


@router.post("/link")
async def create_link(req: LinkRequest, db: AsyncSession = Depends(get_db)):
    """Create a GoCardless requisition for an account and return the bank auth URL."""
    account = await db.get(Account, req.account_id)
    if not account:
        raise HTTPException(404, "Account not found")

    client = GoCardlessClient(db)
    redirect_url = f"{req.redirect_base_url.rstrip('/')}/gocardless/callback?account_id={req.account_id}"
    result = await client.create_requisition(
        institution_id=req.institution_id,
        redirect_url=redirect_url,
        reference=f"mof-account-{req.account_id}",
    )
    if not result:
        raise HTTPException(502, "Failed to create GoCardless requisition")

    requisition_id = result["id"]
    auth_url = result["link"]

    # Persist the requisition ID in the integration config so we can look it up on callback
    stmt = select(IntegrationConfig).where(IntegrationConfig.account_id == req.account_id)
    config = (await db.execute(stmt)).scalar_one_or_none()
    if config:
        config.item_id = requisition_id
    else:
        db.add(IntegrationConfig(
            account_id=req.account_id,
            provider=IntegrationProvider.GOCARDLESS,
            item_id=requisition_id,
            is_active=False,   # becomes True once finalized
        ))
    await db.commit()

    return {"requisition_id": requisition_id, "auth_url": auth_url}


@router.get("/requisition")
async def get_requisition(
    account_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Return the current requisition status for a MoF account."""
    stmt = select(IntegrationConfig).where(IntegrationConfig.account_id == account_id)
    config = (await db.execute(stmt)).scalar_one_or_none()
    if not config or not config.item_id:
        raise HTTPException(404, "No requisition found for this account")

    client = GoCardlessClient(db)
    req = await client.get_requisition(config.item_id)
    if not req:
        raise HTTPException(502, "Could not fetch requisition from GoCardless")

    # Enrich account list with details
    accounts = []
    for gc_id in req.get("accounts", []):
        details = await client.get_account_details(gc_id) or {}
        balances = await client.get_account_balances(gc_id)
        balance = None
        currency = "GBP"
        if balances:
            b = balances[0].get("balanceAmount", {})
            balance = float(b.get("amount", 0))
            currency = b.get("currency", "GBP")
        accounts.append({
            "id": gc_id,
            "name": details.get("name") or details.get("product") or f"Account …{gc_id[-6:]}",
            "iban": details.get("iban"),
            "currency": details.get("currency") or currency,
            "balance": balance,
        })

    return {
        "requisition_id": config.item_id,
        "status": req.get("status"),
        "institution_id": req.get("institution_id"),
        "accounts": accounts,
    }


@router.post("/set-account")
async def set_account(req: SetAccountRequest, db: AsyncSession = Depends(get_db)):
    """Map a GoCardless account ID to a MoF account and activate the integration."""
    account = await db.get(Account, req.mof_account_id)
    if not account:
        raise HTTPException(404, "MoF account not found")

    stmt = select(IntegrationConfig).where(
        IntegrationConfig.account_id == req.mof_account_id
    )
    config = (await db.execute(stmt)).scalar_one_or_none()
    if config:
        config.item_id = req.requisition_id
        config.access_token = req.gc_account_id   # store GC account UUID as access_token
        config.is_active = True
    else:
        db.add(IntegrationConfig(
            account_id=req.mof_account_id,
            provider=IntegrationProvider.GOCARDLESS,
            item_id=req.requisition_id,
            access_token=req.gc_account_id,
            is_active=True,
        ))

    # Update the account's external_account_id so sync can find it
    account.external_account_id = req.gc_account_id
    await db.commit()

    return {"message": "Account linked successfully"}
