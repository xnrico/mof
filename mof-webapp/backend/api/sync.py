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
    db: AsyncSession = Depends(get_db)
):
    """Trigger sync for a specific account"""
    sync_service = SyncService(db)
    result = await sync_service.sync_account(account_id)
    return result


@router.post("/all", response_model=List[SyncResult])
async def sync_all_accounts(
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Trigger sync for all accounts"""
    sync_service = SyncService(db)
    results = await sync_service.sync_all_accounts()
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
