"""Fictional seed data for demo mode.

Everything here is invented — no real people, accounts, or transactions. It
runs only against the separate demo database (`mof_demo`); see
`models/database.py`. The dataset is broad enough that the dashboard pie,
per-month summaries, per-user tabs, the shared pool, and the PDF report all
render meaningfully.
"""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import Base, demo_engine, demo_session_maker
from models.models import (
    User, Account, IncomeSource, Transaction,
    Currency, AccountType, IntegrationProvider, Category,
)


# Recurring monthly spend patterns per account, expressed as
# (day_of_month, description, merchant, amount, category). Amounts follow the
# app convention: debits/purchases negative, income positive.
def _monthly_pattern(account_key: str):
    patterns = {
        "alex_current": [
            (1, "Monthly Salary", "Acme Corp", 4200.00, Category.SALARY),
            (2, "Rent", "Greenfield Lettings", -1450.00, Category.HOUSING),
            (5, "Weekly groceries", "Tesco", -78.40, Category.GROCERY),
            (12, "Weekly groceries", "Sainsbury's", -64.10, Category.GROCERY),
            (19, "Weekly groceries", "Tesco", -81.25, Category.GROCERY),
            (26, "Weekly groceries", "Lidl", -52.90, Category.GROCERY),
            (7, "Lunch", "Pret A Manger", -12.85, Category.FOOD),
            (14, "Dinner out", "Franco Manca", -41.20, Category.FOOD),
            (21, "Coffee", "Caffe Nero", -3.60, Category.FOOD),
            (9, "Rail season", "Trainline", -96.00, Category.TRANSPORT),
            (16, "Netflix", "Netflix", -10.99, Category.SUBSCRIPTIONS),
            (16, "Spotify", "Spotify", -11.99, Category.SUBSCRIPTIONS),
            (23, "Cinema", "Odeon", -24.00, Category.ENTERTAINMENT),
            (11, "New shoes", "Zara", -69.99, Category.SHOPPING),
        ],
        "alex_savings": [
            (3, "Interest", "Barclays", 18.20, Category.INTEREST),
        ],
        "jordan_current": [
            (1, "Monthly Salary", "Globex Ltd", 3600.00, Category.SALARY),
            (6, "Weekly groceries", "Waitrose", -92.30, Category.GROCERY),
            (13, "Weekly groceries", "Aldi", -47.75, Category.GROCERY),
            (20, "Weekly groceries", "Tesco", -70.10, Category.GROCERY),
            (27, "Weekly groceries", "Sainsbury's", -58.40, Category.GROCERY),
            (8, "Brunch", "Bill's", -28.50, Category.FOOD),
            (15, "Takeaway", "Deliveroo", -33.20, Category.FOOD),
            (10, "Fuel", "Shell", -62.00, Category.CAR),
            (17, "Gym", "PureGym", -24.99, Category.SUBSCRIPTIONS),
            (22, "Concert tickets", "Ticketmaster", -85.00, Category.ENTERTAINMENT),
            (25, "Jacket", "Uniqlo", -49.90, Category.SHOPPING),
        ],
        "jordan_brokerage": [
            (4, "Dividend", "Vanguard S&P 500", 42.15, Category.DIVIDEND),
            (18, "Monthly contribution", "Vanguard", -500.00, Category.INVESTMENT),
        ],
        "shared_pool": [
            (2, "Council tax", "Local Council", -168.00, Category.HOUSING),
            (3, "Electricity & gas", "Octopus Energy", -142.50, Category.HOUSING),
            (4, "Broadband", "BT", -35.00, Category.SUBSCRIPTIONS),
            (5, "Water", "Thames Water", -38.75, Category.HOUSING),
            (11, "Household shop", "IKEA", -124.30, Category.SHOPPING),
            (20, "Family dinner", "Pizza Express", -76.40, Category.FOOD),
        ],
    }
    return patterns.get(account_key, [])


