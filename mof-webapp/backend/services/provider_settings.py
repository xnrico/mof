"""Global provider settings: schema, persistence helpers, and env fallback.

Values are stored in the ``app_settings`` table and override the matching
attribute on ``config.settings`` (which is loaded from the environment/.env).
"""
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.models import AppSetting


# Field metadata per provider. `secret` fields are masked when read back.
PROVIDER_FIELDS = {
    "Plaid": [
        {"key": "PLAID_CLIENT_ID", "label": "Client ID", "secret": False},
        {"key": "PLAID_SECRET", "label": "Secret", "secret": True},
        {"key": "PLAID_ENV", "label": "Environment", "secret": False},
    ],
    "GoCardless": [
        {"key": "GOCARDLESS_SECRET_ID", "label": "Secret ID", "secret": False},
        {"key": "GOCARDLESS_SECRET_KEY", "label": "Secret Key", "secret": True},
        {"key": "GOCARDLESS_ENV", "label": "Environment (sandbox / live)", "secret": False},
    ],
    "TrueLayer": [
        {"key": "TRUELAYER_CLIENT_ID", "label": "Client ID", "secret": False},
        {"key": "TRUELAYER_CLIENT_SECRET", "label": "Client Secret", "secret": True},
        {"key": "TRUELAYER_ENV", "label": "Environment (sandbox / live)", "secret": False},
    ],
    "Trading212": [
        {"key": "TRADING212_API_KEY", "label": "API Key (Public)", "secret": False},
        {"key": "TRADING212_API_SECRET", "label": "API Secret (Private)", "secret": True},
        {"key": "TRADING212_ENV", "label": "Environment (live / demo)", "secret": False},
    ],
    "IBKR": [
        {"key": "IBKR_HOST", "label": "Host", "secret": False},
        {"key": "IBKR_PORT", "label": "Port", "secret": False},
        {"key": "IBKR_ACCOUNT_ID", "label": "Account ID", "secret": False},
    ],
    "Sophtron": [
        {"key": "SOPHTRON_USER_ID", "label": "API User ID", "secret": False},
        {"key": "SOPHTRON_ACCESS_KEY", "label": "API Access Key", "secret": True},
        {"key": "SOPHTRON_BASE_URL", "label": "Base URL", "secret": False},
    ],
}

# All known setting keys and whether each is secret.
_ALL_FIELDS = {f["key"]: f for fields in PROVIDER_FIELDS.values() for f in fields}


async def get_effective(db: AsyncSession, key: str, default: Optional[str] = None) -> Optional[str]:
    """Return the DB override for `key`, falling back to the env default."""
    row = (
        await db.execute(select(AppSetting).where(AppSetting.key == key))
    ).scalar_one_or_none()
    if row and row.value not in (None, ""):
        return row.value
    if default is not None:
        return default
    # Fall back to the env-loaded settings attribute of the same name.
    env_val = getattr(settings, key, None)
    return str(env_val) if env_val is not None else None


async def get_all_overrides(db: AsyncSession) -> dict:
    """Return {key: value} for all DB-stored settings."""
    rows = (await db.execute(select(AppSetting))).scalars().all()
    return {r.key: r.value for r in rows}


async def upsert(db: AsyncSession, key: str, value: str) -> None:
    """Insert or update a single setting."""
    row = (
        await db.execute(select(AppSetting).where(AppSetting.key == key))
    ).scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))


def is_secret(key: str) -> bool:
    field = _ALL_FIELDS.get(key)
    return bool(field and field["secret"])


def known_key(key: str) -> bool:
    return key in _ALL_FIELDS
