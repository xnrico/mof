#!/usr/bin/env python3
"""
Database initialization and seed script for Ministry of Finance
"""
import asyncio
from datetime import datetime
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
    """Seed database with sample data"""
    print("\n🌱 Seeding sample data...")

    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        # Create users (family members)
        babu = User(name="Babu", email="babu@family.com")
        mamu = User(name="Mamu", email="mamu@family.com")

        session.add(babu)
        session.add(mamu)
        await session.commit()
        await session.refresh(babu)
        await session.refresh(mamu)

        print(f"✅ Created users: {babu.name} (ID: {babu.id}), {mamu.name} (ID: {mamu.id})")

        # Create income sources
        babu_income = IncomeSource(
            user_id=babu.id,
            name="Monthly Salary",
            amount=4500.0,
            currency=Currency.GBP,
            frequency="monthly"
        )

        mamu_income = IncomeSource(
            user_id=mamu.id,
            name="Monthly Salary",
            amount=3200.0,
            currency=Currency.GBP,
            frequency="monthly"
        )

        session.add(babu_income)
        session.add(mamu_income)
        await session.commit()

        print(f"✅ Created income sources")

        # Create sample accounts
        babu_uk_bank = Account(
            user_id=babu.id,
            name="UK Current Account",
            account_type=AccountType.CHECKING,
            currency=Currency.GBP,
            provider=IntegrationProvider.GOCARDLESS,
            is_active=True
        )

        babu_us_bank = Account(
            user_id=babu.id,
            name="US Checking Account",
            account_type=AccountType.CHECKING,
            currency=Currency.USD,
            provider=IntegrationProvider.PLAID,
            is_active=True
        )

        babu_ibkr = Account(
            user_id=babu.id,
            name="Interactive Brokers",
            account_type=AccountType.BROKERAGE,
            currency=Currency.USD,
            provider=IntegrationProvider.IBKR,
            is_active=True
        )

        mamu_uk_bank = Account(
            user_id=mamu.id,
            name="UK Current Account",
            account_type=AccountType.CHECKING,
            currency=Currency.GBP,
            provider=IntegrationProvider.GOCARDLESS,
            is_active=True
        )

        mamu_trading212 = Account(
            user_id=mamu.id,
            name="Trading 212",
            account_type=AccountType.BROKERAGE,
            currency=Currency.GBP,
            provider=IntegrationProvider.TRADING212,
            is_active=True
        )

        session.add_all([
            babu_uk_bank,
            babu_us_bank,
            babu_ibkr,
            mamu_uk_bank,
            mamu_trading212
        ])

        await session.commit()

        print(f"✅ Created 5 sample accounts")
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
