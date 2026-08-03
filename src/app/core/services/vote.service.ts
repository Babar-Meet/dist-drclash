import { Injectable, effect, inject, signal } from '@angular/core';
import { ApiService, Post as ApiPost } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class VoteService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  private postsSignal = signal<ApiPost[]>([]);

  posts = this.postsSignal.asReadonly();
  voteInFlight = signal<Set<number>>(new Set());
  voteErrors = signal<Map<number, string>>(new Map());

  private reloadSignal = signal<number | null>(null);
  reloadRequested = this.reloadSignal.asReadonly();

  constructor() {
    this.watchAuth();
  }

  setServerPosts(newPosts: ApiPost[], _reqTime?: number) {
    this.postsSignal.set(newPosts);
  }

  appendServerPosts(newPosts: ApiPost[], _reqTime?: number) {
    this.postsSignal.update(current => {
      const mergedMap = new Map(current.map(p => [p.id, p]));
      for (const p of newPosts) {
        mergedMap.set(p.id, p);
      }
      return Array.from(mergedMap.values());
    });
  }

  prependServerPost(post: ApiPost) {
    this.postsSignal.update(current => [post, ...current.filter(p => p.id !== post.id)]);
  }

  async applyVote(postId: number, value: number) {
    if (!this.auth.user()) return;
    if (value !== 1 && value !== -1 && value !== 0) return;

    const currentPosts = this.postsSignal();
    const post = currentPosts.find(p => p.id === postId);
    if (!post) return;

    if (post.user_vote === value) return;

    const oldUpvotes = post.upvotes;
    const oldUserVote = post.user_vote;

    this.clearError(postId);
    const fromVote = oldUserVote ?? 0;
    let delta = 0;
    if (value === 0) delta = -fromVote;
    else if (fromVote === 0) delta = value;
    else delta = value * 2;

    this.updatePost(postId, {
      upvotes: Math.max(0, oldUpvotes + delta),
      user_vote: value === 0 ? null : value
    });

    this.voteInFlight.update(s => {
      const next = new Set(s);
      next.add(postId);
      return next;
    });

    try {
      const result = await this.api.vote(postId, value);
      this.updatePost(postId, {
        upvotes: result.upvotes,
        user_vote: result.user_vote
      });
    } catch (e: any) {
      const status = e?.status ?? 0;
      if (status === 401 || status === 403) {
        this.clearAll();
      } else {
        this.updatePost(postId, {
          upvotes: oldUpvotes,
          user_vote: oldUserVote
        });
        this.setError(postId, e?.message || 'Vote failed');
      }
    } finally {
      this.voteInFlight.update(s => {
        const next = new Set(s);
        next.delete(postId);
        return next;
      });
    }
  }

  private updatePost(postId: number, changes: Partial<ApiPost>) {
    this.postsSignal.update(posts =>
      posts.map(p => p.id === postId ? { ...p, ...changes } : p)
    );
  }

  private setError(postId: number, message: string) {
    this.voteErrors.update(m => {
      const next = new Map(m);
      next.set(postId, message);
      return next;
    });
  }

  private clearError(postId: number) {
    this.voteErrors.update(m => {
      const next = new Map(m);
      next.delete(postId);
      return next;
    });
  }

  private watchAuth() {
    let lastUserId: number | null = null;
    let initialized = false;
    effect(() => {
      const id = this.auth.user()?.id ?? null;
      if (!initialized) {
        initialized = true;
        lastUserId = id;
        return;
      }
      if (id !== lastUserId) {
        const wasNull = lastUserId === null;
        lastUserId = id;
        if (wasNull) {
          this.reloadSignal.set(Date.now());
        } else if (id === null) {
          this.clearAll();
        } else {
          this.clearAll();
          this.reloadSignal.set(Date.now());
        }
      }
    });
  }

  private clearAll() {
    this.postsSignal.update(posts =>
      posts.map(p => ({ ...p, user_vote: null }))
    );
    this.voteInFlight.set(new Set());
    this.voteErrors.set(new Map());
  }
}
