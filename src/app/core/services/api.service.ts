import { Injectable, inject } from '@angular/core';

const API = 'https://drclash-api.babarmeet86.workers.dev';

export interface User {
  id: number;
  email: string;
  username: string;
  is_admin: boolean;
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
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private getToken(): string | null {
    return localStorage.getItem('token');
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
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
  resetPassword(token: string, password: string) { return this.post<{ ok: boolean }>('/api/auth/reset-password', { token, password }); }

  // Posts
  getPosts(type?: string, status?: string, cursor?: number) {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    if (cursor) params.set('cursor', String(cursor));
    const qs = params.toString();
    return this.get<{ posts: Post[]; nextCursor: number | null }>(`/api/posts${qs ? '?' + qs : ''}`);
  }

  createPost(type: string, title: string, content: string) {
    return this.post<{ post: Post }>('/api/posts', { type, title, content });
  }

  // Voting
  vote(postId: number, value: number) {
    return this.post<{ upvotes: number }>('/api/vote', { post_id: postId, value });
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
}
