"""Sophtron integration adapter (background sync).

Enrollment (bank login + MFA) happens interactively via api/sophtron.py. By the
time sync runs we already have a UserInstitutionID and per-account AccountID
stored on the IntegrationConfig, so sync only needs to:
  1. best-effort trigger a live refresh (may require MFA -> skipped if so),
  2. read Sophtron's stored accounts + transactions (no MFA).

Sign convention follows Plaid/TrueLayer: depository (checking/savings) keeps the
provider's raw sign; credit/loan is negated so a purchase reads as a negative
expense. NOTE: unverified against real HSBC data — revisit if signs look off.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta

from .base import BaseIntegration, TransactionData, AccountData


def _to_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    if value:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00").split(".")[0])
    return datetime.now()


def _is_liability(account_type: Optional[str]) -> bool:
    t = (account_type or "").lower()
    return any(k in t for k in ("credit", "card", "loan", "mortgage", "line of credit"))


# Job is done and data is ready to read from Sophtron's store.
_READY_STATUSES = {"completed", "accountsready"}


class SophtronIntegration(BaseIntegration):
    def __init__(self, credentials: Dict[str, Any]):
        super().__init__(credentials)
        self.client = credentials.get("_client")
        self.user_institution_id = credentials.get("user_institution_id")
        self.account_id = credentials.get("account_id")
        # Cache of the account type for the linked account (for sign handling).
        self._acct_type: Optional[str] = None
        self.last_txn_error: Optional[str] = None

    async def initialize(self) -> bool:
        if not self.client or not self.user_institution_id or not self.account_id:
            print("Failed to initialize Sophtron: missing client / ids")
            return False
        return await self.client.is_configured()

    async def get_accounts(self) -> List[AccountData]:
        accounts = await self.client.get_user_institution_accounts(self.user_institution_id)
        out: List[AccountData] = []
        for a in accounts:
            acct_type = a.get("AccountType") or ""
            bal = a.get("Balance")
            if bal is not None and _is_liability(acct_type):
                bal = -abs(float(bal))
            if str(a.get("AccountID")) == str(self.account_id):
                self._acct_type = acct_type
            out.append(AccountData(
                external_id=str(a.get("AccountID")),
                name=a.get("AccountName") or "Account",
                account_type=acct_type,
                currency=a.get("BalanceCurrency") or "USD",
                balance=float(bal) if bal is not None else None,
                institution_name=a.get("AccountName"),
            ))
        return out

    async def get_balance(self, account_id: str) -> Optional[float]:
        for a in await self.get_accounts():
            if a.external_id == str(account_id):
                return a.balance
        return None

    async def _try_refresh(self) -> None:
        """Best-effort live bank pull. If the bank re-prompts MFA we can't
        answer it in a background job, so we poll briefly and give up, leaving
        last_txn_error set so the sync is reported as partial."""
        import asyncio
        try:
            job = await self.client.refresh_account(self.account_id)
        except Exception as e:
            self.last_txn_error = f"refresh failed: {e}"
            return
        job_id = job.get("JobID")
        if not job_id:
            return
        # Poll up to ~20s for a clean, MFA-free completion.
        for _ in range(10):
            await asyncio.sleep(2)
            info = await self.client.get_job(job_id)
            status = str(info.get("LastStatus") or "").lower()
            if info.get("SuccessFlag") is True or status in _READY_STATUSES:
                return
            # Any MFA field present -> needs interactive re-auth; bail out.
            if any(info.get(k) for k in ("SecurityQuestion", "TokenMethod",
                                         "TokenSentFlag", "TokenRead", "CaptchaImage")):
                self.last_txn_error = "Manual refresh needed (bank requires MFA)"
                return
            if info.get("SuccessFlag") is False and status == "completed":
                self.last_txn_error = "refresh did not complete"
                return
        self.last_txn_error = "refresh timed out; showing stored data"

    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[TransactionData]:
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()

        # Attempt a live refresh; falls back to stored data if MFA is needed.
        await self._try_refresh()

        if self._acct_type is None:
            await self.get_accounts()  # populate account type for sign handling
        liability = _is_liability(self._acct_type)

        rows = await self.client.get_transactions_by_date(
            self.account_id, start_date.date(), end_date.date())
        out: List[TransactionData] = []
        for t in rows:
            raw = t.get("Amount")
            raw = float(raw) if raw is not None else 0.0
            amount = -raw if liability else raw
            out.append(TransactionData(
                external_id=str(t.get("TransactionID")),
                description=t.get("Description") or t.get("Merchant") or "",
                amount=amount,
                currency=t.get("Currency") or "USD",
                date=_to_dt(t.get("TransactionDate") or t.get("Date")),
                merchant_name=t.get("Merchant"),
                category=t.get("Category"),
                pending=str(t.get("Status") or "").lower() == "pending",
            ))
        return out
