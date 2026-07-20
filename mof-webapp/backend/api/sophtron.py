"""Sophtron interactive enrollment endpoints.

Drives the bank login + MFA flow from the frontend wizard. Bank credentials are
forwarded to Sophtron and NOT persisted here — only the resulting
UserInstitutionID (in config_data) and AccountID (in item_id /
external_account_id) are stored.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json

from models.database import get_db
from models.models import Account, IntegrationConfig, IntegrationProvider
from services.sophtron_client import SophtronClient

router = APIRouter()


class InstSearch(BaseModel):
    name: str
    key_pair_id: Optional[int] = None


class LoginReq(BaseModel):
    institution_id: str
    username: str
    password: str
    pin: str = ""
    key_pair_id: Optional[int] = None


class MfaReq(BaseModel):
    key_pair_id: Optional[int] = None
    security_answer: Optional[str] = None
    captcha_input: Optional[str] = None
    token_choice: Optional[str] = None
    token_input: Optional[str] = None
    verify_phone: Optional[bool] = None


class AccountsReq(BaseModel):
    user_institution_id: str
    key_pair_id: Optional[int] = None


class SetAccountReq(BaseModel):
    mof_account_id: int
    sophtron_account_id: str
    user_institution_id: str
    key_pair_id: Optional[int] = None


def _normalize_job(job: dict) -> dict:
    """Reduce a raw Sophtron job to a frontend-friendly status + MFA prompt."""
    status = str(job.get("LastStatus") or "").lower()
    success = job.get("SuccessFlag")
    mfa = None
    if job.get("SecurityQuestion"):
        # SecurityQuestion is a JSON array string of question text(s).
        mfa = {"type": "security_question", "questions": job.get("SecurityQuestion")}
    elif job.get("TokenMethod"):
        mfa = {"type": "token_method", "options": job.get("TokenMethod")}
    elif job.get("TokenSentFlag"):
        mfa = {"type": "token_input"}
    elif job.get("TokenRead") is not None:
        mfa = {"type": "token_phone_verify", "read": job.get("TokenRead")}
    elif job.get("CaptchaImage"):
        mfa = {"type": "captcha", "image": job.get("CaptchaImage")}

    if success is True or status in ("completed", "accountsready"):
        state = "success"
    elif success is False and status == "completed":
        state = "failed"
    elif mfa:
        state = "mfa"
    else:
        state = "pending"
    return {"state": state, "mfa": mfa, "last_status": job.get("LastStatus"),
            "job_id": job.get("JobID")}


@router.post("/institutions")
async def search_institutions(req: InstSearch, db: AsyncSession = Depends(get_db)):
    client = SophtronClient(db, key_pair_id=req.key_pair_id)
    if not await client.is_configured():
        raise HTTPException(400, "Sophtron credentials not set (Settings or key pair).")
    try:
        results = await client.get_institutions_by_name(req.name)
    except Exception as e:
        raise HTTPException(502, f"Sophtron error: {e}")
    return [
        {"id": str(i.get("InstitutionID")), "name": i.get("InstitutionName")}
        for i in results
    ]


@router.post("/login")
async def login(req: LoginReq, db: AsyncSession = Depends(get_db)):
    client = SophtronClient(db, key_pair_id=req.key_pair_id)
    if not await client.is_configured():
        raise HTTPException(400, "Sophtron credentials not set (Settings or key pair).")
    try:
        tracker = await client.create_user_institution(
            req.institution_id, req.username, req.password, req.pin)
    except Exception as e:
        raise HTTPException(502, f"Sophtron login failed: {e}")
    job_id = tracker.get("JobID")
    if not job_id:
        raise HTTPException(502, f"Unexpected Sophtron response: {tracker}")
    return {"job_id": job_id, "user_institution_id": tracker.get("UserInstitutionID")}


@router.get("/job/{job_id}")
async def job_status(job_id: str, key_pair_id: Optional[int] = None,
                     db: AsyncSession = Depends(get_db)):
    client = SophtronClient(db, key_pair_id=key_pair_id)
    try:
        job = await client.get_job(job_id)
    except Exception as e:
        raise HTTPException(502, f"Sophtron error: {e}")
    return _normalize_job(job)


@router.post("/job/{job_id}/mfa")
async def answer_mfa(job_id: str, req: MfaReq, db: AsyncSession = Depends(get_db)):
    client = SophtronClient(db, key_pair_id=req.key_pair_id)
    try:
        if req.security_answer is not None:
            await client.update_security_answer(job_id, req.security_answer)
        elif req.captcha_input is not None:
            await client.update_captcha(job_id, req.captcha_input)
        elif req.token_choice is not None or req.token_input is not None or req.verify_phone is not None:
            await client.update_token(job_id, req.token_choice, req.token_input, req.verify_phone)
        else:
            raise HTTPException(400, "No MFA answer provided.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Sophtron MFA update failed: {e}")
    return {"ok": True}


@router.post("/accounts")
async def list_sophtron_accounts(req: AccountsReq, db: AsyncSession = Depends(get_db)):
    client = SophtronClient(db, key_pair_id=req.key_pair_id)
    try:
        accounts = await client.get_user_institution_accounts(req.user_institution_id)
    except Exception as e:
        raise HTTPException(502, f"Sophtron error: {e}")
    out = []
    for a in accounts:
        acct_type = (a.get("AccountType") or "")
        bal = a.get("Balance")
        if bal is not None and any(k in acct_type.lower() for k in ("credit", "card", "loan")):
            bal = -abs(float(bal))
        out.append({
            "account_id": str(a.get("AccountID")),
            "name": a.get("AccountName"),
            "account_type": acct_type,
            "currency": a.get("BalanceCurrency") or "USD",
            "balance": float(bal) if bal is not None else None,
            "mask": (a.get("AccountNumber") or "")[-4:] if a.get("AccountNumber") else None,
        })
    return out


@router.post("/set-account")
async def set_account(req: SetAccountReq, db: AsyncSession = Depends(get_db)):
    account = await db.get(Account, req.mof_account_id)
    if not account:
        raise HTTPException(404, "Account not found")

    existing = (await db.execute(
        select(IntegrationConfig).where(IntegrationConfig.account_id == req.mof_account_id)
    )).scalar_one_or_none()

    cfg_data = json.dumps({"user_institution_id": req.user_institution_id})
    if existing:
        existing.provider = IntegrationProvider.SOPHTRON
        existing.item_id = req.sophtron_account_id
        existing.config_data = cfg_data
        existing.key_pair_id = req.key_pair_id
        existing.is_active = True
    else:
        db.add(IntegrationConfig(
            account_id=req.mof_account_id,
            provider=IntegrationProvider.SOPHTRON,
            item_id=req.sophtron_account_id,
            config_data=cfg_data,
            key_pair_id=req.key_pair_id,
            is_active=True,
        ))
    account.external_account_id = req.sophtron_account_id
    await db.commit()
    return {"message": "Sophtron account linked"}
