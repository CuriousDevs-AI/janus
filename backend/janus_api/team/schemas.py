from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

CHANNEL_NAME = r"^[a-z0-9][a-z0-9-]{1,39}$"
EMOJI = Literal["👍", "❤️", "😂", "🎉", "👀", "🙏"]
Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class ChannelIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(pattern=CHANNEL_NAME)
    topic: str = Field(default="", max_length=200)


class DirectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int = Field(gt=0)


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


class SpaceOut(BaseModel):
    id: str
    kind: Literal["channel", "dm"]
    name: str | None
    topic: str
    memberCount: int
    joined: bool
    unread: int
    peer: PersonOut | None
    lastMessageAt: datetime | None
    lastMessagePreview: str | None


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
    spaceKind: Literal["channel", "dm"]


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
