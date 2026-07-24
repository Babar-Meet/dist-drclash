import { Injectable, inject, signal } from '@angular/core';
import { ApiService, User } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  user = signal<User | null>(null);
  loading = signal(true);

  constructor() {
    this.loadUser();
  }

  async loadUser() {
    const token = localStorage.getItem('token');
    if (!token) {
      this.loading.set(false);
      return;
    }
    try {
      const { user } = await this.api.me();
      this.user.set(user);
    } catch {
      localStorage.removeItem('token');
    }
    this.loading.set(false);
  }

  async login(email: string, password: string) {
    const { token, user } = await this.api.login(email, password);
    localStorage.setItem('token', token);
    this.user.set(user);
  }

  async adminLogin(username: string, password: string) {
    const { token, user } = await this.api.adminLogin(username, password);
    localStorage.setItem('token', token);
    this.user.set(user);
  }

  async updateProfile(username: string) {
    const { user } = await this.api.updateProfile(username);
    this.user.set(user);
  }

  async deleteAccount() {
    await this.api.deleteAccount();
    localStorage.removeItem('token');
    this.user.set(null);
  }

  logout() {
    localStorage.removeItem('token');
    this.user.set(null);
  }
}
