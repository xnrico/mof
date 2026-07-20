"""Exchange-rate endpoints for dashboard currency switching."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db
from services import fx_service

router = APIRouter()


@router.get("/rates")
async def get_rates(db: AsyncSession = Depends(get_db)):
    """Return the cached GBP<->USD rates (refreshed every 5 min by the scheduler)."""
    return await fx_service.get_rates(db)


@router.post("/refresh")
async def refresh_rates(db: AsyncSession = Depends(get_db)):
    """Force an immediate refresh of the exchange rate."""
    rate = await fx_service.refresh_rate(db)
    return await fx_service.get_rates(db) if rate else {"error": "refresh failed"}
