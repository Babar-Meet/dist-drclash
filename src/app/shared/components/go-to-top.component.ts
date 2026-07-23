import { Component, HostListener } from '@angular/core';

@Component({
  selector: 'app-go-to-top',
  template: `
    <button
      class="go-to-top"
      [class.visible]="visible"
      (click)="scrollToTop()"
      aria-label="Go to top"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 16V4M10 4L4 10M10 4L16 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  `,
  styles: [`
    .go-to-top {
      position: fixed;
      bottom: 32px;
      right: 32px;
      width: 44px;
      height: 44px;
      border: 2px solid #0A0A0A;
      background: #FAFAFA;
      color: #0A0A0A;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 0.3s, transform 0.3s, background 0.15s;
      pointer-events: none;
      z-index: 100;
    }
    .go-to-top.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    .go-to-top:hover {
      background: #0A0A0A;
      color: #FAFAFA;
    }
  `]
})
export class GoToTopComponent {
  visible = false;

  @HostListener('window:scroll')
  onScroll() {
    this.visible = window.scrollY > 400;
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
