from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
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
    is_shared: bool = False


class IntegrationConfigCreate(BaseModel):
    provider: str
    key_pair_id: int | None = None
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
    is_shared: bool

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
        provider=IntegrationProvider(account.provider),
        is_shared=account.is_shared,
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
        if config.key_pair_id is not None:
            existing_config.key_pair_id = config.key_pair_id
        if config.access_token is not None:
            existing_config.access_token = config.access_token
        if config.refresh_token is not None:
            existing_config.refresh_token = config.refresh_token
        if config.item_id is not None:
            existing_config.item_id = config.item_id
        if config.config_data is not None:
            existing_config.config_data = config.config_data
        existing_config.updated_at = datetime.utcnow()
    else:
        db_config = IntegrationConfig(
            account_id=account_id,
            provider=IntegrationProvider(config.provider),
            key_pair_id=config.key_pair_id,
            access_token=config.access_token,
            refresh_token=config.refresh_token,
            item_id=config.item_id,
            config_data=config.config_data
        )
        db.add(db_config)

    await db.commit()
    return {"message": "Integration configured successfully"}


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    account_type: Optional[str] = None
    currency: Optional[str] = None
    provider: Optional[str] = None
    is_active: Optional[bool] = None
    is_shared: Optional[bool] = None


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(account_id: int, update: AccountUpdate, db: AsyncSession = Depends(get_db)):
    """Update account fields"""
    account = await db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if update.name is not None:
        account.name = update.name
    if update.account_type is not None:
        account.account_type = AccountType(update.account_type)
    if update.currency is not None:
        account.currency = Currency(update.currency)
    if update.provider is not None:
        account.provider = IntegrationProvider(update.provider)
    if update.is_active is not None:
        account.is_active = update.is_active
    if update.is_shared is not None:
        account.is_shared = update.is_shared

    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/{account_id}")
async def delete_account(account_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an account"""
    account = await db.get(Account, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    await db.delete(account)
    await db.commit()
    return {"message": "Account deleted successfully"}
