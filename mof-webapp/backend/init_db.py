#!/usr/bin/env python3
"""
Database initialization and seed script for Ministry of Finance
"""
import asyncio
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from models.database import Base
from models.models import User, Account, IncomeSource, Currency, AccountType, IntegrationProvider


# Database URL - use postgres hostname when running in Docker
import os
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://mof:mof@postgres:5432/mof")


async def init_database():
    """Initialize database and create tables"""
    print("🗄️  Initializing database...")

    engine = create_async_engine(DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        # Drop all tables (WARNING: This deletes all data)
        # await conn.run_sync(Base.metadata.drop_all)

        # Create all tables
        await conn.run_sync(Base.metadata.create_all)

    print("✅ Database tables created successfully")

    await engine.dispose()


async def seed_sample_data():
    """Seed database with sample data (idempotent - safe to re-run)"""
    print("\n🌱 Seeding sample data...")

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async def get_or_create_user(session, name, email):
        existing = (
            await session.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if existing:
            return existing, False
        user = User(name=name, email=email)
        session.add(user)
        await session.flush()
        return user, True

    async def get_or_create_income(session, user_id, name, amount, currency, frequency):
        existing = (
            await session.execute(
                select(IncomeSource).where(
                    IncomeSource.user_id == user_id, IncomeSource.name == name
                )
            )
        ).scalar_one_or_none()
        if existing:
            return False
        session.add(
            IncomeSource(
                user_id=user_id,
                name=name,
                amount=amount,
                currency=currency,
                frequency=frequency,
            )
        )
        return True

    async def get_or_create_account(session, user_id, name, account_type, currency, provider):
        existing = (
            await session.execute(
                select(Account).where(
                    Account.user_id == user_id, Account.name == name
                )
            )
        ).scalar_one_or_none()
        if existing:
            return False
        session.add(
            Account(
                user_id=user_id,
                name=name,
                account_type=account_type,
                currency=currency,
                provider=provider,
                is_active=True,
            )
        )
        return True

    async with async_session() as session:
        # Create users (family members)
        babu, babu_new = await get_or_create_user(session, "Babu", "babu@family.com")
        mamu, mamu_new = await get_or_create_user(session, "Mamu", "mamu@family.com")
        await session.commit()
        await session.refresh(babu)
        await session.refresh(mamu)

        def status(created):
            return "created" if created else "already exists"

        print(f"✅ Users: {babu.name} (ID: {babu.id}, {status(babu_new)}), "
              f"{mamu.name} (ID: {mamu.id}, {status(mamu_new)})")

        # Create income sources
        income_added = 0
        income_added += await get_or_create_income(
            session, babu.id, "Monthly Salary", 4500.0, Currency.GBP, "monthly"
        )
        income_added += await get_or_create_income(
            session, mamu.id, "Monthly Salary", 3200.0, Currency.GBP, "monthly"
        )
        await session.commit()
        print(f"✅ Income sources: {income_added} created, {2 - income_added} already existed")

        # Create sample accounts
        accounts = [
            (babu.id, "UK Current Account", AccountType.CHECKING, Currency.GBP, IntegrationProvider.TRUELAYER),
            (babu.id, "US Checking Account", AccountType.CHECKING, Currency.USD, IntegrationProvider.PLAID),
            (babu.id, "Interactive Brokers", AccountType.BROKERAGE, Currency.USD, IntegrationProvider.IBKR),
            (mamu.id, "UK Current Account", AccountType.CHECKING, Currency.GBP, IntegrationProvider.TRUELAYER),
            (mamu.id, "Trading 212", AccountType.BROKERAGE, Currency.GBP, IntegrationProvider.TRADING212),
        ]
        accounts_added = 0
        for user_id, name, acc_type, currency, provider in accounts:
            accounts_added += await get_or_create_account(
                session, user_id, name, acc_type, currency, provider
            )
        await session.commit()

        print(f"✅ Accounts: {accounts_added} created, {len(accounts) - accounts_added} already existed")
        print(f"   - Babu: UK Bank, US Bank, IBKR")
        print(f"   - Mamu: UK Bank, Trading 212")

    await engine.dispose()

    print("\n✅ Sample data seeded successfully!")
    print("\nNext steps:")
    print("  1. Configure integration credentials for each account")
    print("  2. Use POST /api/accounts/{id}/integration to add API credentials")
    print("  3. Trigger sync with POST /api/sync/account/{id}")


async def main():
    """Main function"""
    print("=" * 60)
    print("Ministry of Finance - Database Setup")
    print("=" * 60)

    try:
        await init_database()

        response = input("\n🤔 Do you want to seed sample data? (y/n): ")
        if response.lower() == 'y':
            await seed_sample_data()
        else:
            print("⏭️  Skipping sample data seeding")

        print("\n" + "=" * 60)
        print("✅ Setup complete!")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
