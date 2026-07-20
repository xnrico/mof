from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, parse_qs
import base64
import httpx
from .base import BaseIntegration, TransactionData, AccountData


def _naive_utc(dt: datetime) -> datetime:
    """Convert a tz-aware datetime to naive UTC (matches naive start/end)."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _extract_cursor(next_page_path: Optional[str]) -> Optional[str]:
    """Pull the `cursor` query param out of T212's nextPagePath URL/path."""
    if not next_page_path:
        return None
    values = parse_qs(urlsplit(next_page_path).query).get("cursor")
    return values[0] if values else None


class Trading212Integration(BaseIntegration):
    """Trading 212 API integration for UK brokerage accounts"""

    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        api_key = credentials.get("api_key") or ""
        api_secret = credentials.get("api_secret") or ""
        self.env = credentials.get("env", "live")
        # Set when a transactions fetch fails so sync reports a partial status.
        self.last_txn_error: Optional[str] = None

        # Trading 212 uses HTTP Basic auth: base64("key:secret")
        raw = f"{api_key}:{api_secret}".encode()
        self._auth_header = f"Basic {base64.b64encode(raw).decode()}"
        self._configured = bool(api_key and api_secret)

        self.base_url = (
            "https://live.trading212.com/api/v0"
            if self.env == "live"
            else "https://demo.trading212.com/api/v0"
        )

    async def initialize(self) -> bool:
        """Initialize Trading 212 client"""
        if not self._configured:
            print("Trading 212: api_key or api_secret not configured")
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{self.base_url}/equity/account/summary",
                    headers={"Authorization": self._auth_header}
                )
                if response.status_code == 429:
                    print("Trading 212 initialize failed: rate limited (429) — wait before retrying")
                    return False
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
                    headers={"Authorization": self._auth_header}
                )

                if response.status_code != 200:
                    return []

                data = response.json()

                # Get cash info
                cash_response = await client.get(
                    f"{self.base_url}/equity/account/cash",
                    headers={"Authorization": self._auth_header}
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
                    headers={"Authorization": self._auth_header}
                )

                if orders_response.status_code == 200:
                    payload = orders_response.json()
                    # T212 returns a paginated {"items": [...]} object; older
                    # accounts/endpoints may return a bare list. Handle both.
                    orders = payload.get("items", []) if isinstance(payload, dict) else payload

                    for order in orders:
                        # Parse datetime
                        created_at = _naive_utc(datetime.fromisoformat(
                            order.get("dateCreated", "").replace("Z", "+00:00")
                        ))

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
                    headers={"Authorization": self._auth_header},
                    params={"limit": 50}
                )

                if dividends_response.status_code == 200:
                    dividends = dividends_response.json()

                    for dividend in dividends.get("items", []):
                        paid_on = _naive_utc(datetime.fromisoformat(
                            dividend.get("paidOn", "").replace("Z", "+00:00")
                        ))

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

                # Cash movements: deposits, withdrawals, fees, transfers.
                await self._fetch_cash_transactions(
                    client, transactions, start_date, end_date
                )

            return transactions
        except Exception as e:
            print(f"Failed to fetch Trading 212 transactions: {e}")
            return []

    # Sign convention: money leaving the account is negative, money in positive.
    _CASH_CATEGORY = {
        "DEPOSIT": "Deposit",
        "WITHDRAW": "Withdrawal",
        "FEE": "Fee",
        "TRANSFER": "Transfer",
    }

    async def _fetch_cash_transactions(
        self,
        client: httpx.AsyncClient,
        transactions: List[TransactionData],
        start_date: datetime,
        end_date: datetime,
    ) -> None:
        """Fetch cash movements from /equity/history/transactions (paginated).

        Rate limit is 6 req/min, so we cap pages defensively and stop on 429.
        """
        params: Dict[str, Any] = {
            "limit": 50,
            "time": start_date.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        cursor: Optional[str] = None
        try:
            for _ in range(20):  # hard page cap (20 * 50 = 1000 movements)
                if cursor:
                    params["cursor"] = cursor
                resp = await client.get(
                    f"{self.base_url}/equity/history/transactions",
                    headers={"Authorization": self._auth_header},
                    params=params,
                )
                if resp.status_code == 429:
                    self.last_txn_error = (
                        "transactions rate limited (429) — will retry next sync"
                    )
                    return
                if resp.status_code != 200:
                    self.last_txn_error = (
                        f"transactions HTTP {resp.status_code}: {resp.text[:200]}"
                    )
                    return

                payload = resp.json()
                items = payload.get("items", []) if isinstance(payload, dict) else []
                if not self._append_cash_items(items, transactions, start_date, end_date):
                    break  # reached items older than the window; stop paging

                next_path = payload.get("nextPagePath") if isinstance(payload, dict) else None
                cursor = _extract_cursor(next_path)
                if not cursor:
                    break
        except Exception as e:
            self.last_txn_error = str(e)

    def _append_cash_items(
        self,
        items: List[Dict[str, Any]],
        transactions: List[TransactionData],
        start_date: datetime,
        end_date: datetime,
    ) -> bool:
        """Append in-window movements. Returns False if we hit an older-than-window
        item (results are newest-first, so that means we can stop paging)."""
        keep_paging = True
        for item in items:
            raw_dt = item.get("dateTime", "")
            if not raw_dt:
                continue
            when = _naive_utc(datetime.fromisoformat(raw_dt.replace("Z", "+00:00")))
            if when < start_date:
                keep_paging = False
                continue
            if when > end_date:
                continue
            ttype = (item.get("type") or "").upper()
            amount = float(item.get("amount", 0))
            # Normalise sign by type; API amount sign is not guaranteed.
            if ttype in ("WITHDRAW", "FEE"):
                amount = -abs(amount)
            elif ttype == "DEPOSIT":
                amount = abs(amount)
            ref = item.get("reference", "")
            transactions.append(TransactionData(
                external_id=f"CASH-{ref}",
                description=self._CASH_CATEGORY.get(ttype, ttype.title() or "Cash movement"),
                amount=amount,
                currency=item.get("currency", "GBP"),
                date=when,
                merchant_name="Trading 212",
                category=self._CASH_CATEGORY.get(ttype, "Transfer"),
                pending=False,
            ))
        return keep_paging

    async def get_balance(self, account_id: str) -> Optional[float]:
        """Get balance for the account"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/equity/account/cash",
                    headers={"Authorization": self._auth_header}                )

                if response.status_code == 200:
                    data = response.json()
                    return float(data.get("total", 0))
        except Exception as e:
            print(f"Failed to fetch Trading 212 balance: {e}")

        return None
