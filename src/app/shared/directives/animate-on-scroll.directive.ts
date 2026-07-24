import { Directive, ElementRef, inject, OnDestroy, OnInit } from '@angular/core';

@Directive({
  selector: '[animateOnScroll]'
})
export class AnimateOnScrollDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef).nativeElement as HTMLElement;
  private observer: IntersectionObserver | null = null;

  ngOnInit() {
    const rect = this.el.getBoundingClientRect();
    const isInViewport = rect.top < window.innerHeight && rect.bottom > 0;

    if (isInViewport) {
      this.el.classList.add('is-visible');
    } else {
      this.el.classList.add('will-animate');
      this.observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            this.el.classList.remove('will-animate');
            this.el.classList.add('is-visible');
            this.observer?.unobserve(this.el);
          }
        },
        { threshold: 0.1 }
      );
      this.observer.observe(this.el);
    }
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
