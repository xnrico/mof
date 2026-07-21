from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel

from models.database import get_db
from services.sync_service import SyncService

router = APIRouter()


class SyncResult(BaseModel):
    account_id: int
    success: bool
    transactions_added: int
    transactions_updated: int
    error: str | None


@router.post("/account/{account_id}", response_model=SyncResult)
async def sync_account(
    account_id: int,
    background_tasks: BackgroundTasks,
    full: bool = False,
    since_days: int | None = None,
    db: AsyncSession = Depends(get_db)
):
    """Trigger sync for a specific account.

    Pass ?full=true to ignore the last sync time and re-pull the full
    backfill window (backfills history / corrects existing transactions).
    Pass ?since_days=N to re-pull only the last N days — useful for TrueLayer
    banks that return 403 for history older than 90 days after the initial
    consent window (takes precedence over full).
    """
    sync_service = SyncService(db)
    result = await sync_service.sync_account(account_id, full=full, since_days=since_days)
    return result


@router.post("/all", response_model=List[SyncResult])
async def sync_all_accounts(
    background_tasks: BackgroundTasks,
    full: bool = False,
    since_days: int | None = None,
    db: AsyncSession = Depends(get_db)
):
    """Trigger sync for all accounts. Pass ?full=true for a full re-pull, or
    ?since_days=N to re-pull only the last N days (see sync_account)."""
    sync_service = SyncService(db)
    results = await sync_service.sync_all_accounts(full=full, since_days=since_days)
    return results


@router.get("/status/{account_id}")
async def get_sync_status(account_id: int, db: AsyncSession = Depends(get_db)):
    """Get sync status for an account"""
    from models.models import IntegrationConfig
    from sqlalchemy import select

    result = await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.account_id == account_id)
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Integration config not found")

    return {
        "account_id": account_id,
        "last_sync_at": config.last_sync_at,
        "last_sync_status": config.last_sync_status,
        "last_error": config.last_error,
        "is_active": config.is_active
    }
