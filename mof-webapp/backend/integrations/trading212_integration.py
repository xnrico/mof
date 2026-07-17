from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import httpx
from .base import BaseIntegration, TransactionData, AccountData


class Trading212Integration(BaseIntegration):
    """Trading 212 API integration for UK brokerage accounts"""

    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.api_key = credentials.get("api_key")
        self.env = credentials.get("env", "demo")

        # Trading 212 API endpoints
        self.base_url = (
            "https://live.trading212.com/api/v0"
            if self.env == "live"
            else "https://demo.trading212.com/api/v0"
        )

    async def initialize(self) -> bool:
        """Initialize Trading 212 client"""
        if not self.api_key:
            print("Trading 212: no API key configured")
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/equity/account/info",
                    headers={"Authorization": self.api_key}
                )
                if response.status_code != 200:
                    print(
                        f"Trading 212 initialize failed: HTTP {response.status_code} "
                        f"env={self.env} body={response.text[:200]}"
                    )
                    return False
                return True
        except Exception as e:
            print(f"Trading 212 initialize exception: {e}")
            return False

    async def get_accounts(self) -> List[AccountData]:
        """Fetch account from Trading 212"""
        try:
            async with httpx.AsyncClient() as client:
                # Get account info
                response = await client.get(
                    f"{self.base_url}/equity/account/info",
                    headers={"Authorization": self.api_key}
                )

                if response.status_code != 200:
                    return []

                data = response.json()

                # Get cash info
                cash_response = await client.get(
                    f"{self.base_url}/equity/account/cash",
                    headers={"Authorization": self.api_key}
                )

                balance = 0.0
                currency = "GBP"
                if cash_response.status_code == 200:
                    cash_data = cash_response.json()
                    balance = float(cash_data.get("total", 0))
                    currency = cash_data.get("currency", "GBP")

                accounts = [AccountData(
                    external_id=data.get("id", "T212"),
                    name="Trading 212 Account",
                    account_type="Brokerage",
                    currency=currency,
                    balance=balance,
                    institution_name="Trading 212"
                )]

                return accounts
        except Exception as e:
            print(f"Failed to fetch Trading 212 accounts: {e}")
            return []

    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[TransactionData]:
        """Fetch transactions from Trading 212"""
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()

        transactions = []

        try:
            async with httpx.AsyncClient() as client:
                # Get order history
                orders_response = await client.get(
                    f"{self.base_url}/equity/history/orders",
                    headers={"Authorization": self.api_key}
                )

                if orders_response.status_code == 200:
                    orders = orders_response.json()

                    for order in orders:
                        # Parse datetime
                        created_at = datetime.fromisoformat(
                            order.get("dateCreated", "").replace("Z", "+00:00")
                        )

                        if start_date <= created_at <= end_date:
                            filled_quantity = float(order.get("filledQuantity", 0))
                            filled_value = float(order.get("filledValue", 0))

                            if filled_quantity > 0:
                                description = (
                                    f"{order.get('type', 'ORDER')} "
                                    f"{filled_quantity} {order.get('ticker', 'STOCK')}"
                                )

                                transactions.append(TransactionData(
                                    external_id=str(order.get("id")),
                                    description=description,
                                    amount=abs(filled_value),
                                    currency="GBP",  # Trading 212 UK uses GBP
                                    date=created_at,
                                    merchant_name="Trading 212",
                                    category="Investment",
                                    pending=False
                                ))

                # Get dividend history
                dividends_response = await client.get(
                    f"{self.base_url}/history/dividends",
                    headers={"Authorization": self.api_key},
                    params={
                        "limit": 50
                    }
                )

                if dividends_response.status_code == 200:
                    dividends = dividends_response.json()

                    for dividend in dividends.get("items", []):
                        paid_on = datetime.fromisoformat(
                            dividend.get("paidOn", "").replace("Z", "+00:00")
                        )

                        if start_date <= paid_on <= end_date:
                            transactions.append(TransactionData(
                                external_id=f"DIV-{dividend.get('reference', '')}",
                                description=f"Dividend from {dividend.get('ticker', 'STOCK')}",
                                amount=float(dividend.get("amount", 0)),
                                currency=dividend.get("amountInEuro", {}).get("currency", "GBP"),
                                date=paid_on,
                                merchant_name="Trading 212",
                                category="Dividend",
                                pending=False
                            ))

            return transactions
        except Exception as e:
            print(f"Failed to fetch Trading 212 transactions: {e}")
            return []

    async def get_balance(self, account_id: str) -> Optional[float]:
        """Get balance for the account"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/equity/account/cash",
                    headers={"Authorization": self.api_key}
                )

                if response.status_code == 200:
                    data = response.json()
                    return float(data.get("total", 0))
        except Exception as e:
            print(f"Failed to fetch Trading 212 balance: {e}")

        return None
