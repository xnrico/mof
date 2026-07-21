#!/usr/bin/env python3
"""
Idempotent schema/data migrations. Run inside the backend container:
  docker compose exec backend python migrate.py

Covers: TrueLayer enum + account migration, Account Management schema
(key pairs, is_shared), removal of GoCardless + Sophtron (reassign rows,
delete stale key pairs), and per-account transaction uniqueness.

Note: SQLAlchemy stores Python enum member NAMES (e.g. 'TRUELAYER'), not the
Python enum .values ('TrueLayer'), in Postgres.
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

        # is_shared flag on accounts (Daixu shared pool) — idempotent
        await conn.execute(text("""
            ALTER TABLE accounts
            ADD COLUMN IF NOT EXISTS is_shared BOOLEAN NOT NULL DEFAULT FALSE
        """))
        print("  accounts.is_shared column: OK")

    await engine_schema.dispose()

    # Step 5: remove GoCardless + Sophtron. Both providers were dropped, so any
    # DB row still carrying those enum NAMES would crash on read (the Python
    # enum no longer has the members). Reassign rows and delete stale key pairs.
    # Postgres can't easily drop an enum value, so the type keeps GOCARDLESS/
    # SOPHTRON — harmless once nothing references them.
    engine_cleanup = create_async_engine(DATABASE_URL, echo=False)
    async with engine_cleanup.begin() as conn:
        print("\nStep 5: Removing GoCardless + Sophtron...")

        # SOPHTRON was never really used in prod → fall back to MANUAL (no sync).
        for table in ("accounts", "integration_configs"):
            r = await conn.execute(text(
                f"UPDATE {table} SET provider = 'MANUAL' WHERE provider::text = 'SOPHTRON'"
            ))
            if r.rowcount:
                print(f"  {table}: {r.rowcount} SOPHTRON → MANUAL")

        # Any lingering GOCARDLESS rows → TRUELAYER (matches Step 3 intent).
        for table in ("accounts", "integration_configs"):
            r = await conn.execute(text(
                f"UPDATE {table} SET provider = 'TRUELAYER' WHERE provider::text = 'GOCARDLESS'"
            ))
            if r.rowcount:
                print(f"  {table}: {r.rowcount} GOCARDLESS → TRUELAYER")

        # Drop key pairs for the removed providers (credentials are now useless).
        r = await conn.execute(text(
            "DELETE FROM provider_key_pairs WHERE provider::text IN ('GOCARDLESS', 'SOPHTRON')"
        ))
        if r.rowcount:
            print(f"  provider_key_pairs: deleted {r.rowcount} GoCardless/Sophtron pair(s)")
    await engine_cleanup.dispose()

    # Step 6: transactions external id is unique PER ACCOUNT, not globally.
    # One Trading212 API key per equity means two accounts can legitimately
    # surface the same external id; a global unique index made the second
    # account silently store nothing. Swap the single-column unique for a
    # composite (account_id, external_transaction_id) unique constraint.
    engine_txn = create_async_engine(DATABASE_URL, echo=False, isolation_level="AUTOCOMMIT")
    async with engine_txn.connect() as conn:
        print("\nStep 6: Scoping transaction uniqueness to (account_id, external id)...")

        # Drop whatever single-column unique constraint/index Postgres created
        # for the old `unique=True` (name is autogenerated, so discover it).
        rows = await conn.execute(text("""
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'transactions'::regclass AND contype = 'u'
              AND pg_get_constraintdef(oid) LIKE '%(external_transaction_id)%'
        """))
        for (conname,) in rows.fetchall():
            await conn.execute(text(f'ALTER TABLE transactions DROP CONSTRAINT "{conname}"'))
            print(f"  dropped old unique constraint: {conname}")

        # Also drop any bare unique INDEX on the single column (older schemas).
        idx = await conn.execute(text("""
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'transactions' AND indexdef LIKE '%UNIQUE%'
              AND indexdef LIKE '%(external_transaction_id)%'
        """))
        for (indexname,) in idx.fetchall():
            await conn.execute(text(f'DROP INDEX IF EXISTS "{indexname}"'))
            print(f"  dropped old unique index: {indexname}")

        # Add the composite unique constraint if it isn't there yet.
        exists = await conn.execute(text("""
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'transactions'::regclass
              AND conname = 'uq_transactions_account_external_id'
        """))
        if exists.first():
            print("  composite unique constraint already present")
        else:
            await conn.execute(text("""
                ALTER TABLE transactions
                ADD CONSTRAINT uq_transactions_account_external_id
                UNIQUE (account_id, external_transaction_id)
            """))
            print("  added composite unique constraint")
    await engine_txn.dispose()

    # Step 7: category changes (add CAR + INCOME, retire KITTENS) and the
    # include_in_accounting flag on transactions.
    engine_cat = create_async_engine(DATABASE_URL, echo=False, isolation_level="AUTOCOMMIT")
    async with engine_cat.connect() as conn:
        print("\nStep 7: Category enum + include_in_accounting column...")

        # Add new enum values (SQLAlchemy stores NAMES).
        existing = [r[0] for r in (await conn.execute(text(
            "SELECT unnest(enum_range(NULL::category))::text"
        ))).fetchall()]
        for name in ("CAR", "INCOME"):
            if name not in existing:
                await conn.execute(text(f"ALTER TYPE category ADD VALUE '{name}'"))
                print(f"  category enum: added {name}")
            else:
                print(f"  category enum: {name} already present")

        # include_in_accounting flag (idempotent).
        await conn.execute(text("""
            ALTER TABLE transactions
            ADD COLUMN IF NOT EXISTS include_in_accounting BOOLEAN NOT NULL DEFAULT TRUE
        """))
        print("  transactions.include_in_accounting column: OK")
    await engine_cat.dispose()

    # Reassign any KITTENS rows to OTHER (separate connection: can't use a new
    # enum value in the same tx that added it; KITTENS removal needs its own
    # DML pass). Postgres keeps the KITTENS enum label — harmless once unused.
    engine_kit = create_async_engine(DATABASE_URL, echo=False)
    async with engine_kit.begin() as conn:
        for col in ("category", "category_override"):
            r = await conn.execute(text(
                f"UPDATE transactions SET {col} = 'OTHER' WHERE {col}::text = 'KITTENS'"
            ))
            if r.rowcount:
                print(f"  transactions.{col}: {r.rowcount} KITTENS → OTHER")
    await engine_kit.dispose()

    print("\nMigration complete.")


if __name__ == "__main__":
    asyncio.run(run())
