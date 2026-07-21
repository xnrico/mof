from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from typing import List
from pydantic import BaseModel
from datetime import datetime

from models.database import get_db
from models.models import Transaction, Account, Category, Currency, IncomeSource

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
    include_in_accounting: bool

    class Config:
        from_attributes = True


class TransactionUpdate(BaseModel):
    category_override: str | None = None
    notes: str | None = None
    is_hidden: bool | None = None
    include_in_accounting: bool | None = None


class BulkCategorizeRequest(BaseModel):
    vendor_key: str   # matched case-insensitively against merchant_name or description
    category: str


class BulkCategorizeResponse(BaseModel):
    updated: int


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

    if update.include_in_accounting is not None:
        transaction.include_in_accounting = update.include_in_accounting

    await db.commit()
    await db.refresh(transaction)
    return transaction


@router.post("/bulk-categorize", response_model=BulkCategorizeResponse)
async def bulk_categorize(
    body: BulkCategorizeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set category_override on every transaction whose merchant_name or
    description contains vendor_key (case-insensitive)."""
    try:
        cat = Category(body.category)
    except ValueError:
        raise HTTPException(400, f"Unknown category: {body.category}")

    key = body.vendor_key.strip()
    if not key:
        raise HTTPException(400, "vendor_key must not be empty")

    result = await db.execute(
        select(Transaction).where(
            or_(
                func.lower(Transaction.merchant_name).contains(key.lower()),
                func.lower(Transaction.description).contains(key.lower()),
            )
        )
    )
    txns = result.scalars().all()
    for t in txns:
        t.category_override = cat
    await db.commit()
    return {"updated": len(txns)}


@router.get("/summary/by-category")
async def get_summary_by_category(
    user_id: int,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    currency: str = "GBP",
    expenses_only: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Get transaction summary grouped by effective category.

    When expenses_only=true, only negative-amount transactions are included
    and totals are returned as positive magnitudes — suitable for a spending
    pie chart. When false, all transactions are included and totals reflect
    net signed amounts (income positive, spending negative).
    """
    accounts_result = await db.execute(
        select(Account).where(Account.user_id == user_id)
    )
    accounts = accounts_result.scalars().all()
    account_ids = [acc.id for acc in accounts]

    if not account_ids:
        return []

    conditions = [
        Transaction.account_id.in_(account_ids),
        Transaction.is_hidden == False,
        Transaction.include_in_accounting == True,
        Transaction.currency == Currency(currency),
    ]
    if expenses_only:
        conditions.append(Transaction.amount < 0)

    query = select(Transaction).where(and_(*conditions))
    if start_date:
        query = query.where(Transaction.transaction_date >= start_date)
    if end_date:
        query = query.where(Transaction.transaction_date <= end_date)

    result = await db.execute(query)
    transactions = result.scalars().all()

    summary: dict = {}
    for txn in transactions:
        cat = txn.category_override if txn.category_override else txn.category
        cat_str = cat.value if hasattr(cat, "value") else str(cat)
        if cat_str not in summary:
            summary[cat_str] = {"category": cat_str, "total": 0.0, "count": 0}
        # expenses_only: store positive magnitude; otherwise store signed amount
        amount = abs(txn.amount) if expenses_only else txn.amount
        summary[cat_str]["total"] += amount
        summary[cat_str]["count"] += 1

    return list(summary.values())


@router.get("/summary/monthly-income")
async def get_monthly_income(
    user_id: int,
    currency: str = "GBP",
    db: AsyncSession = Depends(get_db),
):
    """Monthly income breakdown for a user.

    - salary: sum of this calendar month's Salary-category transactions
      (actual synced pay), falling back to the user's latest monthly Salary
      income source when there are no Salary transactions yet this month.
    - additional_income: sum of this calendar month's transactions categorised
      (effective category) as Income, Interest, or Dividend.
    Both across the user's accounts, in the requested currency, counting only
    rows with include_in_accounting = true.
    """
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    accounts = (
        await db.execute(select(Account).where(Account.user_id == user_id))
    ).scalars().all()
    account_ids = [a.id for a in accounts]

    salary = 0.0
    additional = 0.0
    if account_ids:
        txns = (
            await db.execute(
                select(Transaction).where(
                    and_(
                        Transaction.account_id.in_(account_ids),
                        Transaction.is_hidden == False,
                        Transaction.include_in_accounting == True,
                        Transaction.currency == Currency(currency),
                        Transaction.transaction_date >= month_start,
                    )
                )
            )
        ).scalars().all()
        for t in txns:
            cat = t.category_override if t.category_override else t.category
            if cat == Category.SALARY:
                salary += abs(t.amount)
            elif cat in (Category.INCOME, Category.INTEREST, Category.DIVIDEND):
                additional += abs(t.amount)

    # Fall back to the configured monthly salary if none synced this month yet.
    if salary == 0.0:
        salary_row = (
            await db.execute(
                select(IncomeSource)
                .where(
                    IncomeSource.user_id == user_id,
                    IncomeSource.is_active == True,
                    IncomeSource.frequency == "monthly",
                    func.lower(IncomeSource.name).contains("salary"),
                )
                .order_by(IncomeSource.id.desc())
            )
        ).scalars().first()
        if salary_row:
            salary = float(salary_row.amount)

    return {
        "salary": salary,
        "additional_income": additional,
        "total": salary + additional,
        "currency": currency,
    }


@router.get("/summary/month-totals")
async def get_month_totals(
    user_id: int,
    currency: str = "GBP",
    db: AsyncSession = Depends(get_db),
):
    """This calendar month's total income and total spending for a user.

    Income = sum of positive amounts, spending = sum of |negative amounts|,
    across the user's accounts in the requested currency, counting only rows
    with include_in_accounting = true.
    """
    accounts = (
        await db.execute(select(Account).where(Account.user_id == user_id))
    ).scalars().all()
    account_ids = [a.id for a in accounts]

    income = 0.0
    spending = 0.0
    if account_ids:
        now = datetime.now()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        txns = (
            await db.execute(
                select(Transaction).where(
                    and_(
                        Transaction.account_id.in_(account_ids),
                        Transaction.is_hidden == False,
                        Transaction.include_in_accounting == True,
                        Transaction.currency == Currency(currency),
                        Transaction.transaction_date >= month_start,
                    )
                )
            )
        ).scalars().all()
        for t in txns:
            if t.amount >= 0:
                income += t.amount
            else:
                spending += -t.amount

    return {
        "income": income,
        "spending": spending,
        "net": income - spending,
        "currency": currency,
    }
