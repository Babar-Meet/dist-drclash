import { Directive, ElementRef, inject, OnDestroy, OnInit } from '@angular/core';

@Directive({
  selector: '[animateOnScroll]'
})
export class AnimateOnScrollDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef).nativeElement as HTMLElement;
  private observer: IntersectionObserver | null = null;

  ngOnInit() {
    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          this.el.classList.add('is-visible');
          this.observer?.unobserve(this.el);
        }
      },
      { threshold: 0.15 }
    );
    this.observer.observe(this.el);
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
