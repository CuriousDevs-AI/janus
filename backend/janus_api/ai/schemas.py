from datetime import datetime
from decimal import Decimal
from typing import Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    SecretStr,
    field_validator,
    model_validator,
)

Provider = Literal["openai", "anthropic", "gemini", "openai_compatible"]


class CredentialPut(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = Field(min_length=1, max_length=160, pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")
    apiKey: SecretStr | None = Field(default=None, min_length=8, max_length=4096)
    baseUrl: HttpUrl | None = None
    enabled: bool = True

    @field_validator("apiKey")
    @classmethod
    def valid_key(cls, key: SecretStr | None) -> SecretStr | None:
        if key and any(ord(c) < 33 or ord(c) > 126 for c in key.get_secret_value()):
            raise ValueError("API keys must contain only visible ASCII characters")
        return key

    @model_validator(mode="after")
    def valid_url(self) -> Self:
        url = self.baseUrl
        if url and (
            url.scheme != "https" or url.username or url.password or url.query or url.fragment
        ):
            raise ValueError("Use an HTTPS API base URL without credentials, query or fragment")
        return self


class CredentialOut(BaseModel):
    id: str
    provider: Provider
    model: str
    keyLastFour: str
    baseUrl: str | None
    enabled: bool
    createdAt: datetime
    updatedAt: datetime


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=32000)


class UsageOut(BaseModel):
    id: str
    tenantId: str
    date: datetime
    provider: str
    model: str
    category: Literal["llm"] = "llm"
    feature: str
    status: Literal["pending", "succeeded", "failed"]
    inputTokens: int | None
    outputTokens: int | None
    units: int | None
    costUsd: Decimal | None
    costEstimated: bool
    errorCode: str | None
    latencyMs: int | None
    finishedAt: datetime | None


class CompletionOut(BaseModel):
    text: str
    usage: UsageOut
