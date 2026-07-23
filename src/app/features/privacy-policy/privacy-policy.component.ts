import { Component } from '@angular/core';
import { ComingSoonComponent } from '../../shared/components/coming-soon.component';

@Component({
  selector: 'app-privacy-policy',
  imports: [ComingSoonComponent],
  template: `<app-coming-soon title="Privacy Policy" description="How we collect, use, and protect your data." />`
})
export class PrivacyPolicyComponent {}
