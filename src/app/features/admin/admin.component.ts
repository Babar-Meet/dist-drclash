import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, Post } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { Router } from '@angular/router';


@Component({
  selector: 'app-admin',
  imports: [FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  private router = inject(Router);

  posts = signal<Post[]>([]);
  loading = signal(true);
  username = '';
  password = '';
  loginError = '';
  loginLoading = false;
  filterStatus = '';
  replyTexts: Record<number, string> = {};
  sendingReplies = new Set<number>();
  clearingDone = signal(false);
  editingReply: Record<number, string> = {};
  savingReply = new Set<number>();
  deletingReply = new Set<number>();

  ngOnInit() {
    if (this.auth.user()?.is_admin) {
      this.loadPosts();
    }
    this.loading.set(false);
  }

  async adminLogin() {
    this.loginError = '';
    this.loginLoading = true;
    try {
      await this.auth.adminLogin(this.username, this.password);
      this.loadPosts();
    } catch (e: any) {
      this.loginError = e.message;
    }
    this.loginLoading = false;
  }

  async loadPosts() {
    this.loading.set(true);
    try {
      const { posts } = await this.api.adminGetPosts(this.filterStatus || undefined);
      this.posts.set(posts);
    } catch {}
    this.loading.set(false);
  }

  async markDone(postId: number) {
    await this.api.adminMarkDone(postId);
    this.loadPosts();
  }

  async reopen(postId: number) {
    await this.api.adminReopen(postId);
    this.loadPosts();
  }

  async deletePost(postId: number) {
    if (!confirm('Delete this post permanently?')) return;
    await this.api.adminDeletePost(postId);
    this.loadPosts();
  }

  async adminReply(postId: number) {
    const content = this.replyTexts[postId]?.trim();
    if (!content) return;
    this.sendingReplies.add(postId);
    try {
      await this.api.adminReply(postId, content);
      this.replyTexts[postId] = '';
      this.loadPosts();
    } catch (e: any) {
      alert(e.message);
    }
    this.sendingReplies.delete(postId);
  }

  async editReply(replyId: number) {
    const content = this.editingReply[replyId]?.trim();
    if (!content) return;
    this.savingReply.add(replyId);
    try {
      await this.api.adminEditReply(replyId, content);
      delete this.editingReply[replyId];
      this.loadPosts();
    } catch (e: any) {
      alert(e.message);
    }
    this.savingReply.delete(replyId);
  }

  startEditReply(replyId: number, currentContent: string) {
    this.editingReply[replyId] = currentContent;
  }

  cancelEditReply(replyId: number) {
    delete this.editingReply[replyId];
  }

  async deleteReply(replyId: number) {
    if (!confirm('Delete this reply permanently?')) return;
    this.deletingReply.add(replyId);
    try {
      await this.api.adminDeleteReply(replyId);
      this.loadPosts();
    } catch (e: any) {
      alert(e.message);
    }
    this.deletingReply.delete(replyId);
  }

  async clearDone() {
    if (!confirm('Delete all done posts permanently?')) return;
    this.clearingDone.set(true);
    try {
      await this.api.adminClearDone();
      this.loadPosts();
    } catch (e: any) {
      alert(e.message);
    }
    this.clearingDone.set(false);
  }

  setFilter(status: string) {
    this.filterStatus = status;
    this.loadPosts();
  }

  logout() {
    this.auth.logout();
  }
}
