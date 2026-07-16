from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from ib_insync import IB, util
import asyncio
from .base import BaseIntegration, TransactionData, AccountData


class IBKRIntegration(BaseIntegration):
    """Interactive Brokers API integration for US brokerage accounts"""

    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.account_id = credentials.get("account_id")
        self.host = credentials.get("host", "127.0.0.1")
        self.port = credentials.get("port", 7497)
        self.client_id = credentials.get("client_id", 1)
        self._ib = None

    async def initialize(self) -> bool:
        """Initialize IBKR client connection"""
        try:
            self._ib = IB()
            # Connect to IB Gateway or TWS
            await self._ib.connectAsync(self.host, self.port, clientId=self.client_id)
            return self._ib.isConnected()
        except Exception as e:
            print(f"Failed to initialize IBKR: {e}")
            return False

    async def get_accounts(self) -> List[AccountData]:
        """Fetch all accounts from IBKR"""
        if not self._ib or not self._ib.isConnected():
            return []

        try:
            managed_accounts = self._ib.managedAccounts()
            accounts = []

            for account in managed_accounts:
                # Request account summary
                summary = self._ib.accountSummary(account)

                # Find net liquidation value
                balance = None
                currency = "USD"
                for item in summary:
                    if item.tag == "NetLiquidation":
                        balance = float(item.value)
                        currency = item.currency
                        break

                accounts.append(AccountData(
                    external_id=account,
                    name=f"IBKR Account {account}",
                    account_type="Brokerage",
                    currency=currency,
                    balance=balance,
                    institution_name="Interactive Brokers"
                ))

            return accounts
        except Exception as e:
            print(f"Failed to fetch IBKR accounts: {e}")
            return []

    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[TransactionData]:
        """Fetch transactions from IBKR (executions and trades)"""
        if not self._ib or not self._ib.isConnected():
            return []

        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()

        try:
            # Request executions (filled orders)
            executions = self._ib.reqExecutions()

            transactions = []
            for execution in executions:
                exec_detail = execution.execution

                # Filter by date and account
                exec_time = datetime.strptime(exec_detail.time, "%Y%m%d  %H:%M:%S")
                if start_date <= exec_time <= end_date and exec_detail.acctNumber == account_id:
                    # Calculate transaction amount
                    amount = exec_detail.shares * exec_detail.price

                    description = f"{exec_detail.side} {exec_detail.shares} {execution.contract.symbol}"

                    transactions.append(TransactionData(
                        external_id=exec_detail.execId,
                        description=description,
                        amount=amount,
                        currency=execution.contract.currency,
                        date=exec_time,
                        merchant_name="Interactive Brokers",
                        category="Investment",
                        pending=False
                    ))

            # Also get dividends and other cash transactions
            # This requires FlexQuery API for historical data
            # For now, we'll just return executions

            return transactions
        except Exception as e:
            print(f"Failed to fetch IBKR transactions: {e}")
            return []

    async def get_balance(self, account_id: str) -> Optional[float]:
        """Get current balance for an account"""
        if not self._ib or not self._ib.isConnected():
            return None

        try:
            summary = self._ib.accountSummary(account_id)
            for item in summary:
                if item.tag == "NetLiquidation":
                    return float(item.value)
        except Exception as e:
            print(f"Failed to fetch IBKR balance: {e}")

        return None

    async def close(self):
        """Disconnect from IBKR"""
        if self._ib and self._ib.isConnected():
            self._ib.disconnect()
