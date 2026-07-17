from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Dict, Optional

from models.database import get_db
from services import provider_settings as ps

router = APIRouter()


class ProviderField(BaseModel):
    key: str
    label: str
    secret: bool
    value: Optional[str] = None      # cleartext for non-secret fields
    is_set: bool = False             # whether a value exists (for secrets)


class ProviderSettings(BaseModel):
    provider: str
    fields: list[ProviderField]


class UpdateSettings(BaseModel):
    # Map of setting key -> new value. Empty/omitted secret values are ignored
    # (existing value is kept). Send a single space to clear a value.
    values: Dict[str, str]


@router.get("/providers", response_model=list[ProviderSettings])
async def get_provider_settings(db: AsyncSession = Depends(get_db)):
    """Return current provider settings; secret values are masked."""
    result = []
    for provider, fields in ps.PROVIDER_FIELDS.items():
        out_fields = []
        for f in fields:
            effective = await ps.get_effective(db, f["key"])
            is_set = bool(effective)
            out_fields.append(
                ProviderField(
                    key=f["key"],
                    label=f["label"],
                    secret=f["secret"],
                    value=None if f["secret"] else effective,
                    is_set=is_set,
                )
            )
        result.append(ProviderSettings(provider=provider, fields=out_fields))
    return result


@router.put("/providers")
async def update_provider_settings(
    update: UpdateSettings, db: AsyncSession = Depends(get_db)
):
    """Upsert provider settings. Blank secret values are skipped."""
    updated = []
    for key, value in update.values.items():
        if not ps.known_key(key):
            continue
        # Skip blank values so an untouched password field doesn't wipe secrets.
        if value == "":
            continue
        # Allow explicit clearing via a single space; otherwise strip whitespace
        # to prevent leading/trailing spaces breaking credentials.
        cleaned = "" if value == " " else value.strip()
        await ps.upsert(db, key, cleaned)
        updated.append(key)

    await db.commit()
    return {"message": "Settings updated", "updated": updated}
