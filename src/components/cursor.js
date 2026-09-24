import gsap from 'gsap';
import { env } from '../core/env.js';

/**
 * Cursore custom: un punto che insegue il puntatore (quickTo, nessun tween creato per frame),
 * si ingrandisce sui link e sulla bottiglia diventa un disco con "ruota".
 * Non esiste su touch e con reduced-motion: resta il cursore del sistema.
 */
export function createCursor() {
  if (env.isTouch || env.reducedMotion) return;

  const el = document.createElement('div');
  el.className = 'cursor';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="cursor__label">ruota</span>';
  document.body.append(el);

  const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });

  let shown = false;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (!shown) {
      shown = true;
      gsap.set(el, { x: e.clientX, y: e.clientY });
      document.documentElement.classList.add('has-cursor');
    }
    xTo(e.clientX);
    yTo(e.clientY);
  });
  document.addEventListener('pointerleave', () => el.classList.add('is-out'));
  document.addEventListener('pointerenter', () => el.classList.remove('is-out'));

  // stato dal target sotto il puntatore: delega, un solo listener
  const LINK = 'a, button, [role="button"]';
  document.addEventListener('pointerover', (e) => {
    const t = e.target;
    el.classList.toggle('is-link', !!t.closest?.(LINK));
    el.classList.toggle('is-rotate', !!t.closest?.('.bottle__hit'));
  });
  document.addEventListener('pointerdown', () => el.classList.add('is-down'));
  document.addEventListener('pointerup', () => el.classList.remove('is-down'));
}
