import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './core/services/auth.service';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'features-bug',
    loadComponent: () => import('./features/features-bug/features-bug.component').then(m => m.FeaturesBugComponent)
  },
  {
    path: 'privacy-policy',
    loadComponent: () => import('./features/privacy-policy/privacy-policy.component').then(m => m.PrivacyPolicyComponent)
  },
  {
    path: 'terms-conditions',
    loadComponent: () => import('./features/terms-conditions/terms-conditions.component').then(m => m.TermsConditionsComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin.component').then(m => m.AdminComponent)
  },
  {
    path: 'oauth-callback',
    loadComponent: () => import('./features/oauth-callback/oauth-callback.component').then(m => m.OauthCallbackComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
