from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, HttpUrl, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="JANUS_", extra="ignore")
    database_url: str
    migration_database_url: str = ""
    jwt_secret: SecretStr = Field(min_length=32)
    encryption_key: SecretStr = SecretStr("")
    environment: Literal["development", "production", "test"] = "development"
    email_backend: Literal["console", "smtp"] = "console"
    email_from: str = "Janus <hello@localhost>"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr = SecretStr("")
    smtp_starttls: bool = True
    s3_endpoint_url: str | None = None
    s3_region: str = "ap-south-1"
    s3_bucket: str = ""
    s3_access_key_id: SecretStr = SecretStr("")
    s3_secret_access_key: SecretStr = SecretStr("")
    s3_public_base_url: str = ""
    public_api_url: HttpUrl = HttpUrl("http://localhost:8000")
    ai_allowed_base_urls: list[HttpUrl] = Field(default_factory=list)
    meta_graph_version: str = Field(default="", pattern=r"^(?:v[0-9]{1,3}\.0)?$")
    form_limit_per_minute: int = Field(default=10, ge=1, le=120)
    frontend_url: str = "http://localhost:3000"
    # Voice calls: STUN and TURN servers, comma-separated. TURN credentials are minted per person
    # from the shared secret (coturn's use-auth-secret), so no TURN password reaches the browser.
    stun_urls: str = ""
    turn_urls: str = ""
    turn_secret: SecretStr = SecretStr("")
    turn_ttl_seconds: int = Field(default=3600, ge=300, le=86400)
    ice_transport_policy: Literal["all", "relay"] = "all"

    @property
    def stun_list(self) -> list[str]:
        return [url.strip() for url in self.stun_urls.split(",") if url.strip()]

    @property
    def turn_list(self) -> list[str]:
        return [url.strip() for url in self.turn_urls.split(",") if url.strip()]

    @model_validator(mode="after")
    def ice_settings(self) -> Self:
        if any(not url.startswith(("stun:", "stuns:")) for url in self.stun_list):
            raise ValueError("Each JANUS_STUN_URLS entry must start with stun: or stuns:")
        if any(not url.startswith(("turn:", "turns:")) for url in self.turn_list):
            raise ValueError("Each JANUS_TURN_URLS entry must start with turn: or turns:")
        if self.turn_list and len(self.turn_secret.get_secret_value()) < 32:
            raise ValueError("TURN servers need a JANUS_TURN_SECRET of at least 32 characters")
        return self

    @model_validator(mode="after")
    def production_settings(self) -> Self:
        url = self.public_api_url
        if url.username or url.password or url.query or url.fragment or url.path not in (None, "/"):
            raise ValueError("Public API URL must be an origin without credentials or a path")
        if self.environment == "production":
            if self.email_backend != "smtp":
                raise ValueError("Production requires SMTP email delivery")
            if self.public_api_url.scheme != "https":
                raise ValueError("Production API URL must use HTTPS")
            if not self.frontend_url.startswith("https://"):
                raise ValueError("Production frontend URL must use HTTPS")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
