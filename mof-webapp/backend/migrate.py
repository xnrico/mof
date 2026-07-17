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

    # Step 1: add enum value — must run outside any transaction in a fresh connection
    engine_ddl = create_async_engine(DATABASE_URL, echo=False,
                                     isolation_level="AUTOCOMMIT")
    async with engine_ddl.connect() as conn:
        print("Step 1: checking existing integrationprovider values...")
        result = await conn.execute(text(
            "SELECT unnest(enum_range(NULL::integrationprovider))::text"
        ))
        existing = [r[0] for r in result.fetchall()]
        print(f"  Current values: {existing}")

        if "TrueLayer" not in existing:
            print("  Adding 'TrueLayer'...")
            await conn.execute(text(
                "ALTER TYPE integrationprovider ADD VALUE 'TrueLayer'"
            ))
            print("  Done.")
        else:
            print("  'TrueLayer' already present, skipping.")

    await engine_ddl.dispose()

    # Step 2: update rows — use ::text casting to avoid cached type issues
    engine_dml = create_async_engine(DATABASE_URL, echo=False)
    async with engine_dml.begin() as conn:
        # Determine which GoCardless value name is in use
        result = await conn.execute(text(
            "SELECT unnest(enum_range(NULL::integrationprovider))::text"
        ))
        enum_values = [r[0] for r in result.fetchall()]
        gc_value = next((v for v in enum_values if v.lower() == "gocardless"), None)
        print(f"\nStep 2: GoCardless enum value is: {gc_value!r}")

        if gc_value:
            r = await conn.execute(text(
                f"UPDATE accounts SET provider = 'TrueLayer'::integrationprovider "
                f"WHERE provider::text = :gc"
            ), {"gc": gc_value})
            print(f"  accounts updated: {r.rowcount}")

            r = await conn.execute(text(
                f"UPDATE integration_configs SET provider = 'TrueLayer'::integrationprovider "
                f"WHERE provider::text = :gc"
            ), {"gc": gc_value})
            print(f"  integration_configs updated: {r.rowcount}")
        else:
            print("  No GoCardless value found in enum — skipping row updates.")

    await engine_dml.dispose()
    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(run())
