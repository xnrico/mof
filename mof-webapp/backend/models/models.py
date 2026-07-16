from sqlalchemy import String, Float, DateTime, ForeignKey, Enum as SQLEnum, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import Optional, List
import enum
from .database import Base


class Currency(str, enum.Enum):
    GBP = "GBP"
    USD = "USD"


class Category(str, enum.Enum):
    FOOD = "Food"
    GROCERY = "Grocery"
    TRANSPORT = "Transport"
    HOUSING = "Housing"
    ENTERTAINMENT = "Entertainment"
    TOURISM = "Tourism"
    SUBSCRIPTIONS = "Subscriptions"
    KITTENS = "Kittens"
    SALARY = "Salary"
    INVESTMENT_GAIN = "Investment Gain"
    INVESTMENT_LOSS = "Investment Loss"
    DIVIDEND = "Dividend"
    INTEREST = "Interest"
    OTHER = "Other"


class AccountType(str, enum.Enum):
    CHECKING = "Checking"
    SAVINGS = "Savings"
    CREDIT_CARD = "Credit Card"
    BROKERAGE = "Brokerage"
    OTHER = "Other"


class IntegrationProvider(str, enum.Enum):
    PLAID = "Plaid"
    GOCARDLESS = "GoCardless"
    IBKR = "IBKR"
    TRADING212 = "Trading212"
    MANUAL = "Manual"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    accounts: Mapped[List["Account"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    income_sources: Mapped[List["IncomeSource"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(200))
    account_type: Mapped[AccountType] = mapped_column(SQLEnum(AccountType))
    currency: Mapped[Currency] = mapped_column(SQLEnum(Currency))
    provider: Mapped[IntegrationProvider] = mapped_column(SQLEnum(IntegrationProvider))

    # External account identifiers
    external_account_id: Mapped[Optional[str]] = mapped_column(String(255))
    external_institution_id: Mapped[Optional[str]] = mapped_column(String(255))

    # Balance tracking
    current_balance: Mapped[Optional[float]] = mapped_column(Float)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="accounts")
    transactions: Mapped[List["Transaction"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    integration_config: Mapped[Optional["IntegrationConfig"]] = relationship(back_populates="account", uselist=False)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))

    # External transaction ID (from API provider)
    external_transaction_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True)

    # Transaction details
    description: Mapped[str] = mapped_column(String(500))
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[Currency] = mapped_column(SQLEnum(Currency))
    category: Mapped[Category] = mapped_column(SQLEnum(Category))

    # Timestamps
    transaction_date: Mapped[datetime] = mapped_column(DateTime)
    posted_date: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Additional metadata
    merchant_name: Mapped[Optional[str]] = mapped_column(String(200))
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Manual overrides
    category_override: Mapped[Optional[Category]] = mapped_column(SQLEnum(Category))
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    account: Mapped["Account"] = relationship(back_populates="transactions")


class IntegrationConfig(Base):
    __tablename__ = "integration_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), unique=True)

    provider: Mapped[IntegrationProvider] = mapped_column(SQLEnum(IntegrationProvider))

    # Encrypted credentials/tokens (store encrypted in production)
    access_token: Mapped[Optional[str]] = mapped_column(Text)
    refresh_token: Mapped[Optional[str]] = mapped_column(Text)
    item_id: Mapped[Optional[str]] = mapped_column(String(255))  # Plaid item_id

    # Provider-specific config (JSON string)
    config_data: Mapped[Optional[str]] = mapped_column(Text)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    last_sync_status: Mapped[Optional[str]] = mapped_column(String(50))
    last_error: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    account: Mapped["Account"] = relationship(back_populates="integration_config")


class IncomeSource(Base):
    __tablename__ = "income_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    name: Mapped[str] = mapped_column(String(200))
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[Currency] = mapped_column(SQLEnum(Currency))
    frequency: Mapped[str] = mapped_column(String(50))  # monthly, annual, etc.

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship(back_populates="income_sources")


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id: Mapped[int] = mapped_column(primary_key=True)
    from_currency: Mapped[Currency] = mapped_column(SQLEnum(Currency))
    to_currency: Mapped[Currency] = mapped_column(SQLEnum(Currency))
    rate: Mapped[float] = mapped_column(Float)
    date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
