import json
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

CHANNEL_NAME = r"^[a-z0-9][a-z0-9-]{1,39}$"
EMOJI = Literal["👍", "❤️", "😂", "🎉", "👀", "🙏"]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ChannelIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(pattern=CHANNEL_NAME)
    topic: str = Field(default="", max_length=200)
    voice: bool = False


class DirectIn(BaseModel):
    """One person makes a direct conversation; two or more make a group."""

    model_config = ConfigDict(extra="forbid")
    user_id: int | None = Field(default=None, gt=0)
    user_ids: list[int] = Field(default_factory=list, max_length=15)


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Body
    parent_id: int | None = Field(default=None, gt=0)


class MessageEdit(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Body


class ReactionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    emoji: EMOJI


class ReadIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    last_message_id: int = Field(ge=0)


class PersonOut(BaseModel):
    id: int
    name: str


class CallPersonOut(BaseModel):
    id: int
    name: str
    muted: bool
    deafened: bool
    sharing: bool


class CallOut(BaseModel):
    spaceId: str
    participants: list[CallPersonOut]


class VoiceStateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    muted: bool = False
    deafened: bool = False
    sharing: bool = False


class SignalIn(BaseModel):
    """A WebRTC message for one other person in the call. Kept under 64 KB."""

    model_config = ConfigDict(extra="forbid")
    to_user_id: int = Field(gt=0)
    kind: Literal["offer", "answer", "ice", "bye"]
    payload: dict[str, Any]

    @field_validator("payload")
    @classmethod
    def small(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value)) > 65536:
            raise ValueError("A call message can be at most 64 KB.")
        return value


class SignalOut(BaseModel):
    id: str
    fromUserId: int
    kind: str
    payload: dict[str, Any]


class SpaceOut(BaseModel):
    id: str
    kind: Literal["channel", "dm", "group", "voice"]
    name: str | None
    title: str
    topic: str
    memberCount: int
    joined: bool
    unread: int
    peer: PersonOut | None
    lastMessageAt: datetime | None
    lastMessagePreview: str | None
    inCall: list[CallPersonOut] = []


class ReactionOut(BaseModel):
    emoji: str
    count: int
    mine: bool


class AttachmentOut(BaseModel):
    id: str
    filename: str
    contentType: str
    sizeBytes: int
    isImage: bool


class SearchHit(BaseModel):
    message: "MessageOut"
    spaceId: str
    spaceLabel: str
    spaceKind: Literal["channel", "dm", "group", "voice"]


class MessageOut(BaseModel):
    id: str
    spaceId: str
    parentId: str | None
    author: PersonOut
    body: str | None
    createdAt: datetime
    editedAt: datetime | None
    deleted: bool
    mine: bool
    replyCount: int
    reactions: list[ReactionOut]
    attachments: list[AttachmentOut] = []


SearchHit.model_rebuild()


class IceServerOut(BaseModel):
    urls: list[str]
    username: str | None = None
    credential: str | None = None


class IceConfigOut(BaseModel):
    iceServers: list[IceServerOut]
    iceTransportPolicy: Literal["all", "relay"]
    ttlSeconds: int
