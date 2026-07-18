#!/usr/bin/env python3
"""
Diagnose why TrueLayer accounts aren't syncing transactions.

Run inside the backend container:
  docker compose exec backend python diagnose_tl.py

For every account it prints link status, then for TrueLayer accounts it
initializes the integration (refreshing the token if needed) and reports
what the provider actually returns for balance + transactions.
"""
import asyncio
import json
from datetime import datetime, timedelta


async def run():
    from models.database import async_session_maker
    from models.models import Account, IntegrationConfig, IntegrationProvider
    from services.sync_service import SyncService
    from integrations import IntegrationFactory
    from sqlalchemy import select

    async with async_session_maker() as db:
        accounts = (await db.execute(select(Account))).scalars().all()
        print(f"Found {len(accounts)} account(s)\n" + "=" * 60)

        for a in accounts:
            print(f"\n[{a.id}] {a.name}  ({a.provider.value}, {a.currency.value})")
            print(f"    is_shared={a.is_shared}  external_account_id={a.external_account_id!r}")
            print(f"    current_balance={a.current_balance}  last_synced_at={a.last_synced_at}")

            cfg = (await db.execute(
                select(IntegrationConfig).where(IntegrationConfig.account_id == a.id)
            )).scalar_one_or_none()

            if a.provider == IntegrationProvider.MANUAL:
                print("    (manual account — no sync)")
                continue
            if not cfg:
                print("    ✗ NO integration_config — never connected. This account cannot sync.")
                continue

            cd = json.loads(cfg.config_data or "{}")
            print(f"    config: is_active={cfg.is_active} is_card={cd.get('is_card')} "
                  f"last_status={cfg.last_sync_status} last_error={cfg.last_error!r}")
            print(f"    has_access_token={bool(cfg.access_token)} "
                  f"has_refresh_token={bool(cfg.refresh_token)} item_id={cfg.item_id!r}")

            # Probe any provider live (TrueLayer, Trading212, ...)
            svc = SyncService(db)
            creds = await svc._build_credentials(a.provider, cfg)
            integ = IntegrationFactory.create(a.provider.value, creds)
            ok = await integ.initialize()
            print(f"    initialize() -> {ok}")
            if not ok:
                print("    ✗ init failed (token expired & refresh failed?) — re-link needed.")
                await integ.close()
                continue

            bal = await integ.get_balance(a.external_account_id)
            print(f"    get_balance() -> {bal}")

            start = datetime.now() - timedelta(days=730)
            txns = await integ.get_transactions(a.external_account_id, start_date=start,
                                                end_date=datetime.now())
            print(f"    get_transactions(730d) -> {len(txns)} txn(s)")
            err = getattr(integ, "last_txn_error", None)
            if err:
                print(f"    ✗ transaction fetch error: {err}")
            if txns:
                t = txns[0]
                print(f"      e.g. {t.date} {t.description!r} {t.amount}")
            await integ.close()

    print("\n" + "=" * 60 + "\nDone.")


if __name__ == "__main__":
    asyncio.run(run())
