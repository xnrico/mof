from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from config import settings
from models.database import init_db, get_db
from api import accounts, transactions, users, sync, settings as settings_api, gocardless, truelayer, key_pairs, plaid


# Initialize scheduler
scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    await init_db()

    # Start scheduler for periodic syncing — every 5 minutes in the background
    scheduler.add_job(
        sync_all_accounts_job,
        IntervalTrigger(minutes=5),
        id="sync_all_accounts",
        max_instances=1,          # don't overlap runs if one is slow
        coalesce=True,            # collapse missed runs into one
        replace_existing=True,
    )
    scheduler.start()

    print("🚀 Ministry of Finance API started")
    print("⏱️  Auto-sync scheduled every 5 minutes")
    print(f"📊 Database: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else 'configured'}")

    yield

    # Shutdown
    scheduler.shutdown()
    print("👋 Ministry of Finance API shutting down")


# Create FastAPI app
app = FastAPI(
    title="Ministry of Finance API",
    description="Automated budget tracking with multi-provider financial integrations",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(settings_api.router, prefix="/api/settings", tags=["settings"])
app.include_router(gocardless.router, prefix="/api/gocardless", tags=["gocardless"])
app.include_router(truelayer.router, prefix="/api/truelayer", tags=["truelayer"])
app.include_router(plaid.router, prefix="/api/plaid", tags=["plaid"])
app.include_router(key_pairs.router, prefix="/api/key-pairs", tags=["key-pairs"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Ministry of Finance API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


# Background job for syncing
async def sync_all_accounts_job():
    """Background job to sync all accounts"""
    from services.sync_service import SyncService
    from models.database import async_session_maker

    async with async_session_maker() as session:
        sync_service = SyncService(session)
        results = await sync_service.sync_all_accounts()
        print(f"Sync job completed: {len(results)} accounts processed")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
