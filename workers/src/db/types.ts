export interface User {
  id: number;
  email: string;
  username: string;
  password_hash: string | null;
  oauth_google_id: string | null;
  is_admin: number;
  created_at: string;
}

export interface Post {
  id: number;
  user_id: number;
  type: 'feature' | 'bug';
  status: 'current' | 'done';
  title: string;
  content: string;
  upvotes: number;
  created_at: string;
}

export interface Vote {
  id: number;
  post_id: number;
  user_id: number;
  value: 1 | -1;
  created_at: string;
}

export interface PostWithVote extends Post {
  username: string;
  user_vote: number | null;
}

export type PostType = 'feature' | 'bug';
export type PostStatus = 'current' | 'done';
export type VoteValue = 1 | -1;
