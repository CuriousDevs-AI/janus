export interface TeamPerson {
  id: number;
  name: string;
}

export interface TeamSpace {
  id: string;
  kind: "channel" | "dm";
  name: string | null;
  topic: string;
  memberCount: number;
  joined: boolean;
  unread: number;
  peer: TeamPerson | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
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
}

export interface TeamAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  isImage: boolean;
}

export interface TeamSearchHit {
  message: TeamMessage;
  spaceId: string;
  spaceLabel: string;
  spaceKind: "channel" | "dm";
}

/** The largest file the team chat accepts, the same as the server. */
export const TEAM_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const TEAM_FILE_ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,.xlsx,.csv,.txt";

/** The six reactions a team uses; the server accepts only these. */
export const TEAM_EMOJI = ["👍", "❤️", "😂", "🎉", "👀", "🙏"] as const;
