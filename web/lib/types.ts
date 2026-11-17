export type Role = 'student' | 'teacher' | 'admin';
export type PostType = 'talk' | 'idea' | 'complaint' | 'lost' | 'repost';
export type TicketStatus = 'accepted' | 'review' | 'resolved' | 'rejected' | 'searching' | 'found' | 'returned';
export type Category = 'cleaning' | 'furniture' | 'heat' | 'wc' | 'canteen' | 'idea' | 'lost';
export type Building = 'main' | 'b2' | 'dorm' | 'gym';

export interface User {
  id: string; name: string; handle: string; role: Role; group: string; bio: string; hue: number; followers: number;
}
export interface Me extends User { following: string[] }

export interface Official { text: string; by: string; at: number }
export interface Ticket {
  num: number | null; code?: string; category: Category; building: Building; floor: string; room: string;
  status: TicketStatus; deadline: number | null; resolvedAt: number | null; confirmedBy: string[];
  official: Official | null; overdue?: boolean;
}
export interface PollView { options: string[]; counts: number[]; myVote: number | null }

export interface Post {
  id: string; createdAt: number; authorId: string | null; anon: boolean; mine: boolean; type: PostType;
  text: string; images: string[]; quoteId: string | null; repostOf: string | null; chainOf: string | null; chainIdx: number;
  likedBy: string[]; repostedBy: string[]; ticket: Ticket | null; poll: PollView | null;
  pending?: boolean;
}
export interface Comment {
  id: string; postId: string; parentId: string | null; authorId: string | null; anon: boolean; mine: boolean;
  text: string; createdAt: number; likedBy: string[]; pending?: boolean;
}
export type NotifType = 'like' | 'reply' | 'repost' | 'quote' | 'follow' | 'status' | 'official' | 'ticket' | 'confirm';
export interface Notif {
  id: string; type: NotifType; fromId: string | null; postId: string | null;
  payload: { status?: TicketStatus; num?: number; anon?: boolean }; read: boolean; createdAt: number;
}
export interface Stats {
  total: number; open: number; solved: number; solvedPct: number; sumHours: number; n: number; avgHours: number;
  overdue: number; byCat: Record<string, { total: number; solved: number }>; byStatus: Record<string, number>;
}
export interface Bootstrap {
  me: Me | null; users: User[]; posts: Post[]; comments: Comment[]; notifications: Notif[]; stats: Stats; serverTime: number;
}

export interface DraftSegment { text: string; images: string[]; poll: { options: string[] } | null }
export interface Draft {
  type: Exclude<PostType, 'repost'>; anon: boolean; quoteId: string | null;
  category: Category; building: Building; floor: string; room: string; segments: DraftSegment[];
}

export type View =
  | { name: 'home' } | { name: 'search' } | { name: 'notif' } | { name: 'me' } | { name: 'admin' }
  | { name: 'post'; id: string; focus?: boolean } | { name: 'profile'; uid: string };
export type Sheet = { kind: 'repost' | 'share' | 'more'; id: string } | { kind: 'settings' } | null;
