import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { env } from './env.js';

gsap.registerPlugin(ScrollTrigger);

let lenis = null;

/**
 * Lenis + ScrollTrigger con un solo requestAnimationFrame:
 * il ticker di GSAP guida Lenis, Lenis notifica ScrollTrigger.
 * Con reduced-motion resta lo scroll nativo.
 */
export function initScroll() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  if (env.reducedMotion) return null;

  lenis = new Lenis({
    duration: 1.15,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // expo.out
    smoothWheel: true,
    // lenis@1.1.0 chiama options.prevent() anche quando è il default `false`: serve una funzione
    prevent: () => false,
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

export function lockScroll() {
  lenis?.stop();
  document.documentElement.classList.add('is-locked');
}

export function unlockScroll() {
  document.documentElement.classList.remove('is-locked');
  lenis?.start();
}

/** Scroll programmatico coerente: Lenis se c'è, altrimenti nativo (istantaneo con reduced-motion). */
export function scrollToTarget(selector) {
  if (lenis) {
    lenis.scrollTo(selector, { duration: 2.2 });
    return;
  }
  document.querySelector(selector)?.scrollIntoView({ behavior: env.reducedMotion ? 'auto' : 'smooth' });
}

export { gsap, ScrollTrigger };
