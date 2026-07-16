from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime
from pydantic import BaseModel


class TransactionData(BaseModel):
    external_id: str
    description: str
    amount: float
    currency: str
    date: datetime
    merchant_name: Optional[str] = None
    category: Optional[str] = None
    pending: bool = False


class AccountData(BaseModel):
    external_id: str
    name: str
    account_type: str
    currency: str
    balance: Optional[float] = None
    institution_name: Optional[str] = None


class BaseIntegration(ABC):
    """Base class for all financial API integrations"""

    def __init__(self, credentials: Dict[str, Any]):
        self.credentials = credentials
        self._client = None

    @abstractmethod
    async def initialize(self) -> bool:
        """Initialize the API client with credentials"""
        pass

    @abstractmethod
    async def get_accounts(self) -> List[AccountData]:
        """Fetch all accounts from the provider"""
        pass

    @abstractmethod
    async def get_transactions(
        self,
        account_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[TransactionData]:
        """Fetch transactions for a specific account"""
        pass

    @abstractmethod
    async def get_balance(self, account_id: str) -> Optional[float]:
        """Get current balance for an account"""
        pass

    async def close(self):
        """Clean up resources"""
        pass
