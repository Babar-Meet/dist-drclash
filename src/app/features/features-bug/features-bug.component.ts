import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Post as ApiPost } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DatePipe } from '@angular/common';

type FilterTab = 'all' | 'feature' | 'bug' | 'done';

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
  activeFilter = signal<FilterTab>('all');
  showForm = signal(false);
  formType: 'feature' | 'bug' = 'feature';
  formTitle = '';
  formContent = '';
  formError = '';
  submitting = signal(false);
  nextCursor: number | null = null;
  loadingMore = false;
  private pendingVotes = new Set<number>();

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
    } catch {}
    this.loading.set(false);
    this.loadingMore = false;
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

  async vote(postId: number, value: number) {
    if (!this.auth.user()) return;
    if (this.pendingVotes.has(postId)) return;
    const post = this.posts().find(p => p.id === postId);
    if (!post) return;

    if (post.user_vote === value) value = 0;

    const prev = { upvotes: post.upvotes, user_vote: post.user_vote };

    const delta = value === 0
      ? -(prev.user_vote ?? 0)
      : (prev.user_vote ? value * 2 : value);

    this.pendingVotes.add(postId);

    this.posts.set(this.posts().map(p =>
      p.id === postId
        ? { ...p, upvotes: Math.max(0, p.upvotes + delta), user_vote: value === 0 ? null : value }
        : p
    ));

    try {
      const { upvotes } = await this.api.vote(postId, value);
      this.posts.set(this.posts().map(p =>
        p.id === postId ? { ...p, upvotes } : p
      ));
    } catch {
      this.posts.set(this.posts().map(p =>
        p.id === postId ? { ...p, upvotes: prev.upvotes, user_vote: prev.user_vote } : p
      ));
    }

    this.pendingVotes.delete(postId);
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
