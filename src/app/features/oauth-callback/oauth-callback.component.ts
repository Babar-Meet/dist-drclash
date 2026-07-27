import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-oauth-callback',
  template: `<div class="loading">Completing sign in...</div>`,
  styles: [`.loading { text-align: center; padding: 96px 24px; font-size: 14px; color: #A3A3A3; }`]
})
export class OauthCallbackComponent implements OnInit {
  private router = inject(Router);
  private auth = inject(AuthService);

  ngOnInit() {
    const hash = window.location.hash;
    let token: string | null = null;
    if (hash) {
      const hashParams = new URLSearchParams(hash.slice(1));
      token = hashParams.get('token');
    }
    // Clean URL immediately
    window.history.replaceState({}, '', window.location.pathname);
    if (token) {
      sessionStorage.setItem('token', token);
      this.auth.initFromToken(token).then(() => {
        this.router.navigate(['/features-bug']);
      });
    } else {
      this.router.navigate(['/login']);
    }
  }
}
