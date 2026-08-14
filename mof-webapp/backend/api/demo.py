from fastapi import APIRouter, HTTPException, Request

from services.demo_seed import reset_demo

router = APIRouter()


@router.post("/reset")
async def reset_demo_data(request: Request):
    """Wipe and reseed the demo database.

    Guarded by the demo header so this endpoint can never be pointed at the
    real database — it operates solely on the separate demo engine.
    """
    if request.headers.get("X-MOF-Demo") != "1":
        raise HTTPException(status_code=403, detail="Demo mode only")
    await reset_demo()
    return {"status": "reset"}
