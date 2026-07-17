from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime, timedelta
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

    async def sync_account(self, account_id: int) -> dict:
        """Sync transactions for a specific account"""
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
                result["error"] = "Failed to initialize integration"
                integration_config.last_sync_status = "failed"
                integration_config.last_error = "Initialization failed"
                await self.db.commit()
                return result

            # Get last sync date
            last_sync = integration_config.last_sync_at or datetime.now() - timedelta(days=30)

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
                        transaction_date=txn_data.date,
                        merchant_name=txn_data.merchant_name,
                    )
                    self.db.add(new_txn)
                    result["transactions_added"] += 1

            # Update account balance
            balance = await integration.get_balance(account.external_account_id)
            if balance is not None:
                account.current_balance = balance

            # Update sync status
            account.last_synced_at = datetime.now()
            integration_config.last_sync_at = datetime.now()
            integration_config.last_sync_status = "success"
            integration_config.last_error = None

            await self.db.commit()
            await integration.close()

            result["success"] = True

        except Exception as e:
            result["error"] = str(e)

            # Update error status
            if integration_config:
                integration_config.last_sync_status = "failed"
                integration_config.last_error = str(e)
                await self.db.commit()

        return result

    async def sync_all_accounts(self) -> List[dict]:
        """Sync all active accounts"""
        # Get all active accounts with integrations
        stmt = select(Account).where(
            Account.is_active == True,
            Account.provider != IntegrationProvider.MANUAL
        )
        result = await self.db.execute(stmt)
        accounts = result.scalars().all()

        results = []
        for account in accounts:
            sync_result = await self.sync_account(account.id)
            results.append(sync_result)

        return results

    async def _build_credentials(self, provider: IntegrationProvider, config: IntegrationConfig) -> dict:
        """Build credentials dictionary for integration.

        App-level provider keys come from the effective settings (DB override
        with .env fallback); per-account tokens come from the IntegrationConfig.
        """
        credentials = {
            "access_token": config.access_token,
            "refresh_token": config.refresh_token,
        }

        if provider == IntegrationProvider.PLAID:
            credentials["client_id"] = await provider_settings.get_effective(
                self.db, "PLAID_CLIENT_ID", settings.PLAID_CLIENT_ID
            )
            credentials["secret"] = await provider_settings.get_effective(
                self.db, "PLAID_SECRET", settings.PLAID_SECRET
            )
            credentials["env"] = await provider_settings.get_effective(
                self.db, "PLAID_ENV", settings.PLAID_ENV
            )
            credentials["item_id"] = config.item_id

        elif provider == IntegrationProvider.GOCARDLESS:
            credentials["env"] = await provider_settings.get_effective(
                self.db, "GOCARDLESS_ENV", settings.GOCARDLESS_ENV
            )
            credentials["requisition_id"] = config.item_id

        elif provider == IntegrationProvider.IBKR:
            credentials["host"] = await provider_settings.get_effective(
                self.db, "IBKR_HOST", settings.IBKR_HOST
            )
            credentials["port"] = await provider_settings.get_effective(
                self.db, "IBKR_PORT", str(settings.IBKR_PORT)
            )
            credentials["account_id"] = await provider_settings.get_effective(
                self.db, "IBKR_ACCOUNT_ID", settings.IBKR_ACCOUNT_ID
            )
            if config.config_data:
                extra = json.loads(config.config_data)
                credentials.update(extra)

        elif provider == IntegrationProvider.TRADING212:
            credentials["api_key"] = await provider_settings.get_effective(
                self.db, "TRADING212_API_KEY", None
            )
            credentials["api_secret"] = await provider_settings.get_effective(
                self.db, "TRADING212_API_SECRET", None
            )
            credentials["env"] = await provider_settings.get_effective(
                self.db, "TRADING212_ENV", settings.TRADING212_ENV
            )

        return credentials

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
