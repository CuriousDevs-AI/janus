from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, SecretStr, StringConstraints, model_validator

from janus_api.auth.schemas import Identifier

MetaId = Annotated[str, StringConstraints(pattern=r"^[0-9]{5,40}$")]


class ConnectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    wabaId: MetaId
    phoneNumberId: MetaId
    accessToken: SecretStr = Field(min_length=20, max_length=4096)
    appSecret: SecretStr = Field(min_length=16, max_length=256)


class ConnectionOut(BaseModel):
    id: str
    wabaId: str
    phoneNumberId: str
    displayPhone: str
    verifiedName: str
    status: str
    callbackUrl: str
    webhookVerifiedAt: datetime | None
    verifyToken: str | None = None


class TemplateOut(BaseModel):
    name: str
    language: str
    body: str
    header: str = ""
    footer: str = ""
    parameterCount: int


class OpenConversation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contactId: Identifier


class SendMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["text", "template"]
    body: str = Field(default="", max_length=4096, pattern=r"^[^\x00]*$")
    templateName: str = Field(default="", max_length=512, pattern=r"^[a-z0-9_]*$")
    language: str = Field(default="", max_length=20, pattern=r"^[A-Za-z_]*$")
    parameters: list[
        Annotated[str, StringConstraints(min_length=1, max_length=1024, pattern=r"^[^\x00]*$")]
    ] = Field(default_factory=list, max_length=20)
    optInConfirmed: bool = False

    @model_validator(mode="after")
    def valid_message(self) -> Self:
        if self.kind == "text":
            if not self.body.strip() or self.templateName or self.language or self.parameters:
                raise ValueError("Provide a text message only")
        elif self.body or not self.templateName or not self.language or not self.optInConfirmed:
            raise ValueError("Select a template and confirm WhatsApp opt-in")
        return self


class ConversationOut(BaseModel):
    id: str
    contactId: str
    name: str
    phone: str | None
    company: str
    whatsappOptIn: bool
    doNotContact: bool
    consentSource: str | None
    consentUpdatedAt: datetime | None
    lastMessageAt: datetime
    lastInboundAt: datetime | None
    replyWindowEndsAt: datetime | None


class MessageOut(BaseModel):
    id: str
    direction: str
    kind: str
    body: str
    status: str
    errorCode: str | None
    createdAt: datetime
