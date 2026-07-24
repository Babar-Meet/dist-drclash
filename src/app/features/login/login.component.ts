import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);

  isRegister = false;
  email = '';
  username = '';
  password = '';
  error = signal('');
  success = signal('');
  loading = signal(false);

  toggleMode() {
    this.isRegister = !this.isRegister;
    this.error.set('');
    this.success.set('');
  }

  async submit() {
    this.error.set('');
    this.success.set('');
    this.loading.set(true);
    try {
      if (this.isRegister) {
        await this.api.register(this.email, this.username, this.password);
        this.success.set('Account created. You can now log in.');
        this.isRegister = false;
      } else {
        await this.auth.login(this.email, this.password);
        this.router.navigate(['/features-bug']);
      }
    } catch (e: any) {
      this.error.set(e.message);
    }
    this.loading.set(false);
  }

  googleLogin() {
    window.location.href = 'https://drclash-api.babarmeet86.workers.dev/api/auth/google';
  }

  async forgotPassword() {
    if (!this.email) {
      this.error.set('Enter your email first.');
      return;
    }
    this.loading.set(true);
    try {
      const { message } = await this.api.forgotPassword(this.email);
      this.success.set(message);
    } catch (e: any) {
      this.error.set(e.message);
    }
    this.loading.set(false);
  }
}
