from pydantic import BaseModel, ConfigDict, Field


class Keys(BaseModel):
    model_config = ConfigDict(extra="ignore")
    p256dh: str = Field(min_length=80, max_length=200)
    auth: str = Field(min_length=16, max_length=100)


class SubscriptionIn(BaseModel):
    """The browser's PushSubscription, as its toJSON() gives it."""

    model_config = ConfigDict(extra="ignore")
    endpoint: str = Field(min_length=20, max_length=2000)
    keys: Keys


class Unsubscribe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str = Field(min_length=20, max_length=2000)


class PushKeyOut(BaseModel):
    """The public key the browser subscribes with, or null when push is off."""

    publicKey: str | None
