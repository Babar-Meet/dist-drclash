import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { ApiService, Post as ApiPost } from './api.service';
import { AuthService } from './auth.service';

const OUTBOX_KEY = 'pendingVotes';
const DEBOUNCE_MS = 300;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;

type VoteIntent = 1 | -1 | 0;

@Injectable({ providedIn: 'root' })
export class VoteService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  private serverPosts = signal<ApiPost[]>([]);
  private intents = signal<Map<number, VoteIntent>>(new Map());
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private retryTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private retryAttempts = new Map<number, number>();
  private inFlight = new Set<number>();
  private memoryStorage = new Map<string, string>();
  private reloadSignal = signal<number | null>(null);

  /** Merged display list: server truth plus pending optimistic intents. */
  posts = computed(() => this.merge(this.serverPosts(), this.intents()));
  voteInFlight = signal<Set<number>>(new Set());
  voteErrors = signal<Map<number, string>>(new Map());
  reloadRequested = this.reloadSignal.asReadonly();

  constructor() {
    this.watchAuth();
    this.hydrate();
    this.bindGlobalEvents();
  }

  setServerPosts(posts: ApiPost[]) {
    this.serverPosts.set(posts);
  }

  appendServerPosts(posts: ApiPost[]) {
    this.serverPosts.update(list => {
      const merged = new Map(list.map(p => [p.id, p]));
      for (const p of posts) merged.set(p.id, p);
      return Array.from(merged.values());
    });
  }

  prependServerPost(post: ApiPost) {
    this.serverPosts.update(list => [post, ...list.filter(p => p.id !== post.id)]);
  }

  applyVote(postId: number, value: number) {
    if (!this.auth.user()) return;
    if (value !== 1 && value !== -1) return;

    const current = this.intents().get(postId) ?? this.currentServerVote(postId);
    const intent: VoteIntent = current === value ? 0 : value;

    this.intents.update(m => {
      const next = new Map(m);
      next.set(postId, intent);
      return next;
    });
    this.voteErrors.update(m => {
      const next = new Map(m);
      next.delete(postId);
      return next;
    });
    this.persistOutbox();
    this.scheduleFlush(postId);
  }

  private currentServerVote(postId: number): number | null {
    return this.serverPosts().find(p => p.id === postId)?.user_vote ?? null;
  }

  private merge(list: ApiPost[], intents: Map<number, VoteIntent>): ApiPost[] {
    if (intents.size === 0) return list;
    return list.map(p => {
      const intent = intents.get(p.id);
      if (intent === undefined) return p;
      const fromVote = p.user_vote ?? 0;
      let delta: number;
      if (intent === 0) {
        delta = -fromVote;
      } else if (fromVote === 0) {
        delta = intent;
      } else {
        delta = intent * 2;
      }
      return {
        ...p,
        upvotes: Math.max(0, p.upvotes + delta),
        user_vote: intent === 0 ? null : intent,
      };
    });
  }

  private scheduleFlush(postId: number) {
    const existing = this.timers.get(postId);
    if (existing) clearTimeout(existing);
    const retry = this.retryTimers.get(postId);
    if (retry) {
      clearTimeout(retry);
      this.retryTimers.delete(postId);
    }
    const timer = setTimeout(() => this.flush(postId), DEBOUNCE_MS);
    this.timers.set(postId, timer);
  }

  private async flush(postId: number) {
    this.timers.delete(postId);
    this.retryTimers.delete(postId);
    if (this.inFlight.has(postId)) return;

    const intent = this.intents().get(postId);
    if (intent === undefined) return;

    this.inFlight.add(postId);
    this.voteInFlight.update(s => {
      const next = new Set(s);
      next.add(postId);
      return next;
    });

    try {
      const result = await this.api.vote(postId, intent);
      const latest = this.intents().get(postId);

      if (latest !== intent) {
        this.applyServerResult(postId, result.upvotes, result.user_vote);
        this.scheduleFlush(postId);
        return;
      }

      this.applyServerResult(postId, result.upvotes, result.user_vote);
      this.intents.update(m => {
        const next = new Map(m);
        next.delete(postId);
        return next;
      });
      this.retryAttempts.delete(postId);
      this.clearError(postId);
      this.persistOutbox();
    } catch (e: any) {
      this.handleError(postId, e);
    } finally {
      this.inFlight.delete(postId);
      this.voteInFlight.update(s => {
        const next = new Set(s);
        next.delete(postId);
        return next;
      });
    }
  }

  private applyServerResult(postId: number, upvotes: number, userVote: number | null) {
    this.serverPosts.update(list =>
      list.map(p => (p.id === postId ? { ...p, upvotes, user_vote: userVote } : p))
    );
  }

  private handleError(postId: number, e: any) {
    const status = e?.status ?? 0;

    if (status === 400) {
      this.dropIntent(postId);
      this.setError(postId, e?.message || 'Vote failed');
      this.persistOutbox();
      return;
    }
    if (status === 404) {
      this.dropIntent(postId);
      this.setError(postId, e?.message || 'Vote failed');
      this.reloadSignal.set(postId);
      this.persistOutbox();
      return;
    }
    if (status === 401 || status === 403) {
      this.clearAll();
      return;
    }

    this.setError(postId, e?.message || 'Vote failed');
    const delay = this.nextBackoff(postId, e?.retryAfter);
    const timer = setTimeout(() => this.flush(postId), delay);
    this.retryTimers.set(postId, timer);
  }

  private nextBackoff(postId: number, retryAfter?: string | null): number {
    const attempts = this.retryAttempts.get(postId) ?? 0;
    this.retryAttempts.set(postId, attempts + 1);

    if (retryAfter) {
      const secs = Number(retryAfter);
      if (Number.isFinite(secs) && secs > 0) {
        return Math.min(secs * 1000, BACKOFF_MAX_MS);
      }
    }
    const base = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempts), BACKOFF_MAX_MS);
    return Math.round(base + Math.random() * base * 0.25);
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

  private dropIntent(postId: number) {
    this.intents.update(m => {
      const next = new Map(m);
      next.delete(postId);
      return next;
    });
    const timer = this.timers.get(postId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(postId);
    }
    const retry = this.retryTimers.get(postId);
    if (retry) {
      clearTimeout(retry);
      this.retryTimers.delete(postId);
    }
    this.retryAttempts.delete(postId);
  }

  private hydrate() {
    const stored = this.readOutbox();
    if (!stored) return;
    for (const [postIdStr, intent] of Object.entries(stored)) {
      const postId = Number(postIdStr);
      if (!Number.isFinite(postId)) continue;
      if (intent !== -1 && intent !== 0 && intent !== 1) continue;

      this.intents.update(m => {
        const next = new Map(m);
        next.set(postId, intent as VoteIntent);
        return next;
      });
      this.scheduleFlush(postId);
    }
  }

  private persistOutbox() {
    const pending: Record<number, VoteIntent> = {};
    for (const [postId, intent] of this.intents()) {
      pending[postId] = intent;
    }
    if (Object.keys(pending).length > 0) {
      this.storageSet(OUTBOX_KEY, JSON.stringify(pending));
    } else {
      this.storageRemove(OUTBOX_KEY);
    }
  }

  private readOutbox(): Record<number, VoteIntent> | null {
    const raw = this.storageGet(OUTBOX_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private storageGet(key: string): string | null {
    try {
      const val = window.localStorage.getItem(key);
      if (val !== null) return val;
    } catch {
      // storage unavailable (Safari private mode) - fall through to memory
    }
    return this.memoryStorage.get(key) ?? null;
  }

  private storageSet(key: string, value: string) {
    this.memoryStorage.set(key, value);
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // storage unavailable - memory mirror already holds the value
    }
  }

  private storageRemove(key: string) {
    this.memoryStorage.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // storage unavailable - nothing to clear
    }
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
        lastUserId = id;
        this.clearAll();
      }
    });
  }

  private clearAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    for (const t of this.retryTimers.values()) clearTimeout(t);
    this.timers.clear();
    this.retryTimers.clear();
    this.retryAttempts.clear();
    this.inFlight.clear();
    this.intents.set(new Map());
    this.voteInFlight.set(new Set());
    this.voteErrors.set(new Map());
    this.storageRemove(OUTBOX_KEY);
  }

  private onOnline = () => {
    for (const postId of this.intents().keys()) this.scheduleFlush(postId);
  };

  private onVisibility = () => {
    if (document.visibilityState === 'visible') {
      for (const postId of this.intents().keys()) this.scheduleFlush(postId);
    } else {
      this.persistOutbox();
    }
  };

  private onPageHide = () => {
    this.persistOutbox();
  };

  private bindGlobalEvents() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', this.onOnline);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', this.onOnline);
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.onPageHide);
    });
  }
}
