import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Post as ApiPost } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DatePipe } from '@angular/common';

type FilterTab = 'all' | 'feature' | 'bug' | 'done';

interface VoteState {
  intent: number | null;
  inFlight: boolean;
  error: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  serverSnapshot: { upvotes: number; user_vote: number | null } | null;
}

@Component({
  selector: 'app-features-bug',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './features-bug.component.html',
  styleUrl: './features-bug.component.css'
})
export class FeaturesBugComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  posts = signal<ApiPost[]>([]);
  loading = signal(true);
  loadError = signal<string | null>(null);
  activeFilter = signal<FilterTab>('all');
  showForm = signal(false);
  formType: 'feature' | 'bug' = 'feature';
  formTitle = '';
  formContent = '';
  formError = '';
  submitting = signal(false);
  nextCursor: number | null = null;
  loadingMore = false;

  private voteStates = new Map<number, VoteState>();
  voteErrors = signal<Map<number, string>>(new Map());
  voteInFlight = signal<Set<number>>(new Set());

  expandedPosts = signal<Set<number>>(new Set());
  contentLimit = 200;

  ngOnInit() {
    this.loadPosts();
  }

  async loadPosts(cursor?: number) {
    if (!cursor) this.loading.set(true);
    const type = this.activeFilter() === 'all' ? undefined : this.activeFilter() === 'done' ? undefined : this.activeFilter();
    const status = this.activeFilter() === 'done' ? 'done' : 'current';

    try {
      const { posts, nextCursor } = await this.api.getPosts(type, status, cursor);
      if (cursor) {
        this.posts.set([...this.posts(), ...posts]);
      } else {
        this.posts.set(posts);
      }
      this.nextCursor = nextCursor;
    } catch {
      this.loadError.set('Failed to load posts. Check your connection.');
    }
    this.loading.set(false);
    this.loadingMore = false;
    if (!cursor) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.replayPendingVotes();
    }
  }

  private replayPendingVotes() {
    const stored = sessionStorage.getItem('pendingVotes');
    if (!stored) return;
    try {
      const pending: Record<number, number> = JSON.parse(stored);
      const postMap = new Map(this.posts().map(p => [p.id, p]));
      for (const [postIdStr, intent] of Object.entries(pending)) {
        const postId = Number(postIdStr);
        if (!postMap.has(postId)) continue;
        if (intent !== -1 && intent !== 0 && intent !== 1) continue;

        const state: VoteState = {
          intent,
          inFlight: false,
          error: null,
          timer: null,
          serverSnapshot: {
            upvotes: postMap.get(postId)!.upvotes,
            user_vote: postMap.get(postId)!.user_vote
          }
        };
        this.voteStates.set(postId, state);
        this.applyOptimistic(postId);
        this.flushVote(postId);
      }
    } catch {
      sessionStorage.removeItem('pendingVotes');
    }
  }

  private persistVoteState() {
    try {
      const pending: Record<number, number> = {};
      for (const [postId, state] of this.voteStates) {
        if (state.intent !== null) {
          pending[postId] = state.intent;
        }
      }
      if (Object.keys(pending).length > 0) {
        sessionStorage.setItem('pendingVotes', JSON.stringify(pending));
      } else {
        sessionStorage.removeItem('pendingVotes');
      }
    } catch {
      // sessionStorage quota exceeded or unavailable
    }
  }

  setFilter(tab: string) {
    this.activeFilter.set(tab as FilterTab);
    this.loadPosts();
  }

  loadMore() {
    if (this.nextCursor && !this.loadingMore) {
      this.loadingMore = true;
      this.loadPosts(this.nextCursor);
    }
  }

  vote(postId: number, value: number) {
    if (!this.auth.user()) return;

    const post = this.posts().find(p => p.id === postId);
    if (!post) return;

    if (post.user_vote === value) value = 0;

    let state = this.voteStates.get(postId);
    if (!state) {
      state = { intent: null, inFlight: false, error: null, timer: null, serverSnapshot: null };
      this.voteStates.set(postId, state);
    }

    state.error = null;
    this.voteErrors.update(m => { const n = new Map(m); n.delete(postId); return n; });

    if (!state.serverSnapshot) {
      state.serverSnapshot = { upvotes: post.upvotes, user_vote: post.user_vote };
    }

    state.intent = value;
    this.applyOptimistic(postId);
    this.persistVoteState();

    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(() => this.flushVote(postId), 300);
  }

  private applyOptimistic(postId: number) {
    const state = this.voteStates.get(postId);
    if (!state || state.intent === null || !state.serverSnapshot) return;

    const server = state.serverSnapshot;
    const intent = state.intent;
    const fromVote = server.user_vote ?? 0;
    let delta: number;

    if (intent === 0) {
      delta = -fromVote;
    } else if (fromVote === 0) {
      delta = intent;
    } else {
      delta = intent * 2;
    }

    this.posts.update(posts => posts.map(p =>
      p.id === postId
        ? { ...p, upvotes: Math.max(0, server.upvotes + delta), user_vote: intent === 0 ? null : intent }
        : p
    ));
  }

  private async flushVote(postId: number) {
    const state = this.voteStates.get(postId);
    if (!state || state.intent === null || state.inFlight) return;

    state.inFlight = true;
    this.voteInFlight.update(s => { const n = new Set(s); n.add(postId); return n; });
    state.timer = null;
    const intentSent = state.intent;

    try {
      const result = await this.api.vote(postId, intentSent);

      this.posts.update(posts => posts.map(p =>
        p.id === postId
          ? { ...p, upvotes: result.upvotes, user_vote: result.user_vote }
          : p
      ));

      state.serverSnapshot = null;

      if (state.intent !== intentSent) {
        state.inFlight = false;
        this.voteInFlight.update(s => { const n = new Set(s); n.delete(postId); return n; });
        const post = this.posts().find(p => p.id === postId);
        if (post) {
          state.serverSnapshot = { upvotes: post.upvotes, user_vote: post.user_vote };
        }
        this.flushVote(postId);
      } else {
        state.intent = null;
        state.inFlight = false;
        this.voteInFlight.update(s => { const n = new Set(s); n.delete(postId); return n; });
        this.voteStates.delete(postId);
        this.persistVoteState();
      }
    } catch (e: any) {
      state.inFlight = false;
      this.voteInFlight.update(s => { const n = new Set(s); n.delete(postId); return n; });
      state.error = e.message || 'Vote failed';
      this.voteErrors.update(m => { const n = new Map(m); n.set(postId, state.error!); return n; });
      this.persistVoteState();
      state.timer = setTimeout(() => this.flushVote(postId), 2000);
    }
  }

  toggleExpand(postId: number) {
    this.expandedPosts.update(s => {
      const next = new Set(s);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  }

  isTruncated(content: string | undefined): boolean {
    return (content || '').length > this.contentLimit;
  }

  displayContent(post: ApiPost): string {
    const content = post.content || '';
    if (this.expandedPosts().has(post.id) || content.length <= this.contentLimit) {
      return content;
    }
    return content.slice(0, this.contentLimit) + '...';
  }

  openForm(type: 'feature' | 'bug') {
    this.formType = type;
    this.formTitle = '';
    this.formContent = '';
    this.formError = '';
    this.showForm.set(true);
  }

  closeForm() {
    this.showForm.set(false);
  }

  async submitPost() {
    this.formError = '';
    this.submitting.set(true);
    try {
      const { post } = await this.api.createPost(this.formType, this.formTitle, this.formContent);
      this.posts.set([post, ...this.posts()]);
      this.closeForm();
    } catch (e: any) {
      this.formError = e.message;
    }
    this.submitting.set(false);
  }
}
