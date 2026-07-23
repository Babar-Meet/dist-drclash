import { Component } from '@angular/core';
import { ComingSoonComponent } from '../../shared/components/coming-soon.component';

@Component({
  selector: 'app-login',
  imports: [ComingSoonComponent],
  template: `<app-coming-soon title="Login" description="Sign in to your Dr.Clash account to access all features." />`
})
export class LoginComponent {}
