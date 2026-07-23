import { Component, input } from '@angular/core';

@Component({
  selector: 'app-coming-soon',
  template: `
    <section class="coming-soon">
      <span class="overline">Coming Soon</span>
      <h1 class="title">{{ title() }}</h1>
      <p class="description">{{ description() }}</p>
    </section>
  `,
  styles: [`
    .coming-soon {
      padding: 120px 24px;
      max-width: 600px;
      margin: 0 auto;
      text-align: center;
    }
    .overline {
      font-family: 'Work Sans', sans-serif;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #EF4444;
      display: block;
      margin-bottom: 16px;
    }
    .title {
      font-family: 'Archivo Black', Impact, 'Arial Black', sans-serif;
      font-size: 38px;
      line-height: 1.1;
      letter-spacing: -0.02em;
      color: #0A0A0A;
      margin: 0 0 16px;
    }
    .description {
      font-family: 'Work Sans', sans-serif;
      font-size: 16px;
      line-height: 1.7;
      color: #525252;
      margin: 0;
    }
  `]
})
export class ComingSoonComponent {
  readonly title = input('');
  readonly description = input('This page is under construction. Check back soon.');
}
