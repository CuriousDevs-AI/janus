import type { CallPerson } from "@/components/team/voice-call";

export interface TeamPerson {
  id: number;
  name: string;
  avatarUrl?: string;
  status?: "online" | "away" | "offline" | "";
  statusText?: string;
  statusEmoji?: string;
  dnd?: boolean;
}

export interface TeamSpace {
  id: string;
  kind: "channel" | "dm" | "group" | "voice";
  name: string | null;
  title: string;
  topic: string;
  memberCount: number;
  joined: boolean;
  unread: number;
  peer: TeamPerson | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  inCall: CallPerson[];
  /** The company's announcements channel: everyone reads it, only announcers post. */
  announcements: boolean;
  canPost: boolean;
  private: boolean;
  favourite: boolean;
  muted: boolean;
}

export interface TeamReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface TeamMessage {
  id: string;
  spaceId: string;
  parentId: string | null;
  author: TeamPerson;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  mine: boolean;
  replyCount: number;
  reactions: TeamReaction[];
  attachments: TeamAttachment[];
  kind: TeamPostKind | "text";
  title: string | null;
  kudos: { to: TeamPerson; value: string } | null;
  poll: {
    options: Array<{ id: string; text: string; votes: number; voters: Array<{ id: number; name: string }> }>;
    myVote: string | null;
    total: number;
    closesAt: string | null;
    closed: boolean;
    anonymous: boolean;
  } | null;
  event: {
    startsAt: string;
    place: string;
    going: number;
    maybe: number;
    declined: number;
    mine: string | null;
    goingNames: Array<{ id: number; name: string }>;
    maybeNames: Array<{ id: number; name: string }>;
    declinedNames: Array<{ id: number; name: string }>;
  } | null;
  meeting: {
    startsAt: string;
    durationMinutes: number;
    agenda: string;
    going: number;
    maybe: number;
    declined: number;
    mine: string | null;
    joinUrl: string;
  } | null;
  pinned: boolean;
  pinnedBy: TeamPerson | null;
  saved: boolean;
  mentions: number[];
  delivery: "" | "sent" | "seen";
}

export type TeamPostKind = "announcement" | "kudos" | "poll" | "event" | "meeting";

export interface TeamAnnouncement {
  id: string;
  spaceId: string;
  title: string | null;
  body: string;
  author: TeamPerson;
  createdAt: string;
}

export interface TeamAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
  uploadedBy?: string;
  createdAt?: string;
}

export interface TeamSearchHit {
  message: TeamMessage;
  spaceId: string;
  spaceLabel: string;
  spaceKind: "channel" | "dm" | "group" | "voice";
}

export interface TeamCallEvent {
  id: string;
  userId: number;
  userName: string;
  action: "join" | "leave" | "share_on" | "share_off";
  createdAt: string;
}

export interface TeamPresence {
  userId: number;
  name: string;
  status: "online" | "away" | "offline";
  statusText: string;
  statusEmoji: string;
  dnd: boolean;
}

export interface TypingUser {
  userId: number;
  name: string;
}

export interface SpaceMember {
  userId: number;
  name: string;
  avatarUrl?: string;
  role: string;
  joinedAt: string;
  status: string;
  statusText: string;
  statusEmoji: string;
  dnd: boolean;
}

export interface SpaceDetail {
  id: string;
  kind: string;
  name: string | null;
  topic: string;
  createdAt: string;
  createdBy: TeamPerson;
  memberCount: number;
  members: SpaceMember[];
  announcements: boolean;
  private: boolean;
}

export interface TeamScheduledMessage {
  id: string;
  spaceId: string;
  body: string;
  sendAt: string;
  createdAt: string;
}

export interface SeenByEntry {
  userId: number;
  name: string;
  seenAt: string;
}

export interface ReactionDetail {
  emoji: string;
  users: Array<{ id: number; name: string }>;
}

export interface MessageInfo {
  id: string;
  createdAt: string;
  author: TeamPerson;
  seenBy: SeenByEntry[];
  notSeenBy: Array<{ id: number; name: string }>;
  reactions: ReactionDetail[];
  poll: TeamMessage["poll"];
  event: TeamMessage["event"];
}

/** The largest file the team chat accepts, the same as the server. */
export const TEAM_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const TEAM_FILE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.csv,.txt";

/** The six reactions a team uses; the server accepts only these. */
export const TEAM_EMOJI = ["👍", "❤️", "😂", "🎉", "👀", "🙏"] as const;
