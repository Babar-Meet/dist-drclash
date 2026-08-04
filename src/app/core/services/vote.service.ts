import { Injectable, effect, inject, signal } from '@angular/core';
import { ApiService, Post as ApiPost } from './api.service';
import { AuthService } from './auth.service';

interface VoteState {
  upvotes: number;
  raw_upvotes: number;
  user_vote: number | null;
}

@Injectable({ providedIn: 'root' })
export class VoteService {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  private postsSignal = signal<ApiPost[]>([]);

  posts = this.postsSignal.asReadonly();
  voteInFlight = signal<Set<number>>(new Set());
  voteErrors = signal<Map<number, string>>(new Map());

  // Single source of truth for what the server last confirmed per post.
  private confirmedVotes = new Map<number, VoteState>();
  // Latest desired value not yet sent to the server (click coalescing).
  private pendingVotes = new Map<number, number>();
  // Posts currently running a request-drain loop.
  private draining = new Set<number>();
  // When each post last had vote activity, used to discard stale list
  // responses that were issued before a vote.
  private lastVoteAt = new Map<number, number>();

  private reloadSignal = signal<number | null>(null);
  reloadRequested = this.reloadSignal.asReadonly();

  constructor() {
    this.watchAuth();
  }

  setServerPosts(newPosts: ApiPost[], reqTime?: number) {
    this.adopt(newPosts, reqTime);
  }

  appendServerPosts(newPosts: ApiPost[], reqTime?: number) {
    const current = this.postsSignal();
    for (const p of newPosts) {
      if (!this.isStaleForVote(p.id, reqTime)) {
        this.confirmServerPost(p);
      }
    }
    this.postsSignal.set(
      this.mergeSubmitted(current, newPosts.map(p => this.mergeServerPost(p, reqTime)))
    );
  }

  prependServerPost(post: ApiPost) {
    this.confirmServerPost(post);
    this.postsSignal.update(current => [post, ...current.filter(p => p.id !== post.id)]);
  }

  applyVote(postId: number, value: number): void {
    if (!this.auth.user()) return;
    if (value !== 1 && value !== -1 && value !== 0) return;

    const post = this.postsSignal().find(p => p.id === postId);
    if (!post) return;
    if (post.user_vote === value) return;
    if (value === 0 && !post.user_vote) return;

    const oldUpvotes = post.upvotes;
    const oldRaw = post.raw_upvotes ?? post.upvotes;
    const fromVote = post.user_vote ?? 0;
    let delta = 0;
    if (value === 0) delta = -fromVote;
    else if (fromVote === 0) delta = value;
    else delta = value * 2;

    // Base optimistic math on the raw (unfloored) sum so a post whose true
    // total is negative never briefly overshoots to a wrong positive.
    const optimisticRaw = oldRaw + delta;

    this.clearError(postId);
    this.updatePost(postId, {
      upvotes: Math.max(0, optimisticRaw),
      raw_upvotes: optimisticRaw,
      user_vote: value === 0 ? null : value
    });

    // Mark vote activity so stale list responses issued before this click are
    // discarded (prevents "count flips back after a slow list arrives").
    this.lastVoteAt.set(postId, Date.now());

    // Serialize: queue the latest intent; the drain loop sends it after any
    // in-flight request for this post resolves. This prevents out-of-order
    // responses and double-deltas from rapid clicks.
    this.pendingVotes.set(postId, value);
    this.syncFlight(postId);
    void this.drain(postId);
  }

