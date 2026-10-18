import re
from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
    model_validator,
)

from janus_api.core.security import now

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Target = Literal[
    "name",
    "phone",
    "email",
    "company",
    "requirement",
    "campaign",
    "recording_url",
    "recording_reference",
]


class FieldMapping(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rawField: str = Field(min_length=1, max_length=200, pattern=r"^[^\x00-\x1f\x7f]+$")
    mapsTo: Target


class ConnectionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    description: str = Field(default="", max_length=1000)
    connectionKind: Literal["webhook", "embed", "api_key", "csv"] = "webhook"
    preset: Literal[
        "custom",
        "exotel",
        "knowlarity",
        "myoperator",
        "tata_tele",
        "google_ads_lead_form",
        "zapier",
        "make",
    ] = "custom"
    fieldMapping: list[FieldMapping] | None = Field(default=None, min_length=1, max_length=8)
    allowedOrigins: list[str] = Field(default_factory=list, max_length=20)
    eventIdField: str | None = Field(
        default=None, pattern=r"^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,9}$", max_length=200
    )

    @field_validator("allowedOrigins")
    @classmethod
    def valid_origins(cls, origins: list[str]) -> list[str]:
        normalized = []
        for origin in origins:
            url = HttpUrl(origin)
            if (
                "*" in (url.host or "")
                or url.username
                or url.password
                or url.path not in (None, "/")
                or url.query
                or url.fragment
            ):
                raise ValueError("Provide exact website origins without a path or credentials")
            normalized.append(str(url).rstrip("/"))
        return sorted(set(normalized))

    @model_validator(mode="after")
    def unique_targets(self) -> Self:
        if (
            self.connectionKind != "csv"
            and self.fieldMapping
            and any(
                not re.fullmatch(r"[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,9}", item.rawField)
                for item in self.fieldMapping
            )
        ):
            raise ValueError("Use dotted field paths for non-CSV sources")
        if self.fieldMapping and len({item.mapsTo for item in self.fieldMapping}) != len(
            self.fieldMapping
        ):
            raise ValueError("Map each contact field only once")
        if self.connectionKind == "embed" and not self.allowedOrigins:
            raise ValueError("Website forms need at least one allowed origin")
        if self.connectionKind != "embed" and self.allowedOrigins:
            raise ValueError("Origins only apply to website forms")
        if self.connectionKind != "webhook" and (self.preset != "custom" or self.eventIdField):
            raise ValueError("Provider presets only apply to webhooks")
        return self


class ConnectionUpdate(ConnectionCreate):
    status: Literal["connected", "available"]


class ConnectionOut(BaseModel):
    id: str
    source: Literal["webhook", "phone_call", "website", "api", "csv_import", "whatsapp"] = "webhook"
    name: str
    description: str
    connectionKind: Literal["webhook", "embed", "api_key", "csv", "oauth"] = "webhook"
    preset: Literal[
        "custom",
        "exotel",
        "knowlarity",
        "myoperator",
        "tata_tele",
        "google_ads_lead_form",
        "zapier",
        "make",
    ] = "custom"
    status: Literal["connected", "available"]
    fieldMapping: list[FieldMapping]
    webhookUrl: str | None = None
    ingestUrl: str
    allowedOrigins: list[str]
    eventIdField: str | None
    lastEventAt: datetime | None
    capturedLeads: int = 0


class ConnectionSecret(ConnectionOut):
    signingSecret: str | None = None
    callbackUrl: str | None = None


class ReceiptOut(BaseModel):
    id: str
    duplicate: bool


class EventOut(BaseModel):
    id: str
    sourceId: str
    receivedAt: datetime
    status: Literal["pending", "processed", "failed"]
    result: Literal["new_profile", "merged"] | None
    customerId: str | None
    leadId: str | None
    reason: str | None
    importId: str | None = None
    rowNumber: int | None = None


class ApiKeyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    scopes: list[Literal["leads:ingest"]] = Field(
        default=["leads:ingest"], min_length=1, max_length=1
    )
    expiresAt: datetime | None = None

    @field_validator("expiresAt")
    @classmethod
    def future_expiry(cls, value: datetime | None) -> datetime | None:
        if value and (value.tzinfo is None or value <= now()):
            raise ValueError("Expiry must be a future timestamp with timezone")
        return value


class ApiKeyOut(BaseModel):
    id: str
    name: str
    prefix: str
    scopes: list[str]
    expiresAt: datetime | None
    revokedAt: datetime | None
    lastUsedAt: datetime | None
    createdAt: datetime


class ApiKeySecret(ApiKeyOut):
    key: str


class PresetOut(BaseModel):
    value: str
    label: str
    group: str
    fieldMapping: list[FieldMapping]
    eventIdField: str | None
    instructions: str
    documentationUrl: str | None


class CsvImportOut(BaseModel):
    id: str
    sourceId: str
    fileName: str
    totalRows: int
    pendingRows: int
    processedRows: int
    failedRows: int
    status: Literal["processing", "completed", "completed_with_errors"]
    createdAt: datetime


class CsvImportReceipt(CsvImportOut):
    duplicate: bool
