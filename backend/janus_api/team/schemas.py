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
    private: bool = False


class DirectIn(BaseModel):
    """One person makes a direct conversation; two or more make a group."""

    model_config = ConfigDict(extra="forbid")
    user_id: int | None = Field(default=None, gt=0)
    user_ids: list[int] = Field(default_factory=list, max_length=15)


class MessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Body
    parent_id: int | None = Field(default=None, gt=0)


Option = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]


class PostIn(BaseModel):
    """A post: announcement, kudos, poll, event or meeting."""

    model_config = ConfigDict(extra="forbid")
    kind: Literal["announcement", "kudos", "poll", "event", "meeting"]
    body: Body
    title: str = Field(default="", max_length=120)
    kudos_to: int | None = Field(default=None, gt=0)
    kudos_value: str = Field(default="", max_length=40)
    options: list[Option] = Field(default_factory=list, max_length=6)
    anonymous: bool = False
    closes_at: datetime | None = None
    starts_at: datetime | None = None
    place: str = Field(default="", max_length=120)
    agenda: str = Field(default="", max_length=2000)
    duration_minutes: int = Field(default=30, ge=5, le=480)


class RespondIn(BaseModel):
    """A vote in a poll (the option's id), or an answer to an event: going, maybe or no."""

    model_config = ConfigDict(extra="forbid")
    value: str = Field(min_length=1, max_length=40)


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
    status: str = ""
    statusText: str = ""
    statusEmoji: str = ""
    dnd: bool = False


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
    # The company's announcements channel: everyone reads it, only announcers post.
    announcements: bool = False
    canPost: bool = True
    private: bool = False
    favourite: bool = False
    muted: bool = False


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
    kind: str = "text"
    title: str | None = None
    kudos: "KudosOut | None" = None
    poll: "PollOut | None" = None
    event: "EventOut | None" = None
    meeting: "MeetingOut | None" = None
    pinned: bool = False
    pinnedBy: "PersonOut | None" = None
    saved: bool = False
    mentions: list[int] = []
    delivery: str = ""


class KudosOut(BaseModel):
    to: PersonOut
    value: str


class PollVoterOut(BaseModel):
    id: int
    name: str


class PollOptionOut(BaseModel):
    id: str
    text: str
    votes: int
    voters: list[PollVoterOut] = []


class PollOut(BaseModel):
    options: list[PollOptionOut]
    myVote: str | None
    total: int
    closesAt: datetime | None
    closed: bool
    anonymous: bool = False


class RsvpPersonOut(BaseModel):
    id: int
    name: str


class EventOut(BaseModel):
    startsAt: datetime
    place: str
    going: int
    maybe: int
    declined: int
    mine: str | None
    goingNames: list[RsvpPersonOut] = []
    maybeNames: list[RsvpPersonOut] = []
    declinedNames: list[RsvpPersonOut] = []


class MeetingOut(BaseModel):
    startsAt: datetime
    durationMinutes: int
    agenda: str
    going: int
    maybe: int
    declined: int
    mine: str | None
    joinUrl: str


class AnnouncementOut(BaseModel):
    id: str
    spaceId: str
    title: str | None
    body: str
    author: PersonOut
    createdAt: datetime


SearchHit.model_rebuild()


class AddMemberIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int = Field(gt=0)


class CallEventOut(BaseModel):
    id: str
    userId: int
    userName: str
    action: str
    createdAt: datetime


class ForwardIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to_space_id: int = Field(gt=0)


class StatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status_text: str = Field(default="", max_length=100)
    status_emoji: str = Field(default="", max_length=16)
    dnd: bool = False


class PresenceOut(BaseModel):
    userId: int
    name: str
    status: Literal["online", "away", "offline"]
    statusText: str = ""
    statusEmoji: str = ""
    dnd: bool = False


class TypingIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    space_id: int = Field(gt=0)


class SpaceMemberOut(BaseModel):
    userId: int
    name: str
    role: str = "member"
    joinedAt: datetime
    status: str = "offline"
    statusText: str = ""
    statusEmoji: str = ""
    dnd: bool = False


class SpaceDetailOut(BaseModel):
    id: str
    kind: str
    name: str | None
    topic: str
    createdAt: datetime
    createdBy: PersonOut
    memberCount: int
    members: list[SpaceMemberOut]
    announcements: bool = False
    private: bool = False


class TopicIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str = Field(max_length=200)


class SpaceSettingsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, pattern=CHANNEL_NAME, max_length=40)
    topic: str | None = Field(default=None, max_length=200)


class AttachmentGalleryOut(BaseModel):
    id: str
    filename: str
    contentType: str
    sizeBytes: int
    isImage: bool
    uploadedBy: str
    createdAt: datetime


class ScheduleIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: Body
    send_at: datetime


class ScheduledOut(BaseModel):
    id: str
    spaceId: str
    body: str
    sendAt: datetime
    createdAt: datetime


class IceServerOut(BaseModel):
    urls: list[str]
    username: str | None = None
    credential: str | None = None


class IceConfigOut(BaseModel):
    iceServers: list[IceServerOut]
    iceTransportPolicy: Literal["all", "relay"]
    ttlSeconds: int


class SeenByOut(BaseModel):
    userId: int
    name: str
    seenAt: datetime


class ReactionDetailOut(BaseModel):
    emoji: str
    users: list[PersonOut]


class MessageInfoOut(BaseModel):
    id: str
    createdAt: datetime
    author: PersonOut
    seenBy: list[SeenByOut] = []
    notSeenBy: list[PersonOut] = []
    reactions: list[ReactionDetailOut] = []
    poll: "PollOut | None" = None
    event: "EventOut | None" = None


MessageInfoOut.model_rebuild()
MessageOut.model_rebuild()
