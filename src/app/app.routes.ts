import { Routes } from '@angular/router';

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
    path: '**',
    redirectTo: ''
  }
];
