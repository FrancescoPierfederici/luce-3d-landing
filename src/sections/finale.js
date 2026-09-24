import { gsap, ScrollTrigger, scrollToTarget } from '../core/scroll.js';
import { env } from '../core/env.js';

/**
 * Finale: la bottiglia 3D torna al centro (stesso renderer e stessa scena della sezione bottiglia),
 * CTA con bottone magnetico, footer.
 */
export function createFinale(root, { getBottle }) {
  const cta = root.querySelector('.finale__cta');
  const ctaLabel = cta.querySelector('.finale__cta-label');
  let progress = 0;

  cta.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToTarget('#bottiglia');
  });

  // ── 3D: si attiva con la sezione in vista ──
  let unsub = null;
  ScrollTrigger.create({
    trigger: root,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => (progress = self.progress),
    onToggle: async (self) => {
      frame.lastTop = null; // al rientro la dissolvenza del canvas va ricalcolata
      const bottle = await getBottle();
      bottle.stage.setActive('finale', self.isActive);
      if (self.isActive && !unsub) unsub = bottle.stage.onFrame((dt) => frame(bottle, dt));
      if (self.isActive) bottle.scene.setMode('finale');
    },
  });

  function frame({ stage, scene }, dt) {
    if (!stage.users.has('finale')) return;
    const rect = root.getBoundingClientRect();
    // mezzo giro legato allo scroll + una rotazione lenta continua: a fine pagina resta viva
    frame.idle = (frame.idle ?? 0) + (env.reducedMotion ? 0 : dt * 0.18);
    scene.setSpin(Math.PI * 2 + progress * Math.PI + frame.idle);
    scene.update(dt, rect.top);
    if (rect.top !== frame.lastTop) {
      frame.lastTop = rect.top;
      stage.invalidate();
      const vh = window.innerHeight;
      stage.canvas.style.opacity = gsap.utils.clamp(0, 1, (vh - rect.top) / (vh * 0.8)).toFixed(3);
    }
  }

  // ── bottone magnetico (solo puntatori fini) ──
  if (!env.isTouch && !env.reducedMotion) {
    const xTo = gsap.quickTo(cta, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(cta, 'y', { duration: 0.6, ease: 'power3.out' });
    const lxTo = gsap.quickTo(ctaLabel, 'x', { duration: 0.6, ease: 'power3.out' });
    const lyTo = gsap.quickTo(ctaLabel, 'y', { duration: 0.6, ease: 'power3.out' });
    const zone = root.querySelector('.finale__magnet');
    zone.addEventListener('pointermove', (e) => {
      const r = cta.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2 - gsap.getProperty(cta, 'x'));
      const dy = e.clientY - (r.top + r.height / 2 - gsap.getProperty(cta, 'y'));
      xTo(dx * 0.35);
      yTo(dy * 0.35);
      lxTo(dx * 0.15); // l'etichetta si muove un po' di più del bottone: profondità
      lyTo(dy * 0.15);
    });
    zone.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
      lxTo(0);
      lyTo(0);
    });
  }
}
