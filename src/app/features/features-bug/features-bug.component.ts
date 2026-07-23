import { Component } from '@angular/core';
import { ComingSoonComponent } from '../../shared/components/coming-soon.component';

@Component({
  selector: 'app-features-bug',
  imports: [ComingSoonComponent],
  template: `<app-coming-soon title="Features / Bug" description="Report bugs, request features, and track what's coming next." />`
})
export class FeaturesBugComponent {}
