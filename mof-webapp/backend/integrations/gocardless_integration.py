from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from .base import BaseIntegration, TransactionData, AccountData


class GoCardlessIntegration(BaseIntegration):
    """GoCardless Bank Account Data integration.

    Credentials expected:
      gc_account_id  — the GoCardless account UUID stored in IntegrationConfig.access_token
      requisition_id — stored in IntegrationConfig.item_id
      _client        — GoCardlessClient instance injected by SyncService
    """

    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.gc_account_id = credentials.get("gc_account_id")
        self._gc_client = credentials.get("_client")  # GoCardlessClient

    async def initialize(self) -> bool:
        if not self.gc_account_id:
            print("GoCardless: gc_account_id not configured — link the account first")
            return False
        if not self._gc_client:
            print("GoCardless: client not injected")
            return False
        token = await self._gc_client.get_access_token()
        if not token:
            print("GoCardless: could not obtain access token — check Secret ID/Key in Settings")
            return False
        return True

    async def get_accounts(self) -> List[AccountData]:
        if not self._gc_client or not self.gc_account_id:
            return []
        details = await self._gc_client.get_account_details(self.gc_account_id) or {}
        balances = await self._gc_client.get_account_balances(self.gc_account_id)
        balance = None
        currency = details.get("currency", "GBP")
        if balances:
            b = balances[0].get("balanceAmount", {})
            balance = float(b.get("amount", 0))
            currency = b.get("currency", currency)
        return [AccountData(
            external_id=self.gc_account_id,
            name=details.get("name") or details.get("product") or "GoCardless Account",
            account_type=details.get("cashAccountType", "Checking"),
            currency=currency,
            balance=balance,
            institution_name=details.get("institution_id", ""),
        )]

    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[TransactionData]:
        if not self._gc_client:
            return []
        if not start_date:
            start_date = datetime.now() - timedelta(days=90)
        if not end_date:
            end_date = datetime.now()

        date_from = start_date.strftime("%Y-%m-%d")
        date_to = end_date.strftime("%Y-%m-%d")

        raw = await self._gc_client.get_transactions(account_id, date_from, date_to)
        transactions: List[TransactionData] = []

        for txn_type, pending in [("booked", False), ("pending", True)]:
            for txn in raw.get(txn_type, []):
                amt_info = txn.get("transactionAmount", {})
                try:
                    amount = float(amt_info.get("amount", 0))
                except (ValueError, TypeError):
                    continue

                raw_date = txn.get("bookingDate") or txn.get("valueDate")
                if not raw_date:
                    continue
                try:
                    txn_date = datetime.fromisoformat(raw_date)
                except ValueError:
                    continue

                description = (
                    txn.get("remittanceInformationUnstructured")
                    or txn.get("remittanceInformationStructured")
                    or txn.get("additionalInformation")
                    or "Transaction"
                )
                merchant = txn.get("creditorName") or txn.get("debtorName")

                transactions.append(TransactionData(
                    external_id=(
                        txn.get("transactionId")
                        or txn.get("internalTransactionId")
                        or f"{account_id}-{raw_date}-{amount}"
                    ),
                    description=description,
                    amount=amount,   # preserve sign: negative = debit
                    currency=amt_info.get("currency", "GBP"),
                    date=txn_date,
                    merchant_name=merchant,
                    category=None,
                    pending=pending,
                ))

        return transactions

    async def get_balance(self, account_id: str) -> Optional[float]:
        if not self._gc_client:
            return None
        balances = await self._gc_client.get_account_balances(account_id)
        if balances:
            return float(balances[0].get("balanceAmount", {}).get("amount", 0))
        return None
