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
}

/** The six reactions a team uses; the server accepts only these. */
export const TEAM_EMOJI = ["👍", "❤️", "😂", "🎉", "👀", "🙏"] as const;
