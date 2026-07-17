#!/usr/bin/env python3
"""
Migration: add TrueLayer to integrationprovider enum and update GoCardless accounts.

Run inside the backend container:
  docker compose exec backend python migrate.py

Note: SQLAlchemy stores Python enum member NAMES (e.g. 'GOCARDLESS', 'TRUELAYER')
in Postgres, not the Python enum .values ('GoCardless', 'TrueLayer').
"""
import asyncio
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://mof:mof@postgres:5432/mof")


async def run():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    # Step 1: inspect existing enum values and diagnose
    engine_ro = create_async_engine(DATABASE_URL, echo=False)
    async with engine_ro.connect() as conn:
        result = await conn.execute(text(
            "SELECT unnest(enum_range(NULL::integrationprovider))::text"
        ))
        existing = [r[0] for r in result.fetchall()]
        print(f"Current integrationprovider enum values: {existing}")

        result2 = await conn.execute(text(
            "SELECT DISTINCT provider::text FROM accounts"
        ))
        current_providers = [r[0] for r in result2.fetchall()]
        print(f"Current account providers in DB: {current_providers}")
    await engine_ro.dispose()

    # Step 2: add 'TRUELAYER' if missing (SQLAlchemy uses names, not values)
    engine_ddl = create_async_engine(DATABASE_URL, echo=False,
                                     isolation_level="AUTOCOMMIT")
    async with engine_ddl.connect() as conn:
        if "TRUELAYER" not in existing:
            print("Adding 'TRUELAYER' to enum...")
            await conn.execute(text(
                "ALTER TYPE integrationprovider ADD VALUE 'TRUELAYER'"
            ))
            print("  Done.")
        else:
            print("'TRUELAYER' already in enum, skipping ALTER TYPE.")

        # Clean up any 'TrueLayer' (value-style) accidentally stored by prior migration
        if "TrueLayer" in existing:
            print("Note: 'TrueLayer' (value-style) is also in the enum — rows using it will be fixed below.")
    await engine_ddl.dispose()

    # Step 3: update rows — GOCARDLESS → TRUELAYER, fix any TrueLayer rows
    engine_dml = create_async_engine(DATABASE_URL, echo=False)
    async with engine_dml.begin() as conn:
        # Fix accounts stored with value-style 'TrueLayer' → name-style 'TRUELAYER'
        r = await conn.execute(text(
            "UPDATE accounts SET provider = 'TRUELAYER' WHERE provider::text = 'TrueLayer'"
        ))
        if r.rowcount:
            print(f"Fixed {r.rowcount} account(s): 'TrueLayer' → 'TRUELAYER'")

        r = await conn.execute(text(
            "UPDATE integration_configs SET provider = 'TRUELAYER' WHERE provider::text = 'TrueLayer'"
        ))
        if r.rowcount:
            print(f"Fixed {r.rowcount} integration_config(s): 'TrueLayer' → 'TRUELAYER'")

        # Update GOCARDLESS → TRUELAYER (SQLAlchemy uses names)
        r = await conn.execute(text(
            "UPDATE accounts SET provider = 'TRUELAYER' WHERE provider::text = 'GOCARDLESS'"
        ))
        print(f"Updated {r.rowcount} account(s): GOCARDLESS → TRUELAYER")

        r = await conn.execute(text(
            "UPDATE integration_configs SET provider = 'TRUELAYER' WHERE provider::text = 'GOCARDLESS'"
        ))
        print(f"Updated {r.rowcount} integration_config(s): GOCARDLESS → TRUELAYER")

        # Verify final state
        result = await conn.execute(text(
            "SELECT DISTINCT provider::text FROM accounts ORDER BY 1"
        ))
        final = [r[0] for r in result.fetchall()]
        print(f"Final account providers: {final}")

    # Schema migration: add columns/tables introduced by the Account Management feature
    engine_schema = create_async_engine(DATABASE_URL, echo=False, isolation_level="AUTOCOMMIT")
    async with engine_schema.connect() as conn:
        print("\nStep 4: Schema migrations for Account Management feature...")

        # provider_key_pairs table (create_all handles new tables on startup,
        # but include here for explicit documentation)
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS provider_key_pairs (
                id SERIAL PRIMARY KEY,
                provider integrationprovider NOT NULL,
                name VARCHAR(100) NOT NULL,
                credentials TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
            )
        """))
        print("  provider_key_pairs table: OK")

        # key_pair_id FK on integration_configs (ALTER TABLE — idempotent)
        await conn.execute(text("""
            ALTER TABLE integration_configs
            ADD COLUMN IF NOT EXISTS key_pair_id INTEGER
            REFERENCES provider_key_pairs(id) ON DELETE SET NULL
        """))
        print("  integration_configs.key_pair_id column: OK")

    await engine_schema.dispose()
    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(run())
