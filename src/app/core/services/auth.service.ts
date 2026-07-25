import { Injectable, inject, signal } from '@angular/core';
import { ApiService, User } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  user = signal<User | null>(null);
  loading = signal(true);
  private _token: string | null = null;

  constructor() {
    this.loadUser();
  }

  private getToken(): string | null {
    if (this._token) return this._token;
    const saved = sessionStorage.getItem('token');
    if (saved) this._token = saved;
    return saved;
  }

  private setToken(token: string | null) {
    this._token = token;
    if (token) sessionStorage.setItem('token', token);
    else sessionStorage.removeItem('token');
  }

  async initFromToken(token: string) {
    this.setToken(token);
    try {
      const { user } = await this.api.me();
      this.user.set(user);
    } catch {
      this.setToken(null);
    }
  }

  async loadUser() {
    const token = this.getToken();
    if (!token) {
      this.loading.set(false);
      return;
    }
    try {
      const { user } = await this.api.me();
      this.user.set(user);
    } catch {
      this.setToken(null);
    }
    this.loading.set(false);
  }

  async login(email: string, password: string) {
    const { token, user } = await this.api.login(email, password);
    this.setToken(token);
    this.user.set(user);
  }

  async adminLogin(username: string, password: string) {
    const { token, user } = await this.api.adminLogin(username, password);
    this.setToken(token);
    this.user.set(user);
  }

  async updateProfile(username: string) {
    const { user } = await this.api.updateProfile(username);
    this.user.set(user);
  }

  async deleteAccount() {
    await this.api.deleteAccount();
    this.setToken(null);
    this.user.set(null);
  }

  logout() {
    this.setToken(null);
    this.user.set(null);
  }
}
