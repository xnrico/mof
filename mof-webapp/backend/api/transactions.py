from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List
from pydantic import BaseModel
from datetime import datetime

from models.database import get_db
from models.models import Transaction, Account, Category, Currency

router = APIRouter()


class TransactionResponse(BaseModel):
    id: int
    account_id: int
    external_transaction_id: str | None
    description: str
    amount: float
    currency: str
    category: str
    transaction_date: datetime
    merchant_name: str | None
    notes: str | None
    category_override: str | None
    is_hidden: bool

    class Config:
        from_attributes = True


class TransactionUpdate(BaseModel):
    category_override: str | None = None
    notes: str | None = None
    is_hidden: bool | None = None


class TransactionSummary(BaseModel):
    category: str
    total: float
    count: int


@router.get("/", response_model=List[TransactionResponse])
async def list_transactions(
    account_id: int | None = None,
    category: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List transactions with optional filters"""
    query = select(Transaction).where(Transaction.is_hidden == False)

    if account_id:
        query = query.where(Transaction.account_id == account_id)

    if category:
        query = query.where(Transaction.category == Category(category))

    if start_date:
        query = query.where(Transaction.transaction_date >= start_date)

    if end_date:
        query = query.where(Transaction.transaction_date <= end_date)

    query = query.order_by(Transaction.transaction_date.desc())
    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    transactions = result.scalars().all()
    return transactions


@router.get("/{transaction_id}", response_model=TransactionResponse)
async def get_transaction(transaction_id: int, db: AsyncSession = Depends(get_db)):
    """Get a specific transaction"""
    transaction = await db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return transaction


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    update: TransactionUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a transaction (category override, notes, hide)"""
    transaction = await db.get(Transaction, transaction_id)
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")

    if update.category_override is not None:
        transaction.category_override = Category(update.category_override)

    if update.notes is not None:
        transaction.notes = update.notes

    if update.is_hidden is not None:
        transaction.is_hidden = update.is_hidden

    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.get("/summary/by-category")
async def get_summary_by_category(
    user_id: int,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    currency: str = "GBP",
    db: AsyncSession = Depends(get_db)
):
    """Get transaction summary grouped by category"""
    # Get all accounts for user
    accounts_result = await db.execute(
        select(Account).where(Account.user_id == user_id)
    )
    accounts = accounts_result.scalars().all()
    account_ids = [acc.id for acc in accounts]

    if not account_ids:
        return []

    # Build query
    query = select(Transaction).where(
        and_(
            Transaction.account_id.in_(account_ids),
            Transaction.is_hidden == False,
            Transaction.currency == Currency(currency)
        )
    )

    if start_date:
        query = query.where(Transaction.transaction_date >= start_date)

    if end_date:
        query = query.where(Transaction.transaction_date <= end_date)

    result = await db.execute(query)
    transactions = result.scalars().all()

    # Group by category
    summary = {}
    for txn in transactions:
        cat = txn.category_override if txn.category_override else txn.category
        cat_str = cat.value if hasattr(cat, 'value') else str(cat)

        if cat_str not in summary:
            summary[cat_str] = {"category": cat_str, "total": 0.0, "count": 0}

        summary[cat_str]["total"] += txn.amount
        summary[cat_str]["count"] += 1

    return list(summary.values())
