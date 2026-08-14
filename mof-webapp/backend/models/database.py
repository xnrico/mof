from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from fastapi import Request
from config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=True,
    future=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---- Demo mode -----------------------------------------------------------
# Demo mode runs against a physically separate Postgres database (`mof_demo`)
# so it can never read from or write to the real data. The frontend served
# under /demo sends the header `X-MOF-Demo: 1`, and get_db() below routes
# those requests to the demo engine.

def _swap_db_name(url: str, new_name: str) -> str:
    """Return `url` with its trailing database name replaced by `new_name`.

    DATABASE_URL looks like postgresql+asyncpg://user:pass@host:port/dbname
    (optionally with a ?query). We only touch the path segment.
    """
    base, sep, query = url.partition("?")
    prefix, _, _old = base.rpartition("/")
    return f"{prefix}/{new_name}{sep}{query}"


DEMO_DB_NAME = "mof_demo"
DEMO_DATABASE_URL = _swap_db_name(settings.DATABASE_URL, DEMO_DB_NAME)

demo_engine = create_async_engine(
    DEMO_DATABASE_URL,
    echo=True,
    future=True,
)

demo_session_maker = async_sessionmaker(
    demo_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db(request: Request) -> AsyncSession:
    """Yield a DB session, routed to the demo database when the request
    carries the demo header. All API routes depend on this, so the switch
    propagates everywhere without per-route changes."""
    is_demo = request.headers.get("X-MOF-Demo") == "1"
    maker = demo_session_maker if is_demo else async_session_maker
    async with maker() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def ensure_demo_database():
    """Create the demo database if it doesn't exist yet.

    CREATE DATABASE cannot run inside a transaction, so we connect to the
    maintenance `postgres` database with an AUTOCOMMIT connection.
    """
    maintenance_url = _swap_db_name(settings.DATABASE_URL, "postgres")
    admin_engine = create_async_engine(maintenance_url, isolation_level="AUTOCOMMIT")
    try:
        async with admin_engine.connect() as conn:
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": DEMO_DB_NAME},
            )
            if not exists:
                # DEMO_DB_NAME is a hardcoded constant, not user input.
                await conn.execute(text(f'CREATE DATABASE "{DEMO_DB_NAME}"'))
    finally:
        await admin_engine.dispose()


async def init_demo_db():
    async with demo_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