  private async drain(postId: number): Promise<void> {
    if (this.draining.has(postId)) return;
    this.draining.add(postId);
    try {
      while (this.pendingVotes.has(postId)) {
        const value = this.pendingVotes.get(postId)!;
        this.pendingVotes.delete(postId);
        this.setFlight(postId, true);
        try {
          const result = await this.api.vote(postId, value);
          this.confirmedVotes.set(postId, {
            upvotes: result.upvotes,
            raw_upvotes: result.raw_upvotes ?? result.upvotes,
            user_vote: result.user_vote
          });
          // Only publish the server truth if no newer intent is queued; when a
          // follow-up click exists the optimistic state already reflects it.
          if (!this.pendingVotes.has(postId)) {
            this.updatePost(postId, {
              upvotes: Math.max(0, result.upvotes),
              raw_upvotes: result.raw_upvotes ?? result.upvotes,
              user_vote: result.user_vote
            });
          }
        } catch (e: any) {
          const status = e?.status ?? 0;
          if (status === 401 || status === 403) {
            this.clearAll();
          } else {
            this.pendingVotes.delete(postId);
            this.revertToConfirmed(postId);
            this.setError(postId, e?.message || 'Vote failed');
          }
          break;
        } finally {
          this.setFlight(postId, false);
        }
      }
    } finally {
      this.draining.delete(postId);
      this.syncFlight(postId);
    }
  }

  private adopt(newPosts: ApiPost[], reqTime?: number) {
    for (const p of newPosts) {
      if (!this.isStaleForVote(p.id, reqTime)) {
        this.confirmServerPost(p);
      }
    }
    this.postsSignal.set(newPosts.map(p => this.mergeServerPost(p, reqTime)));
  }

  private isStaleForVote(postId: number, reqTime?: number): boolean {
    if (!reqTime) return false;
    const ts = this.lastVoteAt.get(postId);
    return ts !== undefined && ts > reqTime;
  }

  private mergeServerPost(p: ApiPost, reqTime?: number): ApiPost {
    // A slow list response must not visually revert a vote that is still
    // optimistically pending/in flight, or whose activity started after the
    // list request was issued. Keep the displayed values in those cases; the
    // drain loop publishes the authoritative server state when it settles.
    const current = this.postsSignal().find(x => x.id === p.id);
    if (this.pendingVotes.has(p.id) || this.draining.has(p.id) || this.isStaleForVote(p.id, reqTime)) {
      if (current) return { ...p, upvotes: current.upvotes, user_vote: current.user_vote };
    }
    return p;
  }

  private confirmServerPost(post: ApiPost) {
    this.confirmedVotes.set(post.id, {
      upvotes: post.upvotes,
      raw_upvotes: post.raw_upvotes ?? post.upvotes,
      user_vote: post.user_vote
    });
  }

  private mergeSubmitted(existing: ApiPost[], incoming: ApiPost[]): ApiPost[] {
    if (incoming.length === 0) return existing;
    const mergedMap = new Map(existing.map(p => [p.id, p]));
    for (const p of incoming) {
      mergedMap.set(p.id, p);
    }
    return Array.from(mergedMap.values());
  }

  private revertToConfirmed(postId: number) {
    const confirmed = this.confirmedVotes.get(postId);
    if (confirmed) {
      this.updatePost(postId, {
        upvotes: Math.max(0, confirmed.upvotes),
        raw_upvotes: confirmed.raw_upvotes,
        user_vote: confirmed.user_vote
      });
    }
  }

  private updatePost(postId: number, changes: Partial<ApiPost>) {
    this.postsSignal.update(posts =>
      posts.map(p => p.id === postId ? { ...p, ...changes } : p)
    );
  }

  private setFlight(postId: number, value: boolean) {
    this.voteInFlight.update(s => {
      const next = new Set(s);
      if (value) next.add(postId);
      else next.delete(postId);
      return next;
    });
  }

  private syncFlight(postId: number) {
    const busy = this.draining.has(postId) || this.pendingVotes.has(postId);
    this.setFlight(postId, busy);
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
    this.confirmedVotes.clear();
    this.pendingVotes.clear();
    this.draining.clear();
    this.lastVoteAt.clear();
    this.postsSignal.update(posts =>
      posts.map(p => ({ ...p, user_vote: null }))
    );
    this.voteInFlight.set(new Set());
    this.voteErrors.set(new Map());
  }
}