# Account definitions: (key, user_ref, name, type, currency, is_shared, opening_balance).
# user_ref is "alex", "jordan", or "shared" (owner still recorded for shared).
_ACCOUNTS = [
    ("alex_current", "alex", "Everyday Current", AccountType.CHECKING, Currency.GBP, False, 3200.00),
    ("alex_savings", "alex", "Rainy Day Savings", AccountType.SAVINGS, Currency.GBP, False, 8750.00),
    ("jordan_current", "jordan", "Main Current", AccountType.CHECKING, Currency.GBP, False, 2100.00),
    ("jordan_brokerage", "jordan", "Investment Account", AccountType.BROKERAGE, Currency.USD, False, 15400.00),
    ("shared_pool", "alex", "Shared Household Pool", AccountType.CHECKING, Currency.GBP, True, 1850.00),
]


def _month_starts(now: datetime, count: int) -> list[datetime]:
    """First-of-month datetimes for the current month and the prior (count-1)."""
    starts = []
    y, m = now.year, now.month
    for _ in range(count):
        starts.append(datetime(y, m, 1))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    return starts


async def seed_demo(session: AsyncSession, *, now: datetime | None = None) -> bool:
    """Populate the demo DB with fictional data. Idempotent: no-op if users
    already exist. Returns True if it seeded, False if it skipped."""
    existing = (await session.execute(select(User.id).limit(1))).first()
    if existing:
        return False

    # `now` is injected so the seed is deterministic under test; default to the
    # real clock at call time (fine here — this is a one-shot seed, not a
    # resumable workflow).
    now = now or datetime.utcnow()

    alex = User(name="Alex Carter", email="alex@example.com")
    jordan = User(name="Jordan Lee", email="jordan@example.com")
    session.add_all([alex, jordan])
    await session.flush()

    session.add_all([
        IncomeSource(user_id=alex.id, name="Monthly Salary", amount=4200.0,
                     currency=Currency.GBP, frequency="monthly"),
        IncomeSource(user_id=jordan.id, name="Monthly Salary", amount=3600.0,
                     currency=Currency.GBP, frequency="monthly"),
    ])

    user_ids = {"alex": alex.id, "jordan": jordan.id, "shared": alex.id}
    accounts: dict[str, Account] = {}
    for key, owner, name, acc_type, currency, is_shared, opening in _ACCOUNTS:
        acc = Account(
            user_id=user_ids[owner],
            name=name,
            account_type=acc_type,
            currency=currency,
            provider=IntegrationProvider.MANUAL,  # Manual → never auto-syncs
            is_active=True,
            is_shared=is_shared,
            current_balance=opening,
            last_synced_at=now,
        )
        accounts[key] = acc
        session.add(acc)
    await session.flush()

    # Three months of transactions (this month + two prior) from the patterns.
    months = _month_starts(now, 3)
    seq = 0
    for key, acc in accounts.items():
        running = 0.0
        for start in months:
            for day, desc, merchant, amount, category in _monthly_pattern(key):
                # Clamp the day to a value valid in every month (<=28).
                d = min(day, 28)
                txn_date = start.replace(day=d)
                if txn_date > now:
                    continue  # don't post future-dated transactions
                seq += 1
                running += amount
                session.add(Transaction(
                    account_id=acc.id,
                    external_transaction_id=f"demo-{key}-{seq}",
                    description=desc,
                    amount=amount,
                    currency=acc.currency,
                    category=category,
                    transaction_date=txn_date,
                    posted_date=txn_date,
                    merchant_name=merchant,
                ))
        # Nudge the closing balance so it reflects the seeded activity.
        acc.current_balance = round((acc.current_balance or 0.0) + running, 2)

    await session.commit()
    return True


async def reset_demo() -> None:
    """Wipe and reseed the demo database. Scoped entirely to demo_engine —
    the real database is never referenced here."""
    async with demo_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with demo_session_maker() as session:
        await seed_demo(session)
