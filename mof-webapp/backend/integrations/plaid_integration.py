from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
import plaid
from plaid.api import plaid_api
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from .base import BaseIntegration, TransactionData, AccountData


def _to_datetime(value: Any) -> datetime:
    """Plaid returns transaction dates as date objects; normalise to datetime."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    return datetime.strptime(str(value), "%Y-%m-%d")


class PlaidIntegration(BaseIntegration):
    """Plaid API integration for US bank accounts"""

    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.client_id = credentials.get("client_id")
        self.secret = credentials.get("secret")
        self.env = credentials.get("env", "sandbox")
        self.access_token = credentials.get("access_token")

    async def initialize(self) -> bool:
        """Initialize Plaid client"""
        try:
            # Map environment string to Plaid environment. plaid-python 28
            # dropped the Development host — only Sandbox and Production remain.
            env_map = {
                "sandbox": plaid.Environment.Sandbox,
                "production": plaid.Environment.Production,
            }

            configuration = plaid.Configuration(
                host=env_map.get(self.env, plaid.Environment.Sandbox),
                api_key={
                    'clientId': self.client_id,
                    'secret': self.secret,
                }
            )

            api_client = plaid.ApiClient(configuration)
            self._client = plaid_api.PlaidApi(api_client)
            return True
        except Exception as e:
            print(f"Failed to initialize Plaid: {e}")
            return False

    async def get_accounts(self) -> List[AccountData]:
        """Fetch all accounts from Plaid"""
        if not self._client or not self.access_token:
            return []

        try:
            request = AccountsGetRequest(access_token=self.access_token)
            response = self._client.accounts_get(request)

            accounts = []
            for account in response['accounts']:
                acct_type = str(account.get('type', ''))
                balances = account.get('balances', {})
                current = balances.get('current')
                # Credit cards / loans: Plaid reports the amount owed as a
                # positive number. This app shows liabilities as negative.
                if current is not None and acct_type in ('credit', 'loan'):
                    current = -current
                accounts.append(AccountData(
                    external_id=account['account_id'],
                    name=account['name'],
                    account_type=acct_type,
                    currency=balances.get('iso_currency_code', 'USD'),
                    balance=current,
                    institution_name=account.get('official_name', account['name'])
                ))

            return accounts
        except Exception as e:
            print(f"Failed to fetch Plaid accounts: {e}")
            return []

    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[TransactionData]:
        """Fetch transactions from Plaid"""
        if not self._client or not self.access_token:
            return []

        # Default to last 30 days if not specified
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()

        try:
            request = TransactionsGetRequest(
                access_token=self.access_token,
                start_date=start_date.date(),
                end_date=end_date.date(),
                options={
                    "account_ids": [account_id],
                    "count": 500,
                    "offset": 0,
                }
            )

            response = self._client.transactions_get(request)
            transactions = []

            # Plaid reports positive = money OUT of the account for EVERY
            # account type (depository, credit, loan). This app stores spending
            # as negative and income as positive, so we negate Plaid's amount
            # across the board: a purchase (Plaid +) becomes a negative expense,
            # a deposit/salary (Plaid −) becomes positive income. This applies
            # to depository accounts too — leaving them "raw" flips their signs.
            for txn in response['transactions']:
                raw = txn.get('amount', 0) or 0
                amount = -raw
                category = txn.get('category', [None])[0] if txn.get('category') else None
                transactions.append(TransactionData(
                    external_id=txn['transaction_id'],
                    description=txn.get('name', ''),
                    amount=amount,
                    currency=txn.get('iso_currency_code') or 'USD',
                    date=_to_datetime(txn['date']),
                    merchant_name=txn.get('merchant_name'),
                    category=category,
                    pending=txn.get('pending', False)
                ))

            return transactions
        except Exception as e:
            print(f"Failed to fetch Plaid transactions: {e}")
            return []

    async def get_balance(self, account_id: str) -> Optional[float]:
        """Get balance for a specific account"""
        accounts = await self.get_accounts()
        for account in accounts:
            if account.external_id == account_id:
                return account.balance
        return None
