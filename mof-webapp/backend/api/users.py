from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from pydantic import BaseModel
from datetime import datetime

from models.database import get_db
from models.models import User, IncomeSource

router = APIRouter()


class UserCreate(BaseModel):
    name: str
    email: str | None = None


class UserResponse(BaseModel):
    id: int
    name: str
    email: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class IncomeSourceCreate(BaseModel):
    name: str
    amount: float
    currency: str
    frequency: str = "monthly"


class IncomeSourceResponse(BaseModel):
    id: int
    name: str
    amount: float
    currency: str
    frequency: str
    is_active: bool

    class Config:
        from_attributes = True


@router.post("/", response_model=UserResponse)
async def create_user(user: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new user"""
    db_user = User(name=user.name, email=user.email)
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user


@router.get("/", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    """List all users"""
    result = await db.execute(select(User))
    users = result.scalars().all()
    return users


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific user"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/{user_id}/income", response_model=IncomeSourceResponse)
async def add_income_source(
    user_id: int,
    income: IncomeSourceCreate,
    db: AsyncSession = Depends(get_db)
):
    """Add income source to user"""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db_income = IncomeSource(
        user_id=user_id,
        name=income.name,
        amount=income.amount,
        currency=income.currency,
        frequency=income.frequency
    )
    db.add(db_income)
    await db.commit()
    await db.refresh(db_income)
    return db_income


@router.get("/{user_id}/income", response_model=List[IncomeSourceResponse])
async def list_income_sources(user_id: int, db: AsyncSession = Depends(get_db)):
    """List all income sources for a user"""
    result = await db.execute(
        select(IncomeSource).where(IncomeSource.user_id == user_id)
    )
    income_sources = result.scalars().all()
    return income_sources
