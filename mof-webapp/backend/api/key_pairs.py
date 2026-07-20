"""Provider key pair CRUD endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json

from models.database import get_db
from models.models import ProviderKeyPair, IntegrationProvider

router = APIRouter()

# Provider-specific credential field definitions (for UI)
PROVIDER_FIELDS = {
    "TrueLayer":   [("client_id","Client ID",False), ("client_secret","Client Secret",True), ("env","Environment",False)],
    "Trading212":  [("api_key","API Key",False), ("api_secret","API Secret",True), ("env","Environment",False)],
    "Plaid":       [("client_id","Client ID",False), ("secret","Secret",True), ("env","Environment",False)],
    "GoCardless":  [("secret_id","Secret ID",False), ("secret_key","Secret Key",True), ("env","Environment",False)],
    "IBKR":        [("account_id","Account ID",False), ("host","Host",False), ("port","Port",False)],
    "Sophtron":    [("user_id","API User ID",False), ("access_key","API Access Key",True), ("base_url","Base URL",False)],
    "Manual":      [],
}


class KeyPairCreate(BaseModel):
    provider: str
    name: str
    credentials: dict  # {field_key: value}


class KeyPairUpdate(BaseModel):
    name: Optional[str] = None
    credentials: Optional[dict] = None
    is_active: Optional[bool] = None


class KeyPairResponse(BaseModel):
    id: int
    provider: str
    name: str
    credentials_masked: dict  # secrets replaced with is_set booleans
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


def _mask_credentials(provider_name: str, raw: dict) -> dict:
    """Return credentials with secret fields masked (bool is_set instead of value)."""
    fields = PROVIDER_FIELDS.get(provider_name, [])
    result = {}
    for key, _label, is_secret in fields:
        val = raw.get(key)
        result[key] = {"value": None if is_secret else val, "is_set": bool(val), "is_secret": is_secret}
    return result


@router.get("/")
async def list_key_pairs(provider: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """List all key pairs, optionally filtered by provider."""
    query = select(ProviderKeyPair)
    if provider:
        query = query.where(ProviderKeyPair.provider == IntegrationProvider(provider))
    result = await db.execute(query)
    pairs = result.scalars().all()
    return [
        {
            "id": p.id,
            "provider": p.provider.value,
            "name": p.name,
            "credentials_masked": _mask_credentials(p.provider.value, json.loads(p.credentials or "{}")),
            "is_active": p.is_active,
            "created_at": p.created_at.isoformat(),
        }
        for p in pairs
    ]


@router.post("/")
async def create_key_pair(body: KeyPairCreate, db: AsyncSession = Depends(get_db)):
    """Create a new named key pair."""
    try:
        provider = IntegrationProvider(body.provider)
    except ValueError:
        raise HTTPException(400, f"Unknown provider: {body.provider}")

    pair = ProviderKeyPair(
        provider=provider,
        name=body.name.strip(),
        credentials=json.dumps({k: v.strip() if isinstance(v, str) else v
                                 for k, v in body.credentials.items()}),
    )
    db.add(pair)
    await db.commit()
    await db.refresh(pair)
    return {"id": pair.id, "message": "Key pair created"}


@router.get("/providers")
async def list_providers():
    """Return provider names and their credential field schemas."""
    return {
        provider: [{"key": k, "label": l, "secret": s} for k, l, s in fields]
        for provider, fields in PROVIDER_FIELDS.items()
    }


@router.put("/{pair_id}")
async def update_key_pair(pair_id: int, body: KeyPairUpdate, db: AsyncSession = Depends(get_db)):
    """Update a key pair. Only non-empty credential fields are overwritten."""
    pair = await db.get(ProviderKeyPair, pair_id)
    if not pair:
        raise HTTPException(404, "Key pair not found")

    if body.name is not None:
        pair.name = body.name.strip()

    if body.is_active is not None:
        pair.is_active = body.is_active

    if body.credentials:
        existing = json.loads(pair.credentials or "{}")
        for k, v in body.credentials.items():
            if v not in ("", None):
                existing[k] = v.strip() if isinstance(v, str) else v
        pair.credentials = json.dumps(existing)

    await db.commit()
    return {"message": "Key pair updated"}


@router.delete("/{pair_id}")
async def delete_key_pair(pair_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a key pair (will fail if accounts still reference it)."""
    pair = await db.get(ProviderKeyPair, pair_id)
    if not pair:
        raise HTTPException(404, "Key pair not found")
    await db.delete(pair)
    await db.commit()
    return {"message": "Key pair deleted"}
