from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from models.models import (
    Account,
    Transaction,
    IntegrationConfig,
    IntegrationProvider,
    Category,
    Currency,
)
from integrations import IntegrationFactory
from config import settings
from services import provider_settings
import json


class SyncService:
    """Service for syncing transactions from external APIs"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def sync_account(self, account_id: int, full: bool = False) -> dict:
        """Sync transactions for a specific account.

        When ``full`` is True, ignore last_sync_at and re-pull the whole
        backfill window — used to backfill history or correct existing
        transactions (e.g. after a sign-convention fix).
        """
        result = {
            "account_id": account_id,
            "success": False,
            "transactions_added": 0,
            "transactions_updated": 0,
            "error": None
        }

        try:
            # Get account and integration config
            account = await self.db.get(Account, account_id)
            if not account:
                result["error"] = "Account not found"
                return result

            if account.provider == IntegrationProvider.MANUAL:
                result["error"] = "Manual accounts don't sync"
                return result

            # Get integration config
            stmt = select(IntegrationConfig).where(
                IntegrationConfig.account_id == account_id
            )
            integration_result = await self.db.execute(stmt)
            integration_config = integration_result.scalar_one_or_none()

            if not integration_config or not integration_config.is_active:
                result["error"] = "Integration not configured or inactive"
                return result

            # Create integration instance
            credentials = await self._build_credentials(account.provider, integration_config)
            integration = IntegrationFactory.create(account.provider.value, credentials)

            # Initialize integration
            if not await integration.initialize():
                # Check if it was a rate limit (the integration logs the reason)
                error_msg = "Failed to initialize integration — if Trading212, wait 30s before retrying"
                result["error"] = error_msg
                integration_config.last_sync_status = "failed"
                integration_config.last_error = error_msg
                await self.db.commit()
                return result

            # Get last sync date. On the first sync (or a full re-sync) there's
            # no usable last_sync_at, so backfill SYNC_INITIAL_DAYS of history
            # (providers cap this). A full re-sync re-pulls the whole window so
            # existing transactions get updated (e.g. corrected signs).
            backfill_start = datetime.now() - timedelta(days=settings.SYNC_INITIAL_DAYS)
            if full or not integration_config.last_sync_at:
                last_sync = backfill_start
            else:
                last_sync = integration_config.last_sync_at

            # Fetch transactions
            transactions = await integration.get_transactions(
                account.external_account_id,
                start_date=last_sync,
                end_date=datetime.now()
            )

            # Process transactions
            for txn_data in transactions:
                # Check if transaction already exists
                stmt = select(Transaction).where(
                    Transaction.external_transaction_id == txn_data.external_id
                )
                existing_result = await self.db.execute(stmt)
                existing_txn = existing_result.scalar_one_or_none()

                if existing_txn:
                    # Update existing transaction
                    existing_txn.description = txn_data.description
                    existing_txn.amount = txn_data.amount
                    existing_txn.merchant_name = txn_data.merchant_name
                    result["transactions_updated"] += 1
                else:
                    # Create new transaction
                    new_txn = Transaction(
                        account_id=account_id,
                        external_transaction_id=txn_data.external_id,
                        description=txn_data.description,
                        amount=txn_data.amount,
                        currency=self._map_currency(txn_data.currency, account.currency),
                        category=self._map_category(txn_data.category),
                        transaction_date=self._naive_utc(txn_data.date),
                        merchant_name=txn_data.merchant_name,
                    )
                    self.db.add(new_txn)
                    result["transactions_added"] += 1

            # Update account balance
            balance = await integration.get_balance(account.external_account_id)
            if balance is not None:
                account.current_balance = balance

            # Persist any refreshed tokens (e.g. TrueLayer) back to the config
            # so the next sync doesn't start with an expired token.
            self._persist_refreshed_tokens(integration, integration_config)

            # If transactions couldn't be fetched (e.g. bank consent 403) but
            # balance did update, report a partial sync with the reason rather
            # than a misleading "success".
            txn_error = getattr(integration, "last_txn_error", None)

            # Update sync status
            account.last_synced_at = datetime.now()
            integration_config.last_sync_at = datetime.now()
            if txn_error:
                integration_config.last_sync_status = "partial"
                integration_config.last_error = f"Transactions unavailable: {txn_error}"
                result["error"] = integration_config.last_error
            else:
                integration_config.last_sync_status = "success"
                integration_config.last_error = None

            await self.db.commit()
            await integration.close()

            # Balance updated; only call it a full success when txns came too.
            result["success"] = txn_error is None

        except Exception as e:
            result["error"] = str(e)

            # The failed operation may have left the session in a
            # PendingRollbackError state; roll back before writing the error
            # status, otherwise the commit below (and every subsequent account
            # in sync_all_accounts, which shares this session) would also fail.
            await self.db.rollback()

            # Update error status
            if integration_config:
                try:
                    integration_config.last_sync_status = "failed"
                    integration_config.last_error = str(e)
                    await self.db.commit()
                except Exception:
                    await self.db.rollback()

        return result

    async def sync_all_accounts(self, full: bool = False) -> List[dict]:
        """Sync all active accounts. See sync_account for ``full``."""
        # Get all active accounts with integrations
        stmt = select(Account).where(
            Account.is_active == True,
            Account.provider != IntegrationProvider.MANUAL
        )
        result = await self.db.execute(stmt)
        accounts = result.scalars().all()

        results = []
        for account in accounts:
            sync_result = await self.sync_account(account.id, full=full)
            results.append(sync_result)

        return results

    def _persist_refreshed_tokens(self, integration, config: IntegrationConfig) -> None:
        """Write back any tokens an integration refreshed during this sync.

        Integrations expose refreshed credentials via the shared credentials
        dict (keys prefixed with `_new_`). Currently only TrueLayer rotates
        tokens mid-sync.
        """
        creds = getattr(integration, "credentials", None) or {}
        new_access = creds.get("_new_access_token")
        if not new_access:
            return

        config.access_token = new_access
        new_refresh = creds.get("_new_refresh_token")
        if new_refresh:
            config.refresh_token = new_refresh

        expires_in = creds.get("_new_expires_in")
        if expires_in:
            from datetime import timezone
            expiry = (datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))).isoformat()
            existing = json.loads(config.config_data or "{}") if config.config_data else {}
            existing["token_expiry"] = expiry
            config.config_data = json.dumps(existing)

    async def _build_credentials(self, provider: IntegrationProvider, config: IntegrationConfig) -> dict:
        """Build credentials dictionary for integration.

        If the IntegrationConfig has a key_pair_id, load credentials from that
        ProviderKeyPair. Otherwise fall back to app_settings / .env.
        """
        credentials = {
            "access_token": config.access_token,
            "refresh_token": config.refresh_token,
        }

        # Load key pair credentials if configured
        kp_creds: dict = {}
        if config.key_pair_id:
            from models.models import ProviderKeyPair
            kp = await self.db.get(ProviderKeyPair, config.key_pair_id)
            if kp and kp.credentials:
                kp_creds = json.loads(kp.credentials)

        async def _get(key: str, fallback=None):
            """Key-pair first, then app_settings fallback."""
            if key in kp_creds and kp_creds[key]:
                return kp_creds[key]
            return await provider_settings.get_effective(self.db, key, fallback)

        if provider == IntegrationProvider.PLAID:
            # Key pairs store short keys (client_id/secret/env); fall back to
            # global app_settings / .env when no pair is selected.
            credentials["client_id"] = kp_creds.get("client_id") or await provider_settings.get_effective(self.db, "PLAID_CLIENT_ID", settings.PLAID_CLIENT_ID)
            credentials["secret"]    = kp_creds.get("secret")    or await provider_settings.get_effective(self.db, "PLAID_SECRET",    settings.PLAID_SECRET)
            credentials["env"]       = kp_creds.get("env")       or await provider_settings.get_effective(self.db, "PLAID_ENV",       settings.PLAID_ENV)
            credentials["item_id"]   = config.item_id

        elif provider == IntegrationProvider.GOCARDLESS:
            from services.gocardless_client import GoCardlessClient
            credentials["gc_account_id"] = config.access_token
            credentials["_client"] = GoCardlessClient(self.db)

        elif provider == IntegrationProvider.IBKR:
            credentials["host"]       = await _get("IBKR_HOST",       settings.IBKR_HOST)
            credentials["port"]       = await _get("IBKR_PORT",       str(settings.IBKR_PORT))
            credentials["account_id"] = await _get("IBKR_ACCOUNT_ID", settings.IBKR_ACCOUNT_ID)
            if config.config_data:
                extra = json.loads(config.config_data)
                credentials.update(extra)

        elif provider == IntegrationProvider.TRUELAYER:
            from services.truelayer_client import TrueLayerClient
            import json as _json
            config_data = _json.loads(config.config_data or "{}") if config.config_data else {}
            credentials["tl_account_id"] = config.item_id
            credentials["token_expiry"]  = config_data.get("token_expiry")
            credentials["is_card"]       = config_data.get("is_card", False)
            # TrueLayerClient reads TRUELAYER_* from DB; key-pair overrides
            # are injected by storing them in app_settings via the key-pair flow.
            credentials["_client"] = TrueLayerClient(self.db)
            credentials["_kp_creds"] = kp_creds  # pass through for client to use

        elif provider == IntegrationProvider.TRADING212:
            api_key    = kp_creds.get("api_key") or await provider_settings.get_effective(self.db, "TRADING212_API_KEY", None)
            api_secret = kp_creds.get("api_secret") or await provider_settings.get_effective(self.db, "TRADING212_API_SECRET", None)
            if not api_key and config.access_token:
                api_key = config.access_token
            credentials["api_key"]    = api_key
            credentials["api_secret"] = api_secret
            credentials["env"]        = kp_creds.get("env") or await provider_settings.get_effective(self.db, "TRADING212_ENV", settings.TRADING212_ENV)

        return credentials

    @staticmethod
    def _naive_utc(dt: Optional[datetime]) -> Optional[datetime]:
        """Coerce a datetime to naive UTC.

        The `transactions.transaction_date` column is TIMESTAMP WITHOUT TIME
        ZONE, so tz-aware values (e.g. TrueLayer's ISO timestamps) must be
        converted to UTC and stripped of tzinfo before insert — otherwise
        asyncpg raises "can't subtract offset-naive and offset-aware datetimes".
        """
        if dt is None:
            return None
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt

    def _map_currency(self, currency_str: Optional[str], default: Currency) -> Currency:
        """Coerce a provider currency string into the Currency enum.

        Falls back to the account's own currency when the provider returns
        something we don't model (e.g. EUR).
        """
        if not currency_str:
            return default
        try:
            return Currency(currency_str)
        except ValueError:
            return default

    def _map_category(self, external_category: Optional[str]) -> Category:
        """Map external category to internal Category enum"""
        if not external_category:
            return Category.OTHER

        # Simple mapping - can be enhanced
        category_map = {
            "food": Category.FOOD,
            "grocery": Category.GROCERY,
            "groceries": Category.GROCERY,
            "transportation": Category.TRANSPORT,
            "travel": Category.TRANSPORT,
            "rent": Category.HOUSING,
            "mortgage": Category.HOUSING,
            "entertainment": Category.ENTERTAINMENT,
            "recreation": Category.ENTERTAINMENT,
            "subscription": Category.SUBSCRIPTIONS,
            "income": Category.SALARY,
            "dividend": Category.DIVIDEND,
            "interest": Category.INTEREST,
            "investment": Category.INVESTMENT,
        }

        external_lower = external_category.lower()
        for key, value in category_map.items():
            if key in external_lower:
                return value

        return Category.OTHER
