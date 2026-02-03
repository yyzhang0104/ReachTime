"""
Application configuration.

Configuration sources (in priority order):
1. Environment variables (highest priority, for deployment)
2. config.yaml: Non-sensitive application settings (model, CORS defaults, etc.)

Sensitive credentials like OPENAI_API_KEY should ONLY be set via environment
variables (e.g., Railway Variables), never committed to files.
"""

import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import yaml
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


# Determine project root directory
PROJECT_ROOT = Path(__file__).parent.parent.parent


def _load_config_yaml() -> dict:
    """Load configuration from config.yaml file."""
    config_path = PROJECT_ROOT / "config.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


class Settings(BaseSettings):
    """
    Application settings.

    - OPENAI_API_KEY: loaded from environment variable (sensitive)
    - openai_model: loaded from config.yaml (non-sensitive)
    - cors_allow_origins: environment variable CORS_ALLOW_ORIGINS overrides config.yaml
    """

    model_config = SettingsConfigDict(
        # Do NOT use env_file - credentials should only come from environment variables
        case_sensitive=False,
        extra="ignore",
    )

    # Sensitive: loaded from environment variable only
    openai_api_key: str = ""

    # Raw CORS string from environment (comma-separated), used to override config.yaml
    # This is read directly from CORS_ALLOW_ORIGINS env var as a string
    cors_allow_origins_env: Optional[str] = Field(
        default=None, 
        validation_alias="CORS_ALLOW_ORIGINS",
    )

    # Non-sensitive: will be populated from config.yaml or env
    openai_model: str = "gpt-4o-mini"
    
    # Internal storage for parsed origins (not read from env directly)
    _cors_allow_origins: List[str] = ["*"]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Load config.yaml values
        config = _load_config_yaml()

        # Load OpenAI model from config.yaml
        openai_config = config.get("openai", {})
        if "model" in openai_config:
            object.__setattr__(self, "openai_model", openai_config["model"])

        # CORS: environment variable CORS_ALLOW_ORIGINS takes priority over config.yaml
        if self.cors_allow_origins_env:
            # Parse comma-separated origins from environment variable
            origins = [origin.strip() for origin in self.cors_allow_origins_env.split(",") if origin.strip()]
            object.__setattr__(self, "_cors_allow_origins", origins)
        else:
            # Fall back to config.yaml
            cors_config = config.get("cors", {})
            if "allow_origins" in cors_config:
                origins = cors_config["allow_origins"]
                if isinstance(origins, list):
                    object.__setattr__(self, "_cors_allow_origins", origins)
                elif isinstance(origins, str):
                    object.__setattr__(self, "_cors_allow_origins", [origins])

    @property
    def cors_allow_origins(self) -> List[str]:
        """Return CORS origins as a list."""
        return self._cors_allow_origins

    @property
    def cors_origins_list(self) -> List[str]:
        """Return CORS origins as a list."""
        return self.cors_allow_origins


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Uses lru_cache to ensure settings are only loaded once.
    """
    return Settings()
