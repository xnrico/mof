from typing import Dict, Type
from .base import BaseIntegration
from .plaid_integration import PlaidIntegration
from .gocardless_integration import GoCardlessIntegration
from .ibkr_integration import IBKRIntegration
from .trading212_integration import Trading212Integration
from .truelayer_integration import TrueLayerIntegration


class IntegrationFactory:
    """Factory for creating integration instances"""

    _integrations: Dict[str, Type[BaseIntegration]] = {
        "plaid": PlaidIntegration,
        "gocardless": GoCardlessIntegration,
        "ibkr": IBKRIntegration,
        "trading212": Trading212Integration,
        "truelayer": TrueLayerIntegration,
    }

    @classmethod
    def create(cls, provider: str, credentials: Dict) -> BaseIntegration:
        """Create an integration instance"""
        integration_class = cls._integrations.get(provider.lower())

        if not integration_class:
            raise ValueError(f"Unknown provider: {provider}")

        return integration_class(credentials)

    @classmethod
    def get_available_providers(cls) -> list[str]:
        """Get list of available integration providers"""
        return list(cls._integrations.keys())
