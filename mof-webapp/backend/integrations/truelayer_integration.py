from typing import List, Dict, Any, Optional
from datetime import datetime, timezone, timedelta
import json
from .base import BaseIntegration, TransactionData, AccountData


class TrueLayerIntegration(BaseIntegration):
    """TrueLayer Data API integration for UK bank accounts.

    Credentials expected in the credentials dict:
      access_token   — TrueLayer access JWT
      refresh_token  — for renewal
      tl_account_id  — specific TrueLayer account_id to sync
      token_expiry   — ISO datetime string
      _client        — TrueLayerClient instance injected by SyncService
    """

    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.access_token: Optional[str] = credentials.get("access_token")
        self.refresh_token: Optional[str] = credentials.get("refresh_token")
        self.tl_account_id: Optional[str] = credentials.get("tl_account_id")
        self.token_expiry: Optional[str] = credentials.get("token_expiry")
        self.is_card: bool = bool(credentials.get("is_card", False))
        self._tl_client = credentials.get("_client")
        # Will be set to a fresh token if refresh occurs
        self._effective_token: Optional[str] = self.access_token

    async def initialize(self) -> bool:
        if not self.tl_account_id:
            print("TrueLayer: tl_account_id not configured — link the account first")
            return False
        if not self._tl_client:
            print("TrueLayer: client not injected")
            return False
        if not self.access_token:
            print("TrueLayer: no access token — re-link the account")
            return False

        # Check if token is expired and refresh if needed
        expired = False
        if self.token_expiry:
            try:
                expiry = datetime.fromisoformat(self.token_expiry)
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
                expired = datetime.now(timezone.utc) >= expiry - timedelta(minutes=5)
            except Exception:
                # If expiry parsing fails, proactively refresh to be safe.
                expired = True

        if expired:
            return await self._refresh()

        return True

    async def _refresh(self) -> bool:
        """Refresh the access token using the stored refresh token."""
        if not self.refresh_token:
            print("TrueLayer: no refresh token available")
            return False
        tokens = await self._tl_client.refresh_user_token(self.refresh_token)
        if not tokens or not tokens.get("access_token"):
            print("TrueLayer: token refresh failed — user needs to re-link")
            return False
        self._effective_token = tokens["access_token"]
        # Expose the refreshed credentials so SyncService can persist them.
        # TrueLayer may or may not rotate the refresh token; keep the old one
        # if a new one isn't returned.
        self.credentials["_new_access_token"] = tokens["access_token"]
        self.credentials["_new_refresh_token"] = tokens.get("refresh_token") or self.refresh_token
        self.credentials["_new_expires_in"] = tokens.get("expires_in", 3600)
        return True

    async def get_accounts(self) -> List[AccountData]:
        if not self._tl_client or not self._effective_token:
            return []
        accounts = await self._tl_client.get_accounts(self._effective_token)
        result = []
        for a in accounts:
            bal = await self._tl_client.get_balance(self._effective_token, a["account_id"])
            result.append(AccountData(
                external_id=a["account_id"],
                name=a.get("display_name", a["account_id"]),
                account_type=a.get("account_type", "Checking"),
                currency=a.get("currency", "GBP"),
                balance=bal.get("current") if bal else None,
                institution_name=a.get("provider", {}).get("display_name", ""),
            ))
        return result

    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[TransactionData]:
        if not self._tl_client or not self._effective_token:
            return []
        if not start_date:
            start_date = datetime.now() - timedelta(days=90)
        if not end_date:
            end_date = datetime.now()

        fetch = (
            self._tl_client.get_card_transactions
            if self.is_card
            else self._tl_client.get_transactions
        )
        raw = await fetch(
            self._effective_token,
            account_id,
            start_date.strftime("%Y-%m-%dT%H:%M:%S"),
            end_date.strftime("%Y-%m-%dT%H:%M:%S"),
        )

        transactions = []
        for txn in raw:
            try:
                amount = float(txn.get("amount", 0))
                # TrueLayer reports card purchases as positive amounts, whereas
                # bank-account spending is negative. Negate card amounts so a
                # purchase is an expense (negative) consistent with accounts.
                if self.is_card:
                    amount = -amount
                ts = txn.get("timestamp", "")
                txn_date = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                transactions.append(TransactionData(
                    external_id=txn.get("transaction_id", f"{account_id}-{ts}"),
                    description=txn.get("description", "Transaction"),
                    amount=amount,
                    currency=txn.get("currency", "GBP"),
                    date=txn_date,
                    merchant_name=txn.get("merchant_name"),
                    category=txn.get("transaction_category"),
                    pending=txn.get("transaction_type") == "PENDING",
                ))
            except Exception:
                continue
        return transactions

    async def get_balance(self, account_id: str) -> Optional[float]:
        if not self._tl_client or not self._effective_token:
            return None
        if self.is_card:
            bal = await self._tl_client.get_card_balance(self._effective_token, account_id)
        else:
            bal = await self._tl_client.get_balance(self._effective_token, account_id)
        if not bal or bal.get("current") is None:
            return None
        current = float(bal["current"])
        # Credit-card `current` is the amount owed; show it as a negative liability.
        return -current if self.is_card else current
