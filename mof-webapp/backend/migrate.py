#!/usr/bin/env python3
"""
Migration: add TrueLayer to integrationprovider enum and update GoCardless accounts.

Run inside the backend container:
  docker compose exec backend python migrate.py
"""
import asyncio
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://mof:mof@postgres:5432/mof")


async def run():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    engine = create_async_engine(DATABASE_URL, echo=True)

    async with engine.begin() as conn:
        print("Step 1: Add 'TrueLayer' to integrationprovider Postgres enum...")
        # ALTER TYPE is not transactional in Postgres — must run outside a transaction
        # But asyncpg wraps in a transaction by default, so we use COMMIT trick
        await conn.execute(text("COMMIT"))
        await conn.execute(text(
            "ALTER TYPE integrationprovider ADD VALUE IF NOT EXISTS 'TrueLayer'"
        ))
        await conn.execute(text("BEGIN"))

        print("Step 2: Update GoCardless accounts to TrueLayer...")
        result = await conn.execute(text(
            "UPDATE accounts SET provider = 'TrueLayer' WHERE provider = 'GoCardless'"
        ))
        print(f"  Updated {result.rowcount} account(s)")

        print("Step 3: Update GoCardless integration configs to TrueLayer...")
        result = await conn.execute(text(
            "UPDATE integration_configs SET provider = 'TrueLayer' WHERE provider = 'GoCardless'"
        ))
        print(f"  Updated {result.rowcount} integration config(s)")

    await engine.dispose()
    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(run())
