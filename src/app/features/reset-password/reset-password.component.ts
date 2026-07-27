import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-reset-password',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="login-page">
      <div class="login-card">
        <h1 class="login-heading">Reset Password</h1>
        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }
        @if (success()) {
          <div class="alert alert-success">{{ success() }}</div>
        }
        <form (ngSubmit)="submit()" class="login-form" novalidate>
          <label class="field">
            <span class="field-label">New Password</span>
            <input type="password" [(ngModel)]="password" name="password" placeholder="Min 6 characters" required />
          </label>
          <button type="submit" class="btn btn-primary btn-full" [disabled]="loading()">
            {{ loading() ? 'Resetting...' : 'Reset Password' }}
          </button>
        </form>
        <div class="login-footer">
          <a routerLink="/login" class="link-btn">Back to login</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-page { min-height: calc(100vh - 56px); display: flex; align-items: center; justify-content: center; padding: 48px 24px; }
    .login-card { width: 100%; max-width: 420px; border: 2px solid #E5E5E5; padding: 32px; }
    .login-heading { font-family: 'Archivo Black', Impact, 'Arial Black', sans-serif; font-size: 28px; letter-spacing: -0.02em; margin-bottom: 24px; }
    .alert { padding: 10px 14px; border: 2px solid; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 16px; }
    .alert-error { background: #FEF2F2; border-color: #EF4444; color: #EF4444; }
    .alert-success { background: #F0FDF4; border-color: #16A34A; color: #16A34A; }
    .login-form { display: flex; flex-direction: column; gap: 16px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .field-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    .field input { height: 44px; background: #FAFAFA; border: 2px solid #D4D4D4; padding: 8px 14px; font-family: 'Work Sans', sans-serif; font-size: 14px; color: #0A0A0A; outline: none; }
    .field input:focus { border-color: #0A0A0A; box-shadow: 0 0 0 2px #FAFAFA, 0 0 0 4px #0A0A0A; }
    .btn { display: inline-flex; align-items: center; justify-content: center; font-family: 'Work Sans', sans-serif; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 24px; border: 2px solid #0A0A0A; cursor: pointer; }
    .btn-full { width: 100%; }
    .btn-primary { background: #0A0A0A; color: #FAFAFA; }
    .btn-primary:hover:not(:disabled) { background: #EF4444; border-color: #EF4444; }
    .btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }
    .login-footer { display: flex; flex-direction: column; align-items: center; margin-top: 20px; font-size: 13px; color: #525252; }
    .link-btn { background: none; border: none; color: #0A0A0A; font-weight: 700; text-decoration: underline; cursor: pointer; padding: 0; }
  `]
})
export class ResetPasswordComponent {
  private api = inject(ApiService);
  private router = inject(Router);

  password = '';
  error = signal('');
  success = signal('');
  loading = signal(false);

  async submit() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (!token) {
      this.error.set('Missing reset token. Use the link from your email.');
      return;
    }
    this.error.set('');
    this.success.set('');
    this.loading.set(true);
    // Clear token from URL immediately
    window.history.replaceState({}, '', window.location.pathname);
    try {
      const { message } = await this.api.resetPassword(token, this.password);
      this.success.set(message);
    } catch (e: any) {
      this.error.set(e.message);
    }
    this.loading.set(false);
  }
}
