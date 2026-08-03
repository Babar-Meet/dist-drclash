import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface User {
  id: number;
  email: string;
  username: string;
  is_admin: boolean;
}

export interface Reply {
  id: number;
  post_id: number;
  content: string;
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
  username: string;
  user_vote: number | null;
  created_at: string;
  replies?: Reply[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private getToken(): string | null {
    return sessionStorage.getItem('token');
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err: any = new Error(data?.error || 'Request failed');
      if (data?.code) err.code = data.code;
      err.status = res.status;
      err.retryAfter = res.headers?.get('Retry-After') ?? null;
      throw err;
    }
    return data;
  }

  get<T>(path: string) { return this.request<T>('GET', path); }
  post<T>(path: string, body?: any) { return this.request<T>('POST', path, body); }
  put<T>(path: string, body?: any) { return this.request<T>('PUT', path, body); }
  delete<T>(path: string) { return this.request<T>('DELETE', path); }

  // Auth
  login(email: string, password: string) { return this.post<{ token: string; user: User }>('/api/auth/login', { email, password }); }
  register(email: string, username: string, password: string) { return this.post<{ ok: boolean }>('/api/auth/register', { email, username, password }); }
  me() { return this.get<{ user: User | null }>('/api/auth/me'); }
  forgotPassword(email: string) { return this.post<{ message: string }>('/api/auth/forgot-password', { email }); }
  resetPassword(token: string, password: string) { return this.post<{ message: string }>('/api/auth/reset-password', { token, password }); }

  // Posts
  getPosts(type?: string, status?: string, cursor?: number) {
    const reqTime = Date.now();
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (cursor) params.set('cursor', String(cursor));
    const qs = params.toString();
    return this.get<{ posts: Post[]; nextCursor: number | null }>(`/api/posts${qs ? '?' + qs : ''}`).then(res => ({ ...res, reqTime }));
  }

  createPost(type: string, title: string, content: string) {
    return this.post<{ post: Post }>('/api/posts', { type, title, content });
  }

  // Voting
  vote(postId: number, value: number) {
    return this.post<{ upvotes: number; user_vote: number | null }>('/api/vote', { post_id: postId, value });
  }

  // Profile
  updateProfile(username: string) { return this.put<{ user: User }>('/api/auth/profile', { username }); }
  deleteAccount() { return this.delete<{ ok: boolean }>('/api/auth/account'); }

  // Admin
  adminLogin(username: string, password: string) {
    return this.post<{ token: string; user: User }>('/api/admin/login', { username, password });
  }
  adminGetPosts(status?: string) {
    const qs = status ? `?status=${status}` : '';
    return this.get<{ posts: Post[] }>(`/api/admin/posts${qs}`);
  }
  adminMarkDone(postId: number) { return this.put<{ ok: boolean }>(`/api/admin/posts/${postId}/done`); }
  adminReopen(postId: number) { return this.put<{ ok: boolean }>(`/api/admin/posts/${postId}/reopen`); }
  adminDeletePost(postId: number) { return this.delete<{ ok: boolean }>(`/api/admin/posts/${postId}`); }
  adminReply(postId: number, content: string) { return this.post<{ reply: Reply }>(`/api/admin/posts/${postId}/reply`, { content }); }
  adminEditReply(replyId: number, content: string) { return this.put<{ reply: Reply }>(`/api/admin/replies/${replyId}`, { content }); }
  adminDeleteReply(replyId: number) { return this.delete<{ ok: boolean }>(`/api/admin/replies/${replyId}`); }
  adminClearDone() { return this.delete<{ ok: boolean }>('/api/admin/posts/done'); }

  // Replies
  getReplies(postId: number) { return this.get<{ replies: Reply[] }>(`/api/posts/${postId}/replies`); }
}
