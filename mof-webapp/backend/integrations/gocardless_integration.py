from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import httpx
from .base import BaseIntegration, TransactionData, AccountData


class GoCardlessIntegration(BaseIntegration):
    """GoCardless API integration for UK/EU bank accounts"""

    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.access_token = credentials.get("access_token")
        self.env = credentials.get("env", "sandbox")
        self.requisition_id = credentials.get("requisition_id")

        # GoCardless Open Banking API endpoints
        self.base_url = (
            "https://bankaccountdata.gocardless.com/api/v2/"
            if self.env == "live"
            else "https://ob.nordigen.com/api/v2/"
        )

    async def initialize(self) -> bool:
        """Initialize GoCardless client"""
        try:
            # Verify access token is valid
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}requisitions/",
                    headers={"Authorization": f"Bearer {self.access_token}"}
                )
                return response.status_code == 200
        except Exception as e:
            print(f"Failed to initialize GoCardless: {e}")
            return False

    async def get_accounts(self) -> List[AccountData]:
        """Fetch all accounts from GoCardless"""
        if not self.requisition_id:
            return []

        try:
            async with httpx.AsyncClient() as client:
                # Get requisition details to find account IDs
                response = await client.get(
                    f"{self.base_url}requisitions/{self.requisition_id}/",
                    headers={"Authorization": f"Bearer {self.access_token}"}
                )

                if response.status_code != 200:
                    return []

                data = response.json()
                account_ids = data.get("accounts", [])

                accounts = []
                for account_id in account_ids:
                    # Get account details
                    acc_response = await client.get(
                        f"{self.base_url}accounts/{account_id}/details/",
                        headers={"Authorization": f"Bearer {self.access_token}"}
                    )

                    if acc_response.status_code == 200:
                        acc_data = acc_response.json()
                        account_info = acc_data.get("account", {})

                        # Get balance
                        bal_response = await client.get(
                            f"{self.base_url}accounts/{account_id}/balances/",
                            headers={"Authorization": f"Bearer {self.access_token}"}
                        )

                        balance = None
                        currency = "GBP"
                        if bal_response.status_code == 200:
                            bal_data = bal_response.json()
                            balances = bal_data.get("balances", [])
                            if balances:
                                balance = float(balances[0].get("balanceAmount", {}).get("amount", 0))
                                currency = balances[0].get("balanceAmount", {}).get("currency", "GBP")

                        accounts.append(AccountData(
                            external_id=account_id,
                            name=account_info.get("name", f"Account {account_id[:8]}"),
                            account_type=account_info.get("cashAccountType", "Other"),
                            currency=currency,
                            balance=balance,
                            institution_name=data.get("institution_id", "Unknown")
                        ))

                return accounts
        except Exception as e:
            print(f"Failed to fetch GoCardless accounts: {e}")
            return []

    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[TransactionData]:
        """Fetch transactions from GoCardless"""
        if not start_date:
            start_date = datetime.now() - timedelta(days=90)
        if not end_date:
            end_date = datetime.now()

        try:
            async with httpx.AsyncClient() as client:
                # GoCardless uses date_from and date_to parameters
                params = {
                    "date_from": start_date.strftime("%Y-%m-%d"),
                    "date_to": end_date.strftime("%Y-%m-%d")
                }

                response = await client.get(
                    f"{self.base_url}accounts/{account_id}/transactions/",
                    headers={"Authorization": f"Bearer {self.access_token}"},
                    params=params
                )

                if response.status_code != 200:
                    return []

                data = response.json()
                transactions = []

                for txn_type in ["booked", "pending"]:
                    for txn in data.get("transactions", {}).get(txn_type, []):
                        amount_info = txn.get("transactionAmount", {})
                        amount = float(amount_info.get("amount", 0))

                        # GoCardless: negative = debit, positive = credit
                        transactions.append(TransactionData(
                            external_id=txn.get("transactionId", txn.get("internalTransactionId")),
                            description=txn.get("remittanceInformationUnstructured", "Unknown"),
                            amount=abs(amount),  # Store absolute value
                            currency=amount_info.get("currency", "GBP"),
                            date=datetime.fromisoformat(txn.get("bookingDate", txn.get("valueDate"))),
                            merchant_name=txn.get("creditorName") or txn.get("debtorName"),
                            category=None,  # GoCardless doesn't provide categories
                            pending=txn_type == "pending"
                        ))

                return transactions
        except Exception as e:
            print(f"Failed to fetch GoCardless transactions: {e}")
            return []

    async def get_balance(self, account_id: str) -> Optional[float]:
        """Get balance for a specific account"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}accounts/{account_id}/balances/",
                    headers={"Authorization": f"Bearer {self.access_token}"}
                )

                if response.status_code == 200:
                    data = response.json()
                    balances = data.get("balances", [])
                    if balances:
                        return float(balances[0].get("balanceAmount", {}).get("amount", 0))
        except Exception as e:
            print(f"Failed to fetch GoCardless balance: {e}")

        return None
