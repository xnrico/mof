from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import plaid
from plaid.api import plaid_api
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from .base import BaseIntegration, TransactionData, AccountData


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
            # Map environment string to Plaid environment
            env_map = {
                "sandbox": plaid.Environment.Sandbox,
                "development": plaid.Environment.Development,
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
                accounts.append(AccountData(
                    external_id=account['account_id'],
                    name=account['name'],
                    account_type=account['type'],
                    currency=account.get('balances', {}).get('iso_currency_code', 'USD'),
                    balance=account.get('balances', {}).get('current'),
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

            for txn in response['transactions']:
                # Plaid amounts are positive for outflows, negative for inflows
                # We'll keep this convention
                transactions.append(TransactionData(
                    external_id=txn['transaction_id'],
                    description=txn['name'],
                    amount=txn['amount'],
                    currency=txn.get('iso_currency_code', 'USD'),
                    date=datetime.strptime(txn['date'], '%Y-%m-%d'),
                    merchant_name=txn.get('merchant_name'),
                    category=txn.get('category', [None])[0] if txn.get('category') else None,
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
