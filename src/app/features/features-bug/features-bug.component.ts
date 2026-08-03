import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ApiService, Post as ApiPost } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { VoteService } from '../../core/services/vote.service';
import { DatePipe } from '@angular/common';

type FilterTab = 'feature' | 'bug' | 'done';

@Component({
  selector: 'app-features-bug',
  imports: [FormsModule, DatePipe, RouterLink],
  templateUrl: './features-bug.component.html',
  styleUrl: './features-bug.component.css'
})
export class FeaturesBugComponent implements OnInit {
  private api = inject(ApiService);
  private voteService = inject(VoteService);
  private destroyRef = inject(DestroyRef);
  auth = inject(AuthService);

  posts = this.voteService.posts;
  voteErrors = this.voteService.voteErrors;
  voteInFlight = this.voteService.voteInFlight;

  loading = signal(true);
  loadError = signal<string | null>(null);
  activeFilter = signal<FilterTab>('feature');
  showForm = signal(false);
  formType: 'feature' | 'bug' = 'feature';
  formTitle = '';
  formContent = '';
  formError = '';
  submitting = signal(false);
  nextCursor: number | null = null;
  loadingMore = false;

  expandedPosts = signal<Set<number>>(new Set());
  contentLimit = 200;

  constructor() {
    toObservable(this.voteService.reloadRequested)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(postId => {
        if (postId !== null) this.loadPosts();
      });
  }

  ngOnInit() {
    this.loadPosts();
  }

  async loadPosts(cursor?: number) {
    if (!cursor) this.loading.set(true);
    const type = this.activeFilter() === 'done' ? undefined : this.activeFilter();
    const status = this.activeFilter() === 'done' ? 'done' : 'current';

    try {
      const { posts, nextCursor, reqTime } = await this.api.getPosts(type, status, cursor);
      if (cursor) {
        this.voteService.appendServerPosts(posts, reqTime);
      } else {
        this.voteService.setServerPosts(posts, reqTime);
      }
      this.nextCursor = nextCursor;
    } catch {
      this.loadError.set('Failed to load posts. Check your connection.');
    }
    this.loading.set(false);
    this.loadingMore = false;
    if (!cursor) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
    this.voteService.applyVote(postId, value);
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
      this.voteService.prependServerPost(post);
      this.closeForm();
    } catch (e: any) {
      this.formError = e.message;
    }
    this.submitting.set(false);
  }
}
