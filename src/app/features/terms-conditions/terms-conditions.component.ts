import { Component } from '@angular/core';
import { ComingSoonComponent } from '../../shared/components/coming-soon.component';

@Component({
  selector: 'app-terms-conditions',
  imports: [ComingSoonComponent],
  template: `<app-coming-soon title="Terms & Conditions" description="The rules and guidelines for using Dr.Clash." />`
})
export class TermsConditionsComponent {}
