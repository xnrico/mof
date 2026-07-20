"""DB-aware Sophtron API client.

Sophtron is a data aggregator (used here for HSBC US, which syncs poorly via
Plaid). Unlike token-based providers it uses direct bank username/password
with asynchronous MFA handled through a polling "job" model.

Auth: HMAC-SHA256. The Authorization header is
    FIApiAUTH:{user_id}:{sig_b64}:{auth_path}
where auth_path is the lowercased path segment from the last '/' of the URL,
and the signed plaintext is "{METHOD}\n{auth_path}" using the base64-decoded
access key as the HMAC key.

Credentials come from the named key pair (user_id/access_key/base_url) when
provided, else the global app settings SOPHTRON_*.
"""
from typing import Optional, Any, Dict, List
import base64
import hashlib
import hmac
import json

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from services import provider_settings
from models.models import ProviderKeyPair
from config import settings


def build_auth_header(user_id: str, access_key: str, url: str, method: str) -> str:
    """Reproduce Sophtron's FIApiAUTH HMAC header."""
    auth_path = url[url.rfind("/"):].lower()
    plain = f"{method.upper()}\n{auth_path}"
    key_bytes = base64.b64decode(access_key)
    sig = hmac.new(key_bytes, plain.encode("ascii"), hashlib.sha256).digest()
    sig_b64 = base64.b64encode(sig).decode("ascii")
    return f"FIApiAUTH:{user_id}:{sig_b64}:{auth_path}"


class SophtronClient:
    """Async Sophtron client. Reads creds from key pair -> app settings."""

    def __init__(self, db: AsyncSession, key_pair_id: Optional[int] = None):
        self.db = db
        self.key_pair_id = key_pair_id
        self._creds: Optional[Dict[str, str]] = None

    async def _load_creds(self) -> Dict[str, str]:
        if self._creds is not None:
            return self._creds
        kp: Dict[str, Any] = {}
        if self.key_pair_id:
            row = await self.db.get(ProviderKeyPair, self.key_pair_id)
            if row and row.credentials:
                kp = json.loads(row.credentials)
        user_id = kp.get("user_id") or await provider_settings.get_effective(
            self.db, "SOPHTRON_USER_ID", settings.SOPHTRON_USER_ID)
        access_key = kp.get("access_key") or await provider_settings.get_effective(
            self.db, "SOPHTRON_ACCESS_KEY", settings.SOPHTRON_ACCESS_KEY)
        base_url = kp.get("base_url") or await provider_settings.get_effective(
            self.db, "SOPHTRON_BASE_URL", settings.SOPHTRON_BASE_URL)
        base_url = (base_url or "https://api.sophtron.com/api/").rstrip("/") + "/"
        self._creds = {"user_id": user_id or "", "access_key": access_key or "", "base_url": base_url}
        return self._creds

    async def is_configured(self) -> bool:
        c = await self._load_creds()
        return bool(c["user_id"] and c["access_key"])

    async def _post(self, path: str, payload: Dict[str, Any]) -> Any:
        c = await self._load_creds()
        url = c["base_url"] + path
        headers = {
            "Authorization": build_auth_header(c["user_id"], c["access_key"], url, "POST"),
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=45) as client:
            resp = await client.post(url, headers=headers, content=json.dumps(payload))
            resp.raise_for_status()
            return resp.json() if resp.text else None

    # --- Enrollment flow -------------------------------------------------
    async def get_institutions_by_name(self, name: str) -> List[dict]:
        res = await self._post("Institution/GetInstitutionByName", {"InstitutionName": name})
        return res if isinstance(res, list) else []

    async def create_user_institution(self, institution_id: str, username: str,
                                       password: str, pin: str = "") -> dict:
        c = await self._load_creds()
        return await self._post("UserInstitution/CreateUserInstitution", {
            "UserID": c["user_id"],
            "InstitutionID": institution_id,
            "UserName": username,
            "Password": password,
            "PIN": pin,
        }) or {}

    async def get_job(self, job_id: str) -> dict:
        return await self._post("Job/GetJobInformationByID", {"JobID": job_id}) or {}

    async def update_security_answer(self, job_id: str, answer: str) -> Any:
        return await self._post("Job/UpdateJobSecurityAnswer",
                                {"JobID": job_id, "SecurityAnswer": answer})

    async def update_captcha(self, job_id: str, captcha: str) -> Any:
        return await self._post("Job/UpdateJobCaptcha",
                                {"JobID": job_id, "CaptchaInput": captcha})

    async def update_token(self, job_id: str, token_choice: Optional[str] = None,
                           token_input: Optional[str] = None,
                           verify_phone: Optional[bool] = None) -> Any:
        return await self._post("Job/UpdateJobTokenInput", {
            "JobID": job_id,
            "TokenChoice": token_choice,
            "TokenInput": token_input,
            "VerifyPhoneFlag": verify_phone,
        })

    async def get_user_institution_accounts(self, user_institution_id: str) -> List[dict]:
        res = await self._post("UserInstitution/GetUserInstitutionAccounts",
                               {"UserInstitutionID": user_institution_id})
        return res if isinstance(res, list) else []

    async def refresh_account(self, account_id: str) -> dict:
        return await self._post("UserInstitutionAccount/RefreshUserInstitutionAccount",
                                {"AccountID": account_id}) or {}

    async def get_transactions_by_date(self, account_id: str, start, end) -> List[dict]:
        res = await self._post("Transaction/GetTransactionsByTransactionDate", {
            "AccountID": account_id,
            "StartDate": start.isoformat() if hasattr(start, "isoformat") else start,
            "EndDate": end.isoformat() if hasattr(end, "isoformat") else end,
        })
        return res if isinstance(res, list) else []
