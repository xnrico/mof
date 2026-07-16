from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel
from datetime import datetime

from models.database import get_db
from models.models import Account, IntegrationConfig, IntegrationProvider, AccountType, Currency

router = APIRouter()


class AccountCreate(BaseModel):
    user_id: int
    name: str
    account_type: str
    currency: str
    provider: str


class IntegrationConfigCreate(BaseModel):
    provider: str
    access_token: str | None = None
    refresh_token: str | None = None
    item_id: str | None = None
    config_data: str | None = None


class AccountResponse(BaseModel):
    id: int
    user_id: int
    name: str
    account_type: str
    currency: str
    provider: str
    current_balance: float | None
    last_synced_at: datetime | None
    is_active: bool

    class Config:
        from_attributes = True


@router.post("/", response_model=AccountResponse)
async def create_account(account: AccountCreate, db: AsyncSession = Depends(get_db)):
    """Create a new account"""
    db_account = Account(
        user_id=account.user_id,
        name=account.name,
        account_type=AccountType(account.account_type),
        currency=Currency(account.currency),
        provider=IntegrationProvider(account.provider)
    )
    db.add(db_account)
    await db.commit()
    await db.refresh(db_account)
    return db_account


@router.get("/", response_model=List[AccountResponse])
async def list_accounts(user_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """List all accounts, optionally filtered by user"""
    query = select(Account)
    if user_id:
        query = query.where(Account.user_id == user_id)

    result = await db.execute(query)
    accounts = result.scalars().all()
    return accounts


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(account_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific account"""
    account = await db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.post("/{account_id}/integration")
async def configure_integration(
    account_id: int,
    config: IntegrationConfigCreate,
    db: AsyncSession = Depends(get_db)
):
    """Configure integration for an account"""
    account = await db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Check if integration config already exists
    result = await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.account_id == account_id)
    )
    existing_config = result.scalar_one_or_none()

    if existing_config:
        # Update existing
        existing_config.access_token = config.access_token
        existing_config.refresh_token = config.refresh_token
        existing_config.item_id = config.item_id
        existing_config.config_data = config.config_data
        existing_config.updated_at = datetime.utcnow()
    else:
        # Create new
        db_config = IntegrationConfig(
            account_id=account_id,
            provider=IntegrationProvider(config.provider),
            access_token=config.access_token,
            refresh_token=config.refresh_token,
            item_id=config.item_id,
            config_data=config.config_data
        )
        db.add(db_config)

    await db.commit()
    return {"message": "Integration configured successfully"}


@router.delete("/{account_id}")
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an account"""
    account = await db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    await db.delete(account)
    await db.commit()
    return {"message": "Account deleted successfully"}
